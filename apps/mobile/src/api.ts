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

// My own tag and wishlist. Local to this phone like the people, in a second file
export type Me = { name: string; color: string; wishes: string[]; updatedAt?: number };
export const loadMe = (): Me => {
  const empty: Me = { name: '', color: TAG_COLORS[1], wishes: [] };
  try {
    const raw = readJson('me') as any;
    if (!raw || typeof raw !== 'object') return empty;
    return {
      name: typeof raw.name === 'string' ? raw.name : '',
      color: typeof raw.color === 'string' ? raw.color : empty.color,
      wishes: Array.isArray(raw.wishes) ? raw.wishes.filter((w: unknown) => typeof w === 'string') : [],
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : undefined,
    };
  } catch {
    return empty;
  }
};
export const saveMe = (me: Me) => {
  writeJson('me', me);
};
