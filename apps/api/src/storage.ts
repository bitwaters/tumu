import { randomUUID } from "node:crypto";
import { createHash, createHmac } from "node:crypto";
import type { ApiConfig } from "./config.js";
import { badRequest } from "./errors.js";
import type { ObjectStorageRuntimeConfig } from "./services/system-settings/index.js";

export interface PresignInput {
  actorId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface PresignResult {
  objectKey: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

export class ObjectStorageClient {
  constructor(
    private readonly config: ApiConfig,
    private readonly runtimeConfig?: () => Promise<ObjectStorageRuntimeConfig>
  ) {}

  createObjectKey(input: PresignInput): string {
    const extension = input.fileName.includes(".") ? input.fileName.split(".").at(-1) : "bin";
    return `uploads/${input.actorId}/${Date.now()}-${randomUUID()}.${extension}`;
  }

  createUploadTarget(input: PresignInput): PresignResult {
    const objectKey = this.createObjectKey(input);
    return {
      objectKey,
      uploadUrl: `/photos/upload/${encodeObjectKey(objectKey)}`,
      expiresInSeconds: 900
    };
  }

  async createPreviewTarget(objectKey: string): Promise<{ previewUrl: string; expiresInSeconds: number }> {
    return {
      previewUrl: await this.objectUrl(objectKey, "preview=1"),
      expiresInSeconds: 900
    };
  }

  async createDownloadTarget(objectKey: string): Promise<{ downloadUrl: string; expiresInSeconds: number }> {
    return {
      downloadUrl: await this.objectUrl(objectKey, "download=1"),
      expiresInSeconds: 900
    };
  }

  private async objectUrl(objectKey: string, query: string): Promise<string> {
    validateObjectKey(objectKey);
    const runtime = await this.resolveRuntimeConfig();
    const endpoint = runtime.endpoint.replace(/\/$/, "");
    return `${endpoint}/${runtime.bucket}/${encodeS3Path(objectKey)}?${query}`;
  }

  async putObject(objectKey: string, body: Uint8Array, contentType: string): Promise<void> {
    validateObjectKey(objectKey);
    await this.ensureBucket();
    const response = await this.s3Fetch("PUT", objectKey, body, contentType);
    if (!response.ok) throw new Error(`Object upload failed with HTTP ${response.status}: ${await response.text()}`);
  }

  async readObjectDataUrl(objectKey: string): Promise<string> {
    validateObjectKey(objectKey);
    const response = await this.s3Fetch("GET", objectKey);
    if (!response.ok) throw new Error(`Object preview failed with HTTP ${response.status}: ${await response.text()}`);
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const bytes = new Uint8Array(await response.arrayBuffer());
    return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
  }

  private async ensureBucket(): Promise<void> {
    const response = await this.s3Fetch("PUT");
    if (response.ok || response.status === 409) return;
    throw new Error(`Object bucket initialization failed with HTTP ${response.status}: ${await response.text()}`);
  }

  private async s3Fetch(method: "GET" | "PUT", objectKey?: string, body?: Uint8Array, contentType = "application/octet-stream"): Promise<Response> {
    const runtime = await this.resolveRuntimeConfig();
    const endpoint = runtime.endpoint.replace(/\/$/, "");
    const path = objectKey ? `/${runtime.bucket}/${encodeS3Path(objectKey)}` : `/${runtime.bucket}`;
    const url = `${endpoint}${path}`;
    const payloadHash = sha256Hex(body ?? new Uint8Array());
    const headers = signS3Request({
      method,
      path,
      contentType,
      payloadHash,
      host: new URL(endpoint).host,
      accessKey: runtime.accessKey,
      secretKey: runtime.secretKey
    });
    return fetch(url, {
      method,
      headers,
      body: body as BodyInit | undefined
    });
  }

  private async resolveRuntimeConfig(): Promise<ObjectStorageRuntimeConfig> {
    return this.runtimeConfig
      ? this.runtimeConfig()
      : {
          endpoint: this.config.objectStorageEndpoint,
          bucket: this.config.objectStorageBucket,
          accessKey: this.config.objectStorageAccessKey,
          secretKey: this.config.objectStorageSecretKey
        };
  }
}

interface S3SignInput {
  method: string;
  path: string;
  contentType: string;
  payloadHash: string;
  host: string;
  accessKey: string;
  secretKey: string;
}

export function encodeObjectKey(objectKey: string): string {
  return Buffer.from(objectKey).toString("base64url");
}

export function decodeObjectKey(encoded: string): string {
  const decoded = Buffer.from(encoded, "base64url").toString();
  validateObjectKey(decoded);
  return decoded;
}

function validateObjectKey(objectKey: string): void {
  if (!objectKey || objectKey.includes("..") || objectKey.startsWith("/") || objectKey.includes("\\")) {
    throw badRequest("Invalid object key");
  }
}

function signS3Request(input: S3SignInput): Record<string, string> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const region = "us-east-1";
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = [
    `content-type:${input.contentType}`,
    `host:${input.host}`,
    `x-amz-content-sha256:${input.payloadHash}`,
    `x-amz-date:${amzDate}`
  ].join("\n") + "\n";
  const canonicalRequest = [input.method, input.path, "", canonicalHeaders, signedHeaders, input.payloadHash].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${input.secretKey}`, dateStamp), region), "s3"), "aws4_request");
  const signature = hmacHex(signingKey, stringToSign);
  return {
    "content-type": input.contentType,
    "x-amz-content-sha256": input.payloadHash,
    "x-amz-date": amzDate,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  };
}

function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

function hmac(key: string | Uint8Array, data: string): Uint8Array {
  return createHmac("sha256", key).update(data).digest();
}

function hmacHex(key: string | Uint8Array, data: string): string {
  return createHmac("sha256", key).update(data).digest("hex");
}

function encodeS3Path(objectKey: string): string {
  return objectKey.split("/").map(encodeURIComponent).join("/");
}
