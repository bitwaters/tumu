declare module "node:http" {
  export interface IncomingHttpHeaders {
    [header: string]: string | string[] | undefined;
  }
  export interface IncomingMessage {
    headers: IncomingHttpHeaders;
    method?: string;
    url?: string;
    socket: { remoteAddress?: string };
    on(event: "data", listener: (chunk: Uint8Array) => void): this;
    on(event: "end", listener: () => void): this;
    on(event: "error", listener: (error: Error) => void): this;
  }
  export interface ServerResponse {
    statusCode: number;
    setHeader(name: string, value: string | number): this;
    end(data?: string): void;
  }
  export interface Server {
    listen(port: number, host: string, callback?: () => void): void;
  }
  export function createServer(
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  ): Server;
}

declare module "node:crypto" {
  export interface BinaryLike {}
  export function createHash(algorithm: string): {
    update(data: string): { digest(encoding: "hex" | "base64url"): string };
  };
  export function createHmac(algorithm: string, key: string): {
    update(data: string): { digest(encoding: "base64url" | "hex"): string };
  };
  export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
  export function randomBytes(size: number): Uint8Array & { toString(encoding?: string): string };
  export function randomUUID(): string;
  export function scryptSync(password: string, salt: string, keylen: number): Uint8Array & { toString(encoding?: string): string };
}

declare module "node:fs/promises" {
  export function writeFile(path: string, data: string): Promise<void>;
}

declare module "node:child_process" {
  export function spawn(
    command: string,
    args: string[],
    options: { cwd?: string; stdio?: Array<"pipe" | "inherit"> }
  ): {
    stdin: { end(data: string): void };
    on(event: "close", listener: (code: number | null) => void): void;
  };
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function resolve(...paths: string[]): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string): string;
}

declare module "node:test" {
  export function test(name: string, fn: () => void | Promise<void>): void;
}

declare module "node:assert/strict" {
  export function equal(actual: unknown, expected: unknown, message?: string): void;
  export function ok(value: unknown, message?: string): void;
  export function deepEqual(actual: unknown, expected: unknown, message?: string): void;
}

declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): never;
};

declare const Buffer: {
  from(data: string, encoding?: string): Uint8Array & { toString(encoding?: string): string };
  from(data: Uint8Array): Uint8Array & { toString(encoding?: string): string };
};
