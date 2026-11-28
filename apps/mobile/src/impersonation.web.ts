// The app inside the admin simulator, see openspec/changes/admin-console (design.md 2).
// The console opens /?imp=1#t=<token>&u=<userId>&e=<email>&l=<lang> in an iframe. This module runs before any
// other module reads the storage: it takes the token out of the address at once and points the storage at a
// separate area in sessionStorage (wishfit:imp:<userId>:), so the admin's own data in localStorage stays untouched.

export type Impersonation = { userId: string; prefix: string };

const ID = /^[A-Za-z0-9_-]{1,64}$/;

const framedBySelf = () => {
  try {
    return window.top !== window.self && window.parent.location.origin === window.location.origin;
  } catch {
    // another origin's window throws on access
    return false;
  }
};

const start = (): Impersonation | null => {
  if (typeof window === 'undefined') return null;
  const query = new URLSearchParams(window.location.search);
  if (query.get('imp') !== '1') return null;
  // only the admin console on this origin may open a view: a link with a token, opened on its own or framed by
  // another site, is dropped and the app starts as usual (frame-ancestors keeps other sites out as well)
  if (!framedBySelf()) {
    window.history.replaceState(null, '', '/');
    return null;
  }
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const userId = hash.get('u') ?? query.get('u') ?? '';
  // without a user the simulator has no area of its own; the app then shows that the view has ended
  const id = ID.test(userId) ? userId : 'none';
  const prefix = `wishfit:imp:${id}:`;
  const token = hash.get('t');
  if (token && id !== 'none') {
    try {
      const lang = hash.get('l') === 'de' ? 'de' : 'en';
      sessionStorage.setItem(prefix + 'session', JSON.stringify({ token, email: hash.get('e') ?? '' }));
      // the user's language, no onboarding, the data on this "device" belongs to the user
      sessionStorage.setItem(prefix + 'settings', JSON.stringify({ language: lang, onboarded: true, owner: hash.get('e') ?? '' }));
    } catch {
      // no sessionStorage: the app shows the end of the view
    }
  }
  // the token never stays in the address (history, copied links); the user id keeps a reload in the same area
  window.history.replaceState(null, '', `/?imp=1&u=${encodeURIComponent(id)}`);
  return { userId: id, prefix };
};

export const impersonation: Impersonation | null = start();

// Removes everything the simulator stored for this user
export const clearImpersonation = (prefix: string) => {
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(prefix)) sessionStorage.removeItem(key);
  } catch {
    // nothing stored
  }
};

// Tells the admin console around the iframe that the view has ended
// reason: 'ended' by the user, 'expired' when the server no longer accepts the session
export const notifyEnded = (reason: 'ended' | 'expired') => {
  try {
    window.parent?.postMessage({ type: 'wishfit-imp-end', reason }, window.location.origin);
  } catch {
    // not inside the console
  }
};
