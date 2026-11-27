import { deleteSecret, readJson, readSecret, writeJson, writeSecret } from './storage';
import { TAG_COLORS } from './theme';

// 'de' when the first preferred language is German, else 'en'
export const deviceLanguage = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('de') ? 'de' : 'en';
  } catch {
    return 'en';
  }
};

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

// Mirrors docs/api.md
export type Signal = { type: string; label: string; value: string };
export type Recommendation = {
  wish: string;
  product_name: string;
  action: 'buy' | 'wait' | 'alternative';
  reason: string;
  price_eur: number | null;
  shipping_eur: number | null;
  total_eur: number | null;
  merchant: string | null;
  offer_url: string | null;
  image_url: string | null;
  available: boolean | null;
  delivery_estimate: string | null;
  signals: Signal[];
};
export type Understood = { summary: string; interests: string[]; candidates: { idea: string; why: string }[] };
export type Result = {
  id: string;
  status: 'recommendation' | 'needs_clarification' | 'ideas_only';
  reply?: string | null;
  understood?: Understood | null;
  top: Recommendation | null;
  alternatives: Recommendation[];
  uncertainty: { reasons: string[]; question: string } | null;
  model: string;
};

// photo: the picked image's local file, shown in the thread while the file still exists
export type Msg = { role: 'user'; text: string; photo?: string } | { role: 'agent'; result: Result };
export type Person = {
  id: string;
  name: string;
  occasion: string;
  budget: number;
  color: string;
  messages: Msg[];
  lastResultId: string | null;
  pins: Pin[];
  // a friend added from their profile link; wishes are the last copy of their shared list
  friendSlug?: string;
  wishes?: Wish[];
  // ms of the last change, used to merge with the account
  updatedAt?: number;
};

// A pinned product: a small snapshot of a recommendation, kept on the person
export type Product = Pick<Recommendation, 'product_name' | 'total_eur' | 'price_eur' | 'shipping_eur' | 'merchant' | 'offer_url' | 'image_url' | 'delivery_estimate'>;
export type Pin = Product & { pinnedAt: number; resultId: string };
// Same product: same offer link, or same name when there is no link
export const samePin = (a: Product, b: Product) => (a.offer_url || b.offer_url ? a.offer_url === b.offer_url : a.product_name === b.product_name);
export const isPinned = (p: Person, item: Product) => p.pins.some((x) => samePin(x, item));
export const togglePin = (p: Person, item: Product, resultId: string): Person =>
  isPinned(p, item)
    ? { ...p, pins: p.pins.filter((x) => !samePin(x, item)) }
    : {
        ...p,
        pins: [
          ...p.pins,
          {
            product_name: item.product_name,
            total_eur: item.total_eur,
            price_eur: item.price_eur,
            shipping_eur: item.shipping_eur,
            merchant: item.merchant,
            offer_url: item.offer_url,
            image_url: item.image_url,
            delivery_estimate: item.delivery_estimate,
            pinnedAt: Date.now(),
            resultId,
          },
        ],
      };

// What the agent says for a turn; older backends send no `reply`
export const sayOf = (r: Result) =>
  r.reply || (r.status === 'recommendation' ? r.top?.reason : r.uncertainty?.question) || r.top?.reason || 'I could not find anything yet. Tell me a bit more.';

export const lastResult = (p: Person) => {
  for (let i = p.messages.length - 1; i >= 0; i--) {
    const m = p.messages[i];
    if (m.role === 'agent') return m.result;
  }
  return null;
};

