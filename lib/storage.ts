import { mkdir, open, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Storage } from "@google-cloud/storage";

export type ByteRange = { start: number; end: number };

export type StoredSlice = {
  body: Uint8Array;
  start: number;
  end: number;
  total: number;
};

export interface ObjectStorage {
  put(key: string, body: Uint8Array): Promise<void>;
  size(key: string): Promise<number | null>;
  get(key: string, range?: ByteRange): Promise<StoredSlice | null>;
  delete(key: string): Promise<void>;
}

export type StorageConfig =
  | { driver: "local"; dir: string }
  | {
      driver: "s3";
      bucket: string;
      region: string;
      endpoint?: string;
      forcePathStyle: boolean;
      accessKeyId: string;
      secretAccessKey: string;
    }
  | { driver: "gcs"; bucket: string; projectId?: string };

export function readStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const driver = (env.STORAGE_DRIVER ?? "local").trim().toLowerCase() || "local";
  if (driver === "local") {
    return { driver: "local", dir: env.STORAGE_LOCAL_DIR?.trim() || path.join(process.cwd(), "data", "uploads") };
  }
  if (driver === "gcs") {
    const bucket = env.GCS_BUCKET?.trim() ?? "";
    if (!bucket) throw new Error("GCS 儲存需要 GCS_BUCKET");
    const projectId = env.GCS_PROJECT_ID?.trim() || undefined;
    return { driver: "gcs", bucket, projectId };
  }
  if (driver !== "s3") {
    throw new Error(`不支援的 STORAGE_DRIVER：${driver}`);
  }
  const bucket = env.S3_BUCKET?.trim() ?? "";
  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY ?? "";
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("S3 儲存需要 S3_BUCKET、S3_ACCESS_KEY_ID 與 S3_SECRET_ACCESS_KEY");
  }
  const endpoint = env.S3_ENDPOINT?.trim() || undefined;
  return {
    driver: "s3",
    bucket,
    region: env.S3_REGION?.trim() || "auto",
    endpoint,
    forcePathStyle: readForcePathStyle(env.S3_FORCE_PATH_STYLE, Boolean(endpoint)),
    accessKeyId,
    secretAccessKey,
  };
}

export function readForcePathStyle(value: string | undefined, hasEndpoint: boolean) {
  if (value === "true") return true;
  if (value === "false") return false;
  return hasEndpoint;
}

export function s3ClientOptions(config: Extract<StorageConfig, { driver: "s3" }>) {
  return {
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  };
}

export function assertSafeKey(key: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9/_.-]{0,240}$/.test(key) || key.includes("..") || key.includes("//")) {
    throw new Error("不正確的檔案路徑");
  }
}

export function createStorage(config: StorageConfig = readStorageConfig()): ObjectStorage {
  if (config.driver === "local") return new LocalStorage(config.dir);
  if (config.driver === "gcs") return new GcsStorage(config);
  return new S3Storage(config);
}

let cached: ObjectStorage | null = null;

export function getStorage() {
  cached ??= createStorage();
  return cached;
}

export function parseByteRange(header: string | null, total: number): ByteRange | "invalid" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return "invalid";
  if (total <= 0) return "invalid";
  const startRaw = match[1] ?? "";
  const endRaw = match[2] ?? "";
  if (!startRaw && !endRaw) return "invalid";
  if (!startRaw) {
    const suffix = Number(endRaw);
    if (!Number.isInteger(suffix) || suffix <= 0) return "invalid";
    return { start: Math.max(total - suffix, 0), end: total - 1 };
  }
  const start = Number(startRaw);
  const end = endRaw === "" ? total - 1 : Number(endRaw);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= total) {
    return "invalid";
  }
  return { start, end: Math.min(end, total - 1) };
}

class LocalStorage implements ObjectStorage {
  constructor(private readonly root: string) {}

  private resolve(key: string) {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    const base = path.resolve(this.root);
    if (full !== base && !full.startsWith(base + path.sep)) {
      throw new Error("不正確的檔案路徑");
    }
    return full;
  }

