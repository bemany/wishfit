import { impersonation } from './impersonation';

// Same interface as storage.ts: JSON documents and one secret, in localStorage.
// Inside the admin simulator everything goes to sessionStorage under wishfit:imp:<userId>: instead
// (openspec/changes/admin-console, design.md 2), so the admin's own data never changes.

const k = (name: string) => (impersonation ? impersonation.prefix : 'wishfit:') + name;
const store = (): Storage => (impersonation ? sessionStorage : localStorage);

export function readJson(name: string): unknown | null {
  try {
    const raw = store().getItem(k(name));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeJson(name: string, value: unknown) {
  try {
    store().setItem(k(name), JSON.stringify(value));
  } catch {
    // the data still works for this session
  }
}

export const readSecret = (key: string): string | null => {
  try {
    return store().getItem(k(key));
  } catch {
    return null;
  }
};
export const writeSecret = (key: string, value: string) => {
  try {
    store().setItem(k(key), value);
  } catch {
    // stays signed out
  }
};
export const deleteSecret = (key: string): Promise<void> => {
  try {
    store().removeItem(k(key));
  } catch {
    // nothing to remove
  }
  return Promise.resolve();
};
