export type IdempotencyScope = "create" | "workflow" | "comment" | "photo-complete" | "delete" | "admin-write";

export function createIdempotencyKey(scope: IdempotencyScope, entropy = randomId()): string {
  return `${scope}:${entropy}`;
}

export class IdempotencyKeyStore {
  private readonly keys = new Map<string, string>();

  get(actionId: string, scope: IdempotencyScope): string {
    const existing = this.keys.get(actionId);
    if (existing) return existing;
    const key = createIdempotencyKey(scope);
    this.keys.set(actionId, key);
    return key;
  }

  clear(actionId: string): void {
    this.keys.delete(actionId);
  }
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
