// Same interface as storage.ts: JSON documents and one secret, in localStorage

const k = (name: string) => `wishfit:${name}`;

export function readJson(name: string): unknown | null {
  try {
    const raw = localStorage.getItem(k(name));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeJson(name: string, value: unknown) {
  try {
    localStorage.setItem(k(name), JSON.stringify(value));
  } catch {
    // the data still works for this session
  }
}

export const readSecret = (key: string): string | null => {
  try {
    return localStorage.getItem(k(key));
  } catch {
    return null;
  }
};
export const writeSecret = (key: string, value: string) => {
  try {
    localStorage.setItem(k(key), value);
  } catch {
    // stays signed out
  }
};
export const deleteSecret = (key: string) => {
  try {
    localStorage.removeItem(k(key));
  } catch {
    // nothing to remove
  }
};
