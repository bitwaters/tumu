import type { Store } from "./types.js";

export async function withStoreTransaction<T>(store: Store, handler: () => T | Promise<T>): Promise<T> {
  const snapshot = structuredClone(store);
  try {
    return await handler();
  } catch (error) {
    Object.assign(store, snapshot);
    throw error;
  }
}