// wishloop://results/{id}
export const idFromUrl = (url: string | null) => url?.match(/results\/([^/?#]+)/)?.[1] ?? null;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// The signed-in session: token in the keychain (web: localStorage), e-mail beside it
export type Session = { token: string; email: string };
export const SESSION_KEY = 'session';
// undefined = not read yet; the in-memory copy is authoritative, so a sign-out stops requests at once
// and a keychain that refuses to write still keeps the session until the app restarts
let memory: Session | null | undefined;
export const getSession = (): Session | null => {
  if (memory !== undefined) return memory;
  try {
    const s = JSON.parse(readSecret(SESSION_KEY) ?? 'null');
    memory = s && typeof s.token === 'string' ? s : null;
  } catch {
    memory = null;
  }
  return memory!;
};
// Returns false when the session could not be stored for the next app start
export const setSession = (s: Session): boolean => {
  memory = s;
  const raw = JSON.stringify(s);
  writeSecret(SESSION_KEY, raw);
  return readSecret(SESSION_KEY) === raw;
};
export const clearSession = () => {
  memory = null;
  deleteSecret(SESSION_KEY);
};

// Called when the server rejects the token (401): the account module signs out
let onSessionLost: () => void = () => {};
export const setSessionLostHandler = (fn: () => void) => {
  onSessionLost = fn;
};

// JSON call to the backend; sends the Bearer token when signed in (auth: false for the public sign-in calls)
export async function call<T = unknown>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const token = auth ? getSession()?.token : undefined;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(API_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(`I can't reach the server (${API_URL}).`, 0);
  }
  if (res.status === 401 && token) onSessionLost();
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const err = new ApiError(typeof data?.detail === 'string' ? data.detail : `The server answered with error ${res.status}.`, res.status);
    (err as ApiError & { data?: unknown }).data = data;
    throw err;
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const request = (path: string, body?: unknown): Promise<Result> => call(body ? 'POST' : 'GET', path, body);

export const loadResult = (id: string) => request(`/results/${encodeURIComponent(id)}`);

// A follow-up sends only the new message plus previous_id; the server prepends the history
// image: a photo of a product as base64; the server names the product and carries on with that as text
export async function recommend(p: Person, text: string, image?: string): Promise<Result> {
  const base = { language: deviceLanguage(), recipient_name: p.name, budget_eur: p.budget, occasion: p.occasion, image_base64: image };
  if (!p.lastResultId) return request('/recommend', { ...base, input_text: text });
  try {
    return await request('/recommend', { ...base, input_text: text, previous_id: p.lastResultId });
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) throw e;
    // The server forgot the earlier result (restart): send the whole history from the device instead
    const history = p.messages.flatMap((m) => (m.role === 'user' ? [m.text] : []));
    // same shape as the server's own history: first message, then follow-ups marked as such
    return request('/recommend', { ...base, input_text: [...history, text].map((m, i) => (i ? `Nachtrag: ${m}` : m)).join('\n') });
  }
}

// While unused colours remain, two people never share one: later duplicates move to a free colour
export const uniqueColors = (people: Person[]): Person[] => {
  const used = new Set(people.map((p) => p.color));
  const seen = new Set<string>();
  return people.map((p) => {
    const free = seen.has(p.color) ? TAG_COLORS.find((c) => !used.has(c)) : undefined;
    const color = free ?? p.color;
    used.add(color);
    seen.add(color);
    return free ? { ...p, color } : p;
  });
};
export const friendFields = (p: any): Pick<Person, 'friendSlug' | 'wishes'> =>
  typeof p?.friendSlug === 'string' && p.friendSlug ? { friendSlug: p.friendSlug, wishes: toWishes(p.wishes) } : {};
export const loadPeople = (): Person[] => {
  try {
    const raw = (readJson('people') as any[] | null) ?? [];
    // Entries from before the gift-tags rebuild have no id, colour or messages
    const people: Person[] = raw.map((p, i) => ({
      id: p.id ?? `p_${i}_${p.name}`,
      name: p.name,
      occasion: p.occasion,
      budget: p.budget,
      color: p.color ?? TAG_COLORS[i % TAG_COLORS.length],
      messages: p.messages ?? [],
      lastResultId: p.lastResultId ?? null,
      pins: Array.isArray(p.pins) ? p.pins : [],
      ...friendFields(p),
      updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : undefined,
    }));
    const fixed = uniqueColors(people);
    if (fixed.some((p, i) => p !== people[i])) savePeople(fixed);
    return fixed;
  } catch {
    return [];
  }
};
export const savePeople = (people: Person[]) => {
  writeJson('people', people);
};

// A wish on a profile, mirrors docs/api.md (profile-link-friends)
export type WishSource = 'amazon' | 'snap' | 'typed' | 'link';
export type Price = {
  price_eur: number | null;
  offer_count: number | null;
  in_stock: boolean | null;
  trend: 'down' | 'stable' | 'up' | null;
  change_percent: number | null;
  url: string | null;
  image_url: string | null;
  checked_at: string;
};
export type Wish = { title: string; price_eur?: number | null; url?: string | null; image_url?: string | null; source: WishSource | null; added_at: number | null; price?: Price | null };

const SOURCES: WishSource[] = ['amazon', 'snap', 'typed', 'link'];
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const toPrice = (p: any): Price | null =>
  p && typeof p === 'object' && typeof p.checked_at === 'string'
    ? {
        price_eur: num(p.price_eur),
        offer_count: num(p.offer_count),
        in_stock: typeof p.in_stock === 'boolean' ? p.in_stock : null,
        trend: p.trend === 'down' || p.trend === 'stable' || p.trend === 'up' ? p.trend : null,
        change_percent: num(p.change_percent),
        url: str(p.url),
        image_url: str(p.image_url),
        checked_at: p.checked_at,
      }
    : null;
// Wishes used to be plain strings: those become typed wishes
export const toWish = (w: any): Wish | null => {
  if (typeof w === 'string') return w.trim() ? { title: w, source: 'typed', added_at: null } : null;
  if (!w || typeof w !== 'object' || typeof w.title !== 'string' || !w.title.trim()) return null;
  return {
    title: w.title,
    price_eur: num(w.price_eur),
    url: str(w.url),
    image_url: str(w.image_url),
    source: SOURCES.includes(w.source) ? w.source : null,
    added_at: num(w.added_at),
    price: toPrice(w.price),
  };
};
export const toWishes = (raw: unknown): Wish[] => (Array.isArray(raw) ? raw.map(toWish).filter((w): w is Wish => !!w) : []);
// Same wish: same link, or the same title
const norm = (t: string) => t.toLowerCase().split(/\s+/).filter(Boolean).join(' ');
export const sameWish = (a: Wish, b: Wish) => (!!a.url && a.url === b.url) || norm(a.title) === norm(b.title);

// My own tag and wishlist. Local to this phone like the people, in a second file
// share: my public profile link while it is shared
export type Me = { name: string; color: string; wishes: Wish[]; share?: { slug: string; url: string } | null; updatedAt?: number };
export const toShare = (v: any) => (v && typeof v === 'object' && typeof v.slug === 'string' && typeof v.url === 'string' ? { slug: v.slug, url: v.url } : null);
export const loadMe = (): Me => {
  const empty: Me = { name: '', color: TAG_COLORS[1], wishes: [] };
  try {
    const raw = readJson('me') as any;
    if (!raw || typeof raw !== 'object') return empty;
    return {
      name: typeof raw.name === 'string' ? raw.name : '',
      color: typeof raw.color === 'string' ? raw.color : empty.color,
      wishes: toWishes(raw.wishes),
      share: toShare(raw.share),
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : undefined,
    };
  } catch {
    return empty;
  }
};
export const saveMe = (me: Me) => {
  writeJson('me', me);
};
