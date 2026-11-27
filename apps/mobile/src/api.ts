import { File, Paths } from 'expo-file-system';

import { TAG_COLORS } from './theme';

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

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request(path: string, body?: unknown): Promise<Result> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  } catch {
    throw new ApiError(`I can't reach the server (${API_URL}).`, 0);
  }
  if (!res.ok) {
    const detail = await res
      .json()
      .then((b) => (typeof b?.detail === 'string' ? b.detail : null))
      .catch(() => null);
    throw new ApiError(detail ?? `The server answered with error ${res.status}.`, res.status);
  }
  return res.json();
}

export const loadResult = (id: string) => request(`/results/${encodeURIComponent(id)}`);

// A follow-up sends only the new message plus previous_id; the server prepends the history
// image: a photo of a product as base64; the server names the product and carries on with that as text
export async function recommend(p: Person, text: string, image?: string): Promise<Result> {
  const base = { language: 'en', recipient_name: p.name, budget_eur: p.budget, occasion: p.occasion, image_base64: image };
  if (!p.lastResultId) return request('/recommend', { ...base, input_text: text });
  try {
    return await request('/recommend', { ...base, input_text: text, previous_id: p.lastResultId });
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) throw e;
    // The server forgot the earlier result (restart): send the whole history from the device instead
    const history = p.messages.flatMap((m) => (m.role === 'user' ? [m.text] : []));
    return request('/recommend', { ...base, input_text: [...history, text].join('\n\n') });
  }
}

// expo-file-system ships with the expo package, so this needs no extra native module
const peopleFile = () => new File(Paths.document, 'people.json');
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
    const file = peopleFile();
    const raw: any[] = file.exists ? JSON.parse(file.textSync()) : [];
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
    }));
    const fixed = uniqueColors(people);
    if (fixed.some((p, i) => p !== people[i])) savePeople(fixed);
    return fixed;
  } catch {
    return [];
  }
};
export const savePeople = (people: Person[]) => {
  try {
    peopleFile().write(JSON.stringify(people));
  } catch {
    // the list still works for this session
  }
};

// My own tag and wishlist. Local to this phone like the people, in a second file
export type Me = { name: string; color: string; wishes: string[] };
const meFile = () => new File(Paths.document, 'me.json');
export const loadMe = (): Me => {
  const empty: Me = { name: '', color: TAG_COLORS[1], wishes: [] };
  try {
    const file = meFile();
    const raw = file.exists ? JSON.parse(file.textSync()) : null;
    if (!raw || typeof raw !== 'object') return empty;
    return {
      name: typeof raw.name === 'string' ? raw.name : '',
      color: typeof raw.color === 'string' ? raw.color : empty.color,
      wishes: Array.isArray(raw.wishes) ? raw.wishes.filter((w: unknown) => typeof w === 'string') : [],
    };
  } catch {
    return empty;
  }
};
export const saveMe = (me: Me) => {
  try {
    meFile().write(JSON.stringify(me));
  } catch {
    // still works for this session
  }
};