  async put(key: string, body: Uint8Array) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    const handle = await open(full, "w");
    try {
      await handle.writeFile(body);
    } finally {
      await handle.close();
    }
  }

  async size(key: string) {
    try {
      const info = await stat(this.resolve(key));
      return info.size;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async get(key: string, range?: ByteRange) {
    const full = this.resolve(key);
    let info;
    try {
      info = await stat(full);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
    const total = info.size;
    if (total === 0) return { body: new Uint8Array(), start: 0, end: 0, total: 0 };
    const start = range?.start ?? 0;
    const end = Math.min(range?.end ?? total - 1, total - 1);
    if (start > end || start >= total) return null;
    const length = end - start + 1;
    const body = Buffer.alloc(length);
    const handle = await open(full, "r");
    try {
      await handle.read(body, 0, length, start);
    } finally {
      await handle.close();
    }
    return { body, start, end, total };
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

class GcsStorage implements ObjectStorage {
  private readonly bucket;

  constructor(config: Extract<StorageConfig, { driver: "gcs" }>) {
    const storage = new Storage(config.projectId ? { projectId: config.projectId } : {});
    this.bucket = storage.bucket(config.bucket);
  }

  async put(key: string, body: Uint8Array) {
    assertSafeKey(key);
    await this.bucket.file(key).save(Buffer.from(body), { resumable: false });
  }

  async size(key: string) {
    assertSafeKey(key);
    try {
      const [metadata] = await this.bucket.file(key).getMetadata();
      return Number(metadata.size ?? 0);
    } catch (error) {
      if (isGcsNotFound(error)) return null;
      throw error;
    }
  }

  async get(key: string, range?: ByteRange) {
    assertSafeKey(key);
    const file = this.bucket.file(key);
    try {
      const [metadata] = await file.getMetadata();
      const total = Number(metadata.size ?? 0);
      if (total === 0) return { body: new Uint8Array(), start: 0, end: 0, total: 0 };
      const start = range?.start ?? 0;
      const end = Math.min(range?.end ?? total - 1, total - 1);
      if (start > end || start >= total) return null;
      const [downloaded] = await file.download({ start, end });
      return { body: new Uint8Array(downloaded), start, end, total };
    } catch (error) {
      if (isGcsNotFound(error)) return null;
      throw error;
    }
  }

  async delete(key: string) {
    assertSafeKey(key);
    await this.bucket.file(key).delete({ ignoreNotFound: true });
  }
}

class S3Storage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(private readonly config: Extract<StorageConfig, { driver: "s3" }>) {
    this.client = new S3Client(s3ClientOptions(config));
  }

  async put(key: string, body: Uint8Array) {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
      }),
    );
  }

  async size(key: string) {
    assertSafeKey(key);
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
      return head.ContentLength ?? 0;
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  async get(key: string, range?: ByteRange) {
    assertSafeKey(key);
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Range: range ? `bytes=${range.start}-${range.end}` : undefined,
        }),
      );
      const body = await readS3Body(result.Body);
      const total = totalFromRange(result.ContentRange) ?? (range ? range.end + 1 : body.byteLength);
      const start = range?.start ?? 0;
      const end = range ? Math.min(range.end, Math.max(total - 1, start)) : Math.max(body.byteLength - 1, 0);
      return { body, start, end, total };
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  async delete(key: string) {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}

async function readS3Body(body: unknown) {
  if (!body) return new Uint8Array();
  if (body instanceof Uint8Array) return body;
  if (typeof (body as { transformToByteArray?: unknown }).transformToByteArray === "function") {
    return (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
  }
  if (body instanceof Readable || typeof (body as NodeJS.ReadableStream).pipe === "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Buffer | Uint8Array | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return new Uint8Array(Buffer.concat(chunks));
  }
  throw new Error("無法讀取物件內容");
}

function totalFromRange(header?: string) {
  const match = /\/(\d+)$/.exec(header ?? "");
  if (!match) return null;
  const total = Number(match[1]);
  return Number.isInteger(total) ? total : null;
}

function isNotFound(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT");
}

function isGcsNotFound(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return Number((error as { code?: number | string }).code) === 404;
}

function isMissingObject(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name?: string }).name) : "";
  const status = "$metadata" in error ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode : 0;
  return name === "NotFound" || name === "NoSuchKey" || status === 404;
}
