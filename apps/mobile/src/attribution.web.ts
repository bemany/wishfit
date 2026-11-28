import { impersonation } from './impersonation';
import { slugFromUrl } from './profile';
import { deleteJson, readJson, writeJson } from './storage';

// Where a new user came from, see openspec/changes/admin-console (design.md 3). First touch: the first visit's
// UTM parameters, referrer and landing page stay in wishfit:attribution and are never overwritten; a profile
// link (/u/<slug>) or ?ref=<slug> adds the inviter while none is set. POST /auth/verify sends it along.

export type Attribution = Partial<Record<'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_term' | 'utm_content' | 'referrer' | 'landing' | 'platform' | 'ref', string>>;

const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;
const cut = (v: string) => v.slice(0, 200);
const SLUG = /^[A-Za-z0-9_-]{6,20}$/;

const read = (): Attribution | null => {
  const raw = readJson('attribution');
  return raw && typeof raw === 'object' ? (raw as Attribution) : null;
};

export const noteRef = (slug: string) => {
  const known = read();
  if (!SLUG.test(slug) || known?.ref) return;
  writeJson('attribution', { ...(known ?? { platform: 'web' }), ref: slug });
};

// Once per page load, before the app changes the address. Not in the admin simulator or the console
export function captureAttribution() {
  if (impersonation || typeof window === 'undefined' || window.location.pathname.startsWith('/admin')) return;
  const query = new URLSearchParams(window.location.search);
  if (!read()) {
    const first: Attribution = { platform: 'web', landing: cut(window.location.pathname + window.location.search) };
    for (const key of UTM) {
      const v = query.get(key);
      if (v) first[key] = cut(v);
    }
    // a referrer from our own pages says nothing about where the user came from
    if (document.referrer && !document.referrer.startsWith(window.location.origin)) first.referrer = cut(document.referrer);
    writeJson('attribution', first);
  }
  const ref = query.get('ref') ?? slugFromUrl(window.location.pathname);
  if (ref) noteRef(ref);
}

export const attributionForVerify = (): Attribution | undefined => read() ?? undefined;

// Once a new account carries it, the origin is spent; a later visit starts a fresh first touch
export const clearAttribution = () => deleteJson('attribution');
