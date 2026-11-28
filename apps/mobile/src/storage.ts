import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

// Same interface as storage.web.ts: JSON documents and one secret

export function readJson(name: string): unknown | null {
  try {
    const file = new File(Paths.document, `${name}.json`);
    return file.exists ? JSON.parse(file.textSync()) : null;
  } catch {
    return null;
  }
}

export function writeJson(name: string, value: unknown) {
  try {
    new File(Paths.document, `${name}.json`).write(JSON.stringify(value));
  } catch {
    // the data still works for this session
  }
}

export function deleteJson(name: string) {
  try {
    const file = new File(Paths.document, `${name}.json`);
    if (file.exists) file.delete();
  } catch {
    // nothing to remove
  }
}

// The session token lives in the keychain
export const readSecret = (key: string): string | null => {
  try {
    return SecureStore.getItem(key);
  } catch {
    return null;
  }
};
export const writeSecret = (key: string, value: string) => {
  try {
    SecureStore.setItem(key, value);
  } catch {
    // stays signed out
  }
};
export const deleteSecret = (key: string): Promise<void> => SecureStore.deleteItemAsync(key).catch(() => {});
