export const sessionTokenStorageKey = "site-management.authToken";

export interface TokenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function readStoredToken(storage = browserStorage()): string | null {
  return storage?.getItem(sessionTokenStorageKey) ?? null;
}

export function saveStoredToken(token: string, storage = browserStorage()): void {
  storage?.setItem(sessionTokenStorageKey, token);
}

export function clearStoredToken(storage = browserStorage()): void {
  storage?.removeItem(sessionTokenStorageKey);
}

function browserStorage(): TokenStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
