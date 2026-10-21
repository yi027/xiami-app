import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertSafeKey, createStorage, parseByteRange, readStorageConfig, s3ClientOptions } from "../lib/storage";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("local storage", () => {
  it("writes, reads a range, and deletes", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "xiami-store-"));
    dirs.push(dir);
    const storage = createStorage({ driver: "local", dir });
    await storage.put("events/a/b/file", Uint8Array.from([1, 2, 3, 4, 5]));
    expect(await storage.size("events/a/b/file")).toBe(5);
    const slice = await storage.get("events/a/b/file", { start: 1, end: 3 });
    expect(Array.from(slice?.body ?? [])).toEqual([2, 3, 4]);
    expect(slice?.total).toBe(5);
    await storage.delete("events/a/b/file");
    expect(await storage.get("events/a/b/file")).toBeNull();
  });

  it("rejects path traversal", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "xiami-store-"));
    dirs.push(dir);
    const storage = createStorage({ driver: "local", dir });
    await expect(storage.put("../secret", Uint8Array.from([1]))).rejects.toThrow(/路徑/);
    expect(() => assertSafeKey("events/../../etc/passwd")).toThrow(/路徑/);
  });
});

describe("s3-compatible config", () => {
  it("builds client options for AWS, R2, MinIO, and GCS interop", () => {
    expect(readStorageConfig({ STORAGE_DRIVER: "local", STORAGE_LOCAL_DIR: "/data/uploads" })).toEqual({
      driver: "local",
      dir: "/data/uploads",
    });
    const aws = readStorageConfig({
      STORAGE_DRIVER: "s3",
      S3_BUCKET: "xiami",
      S3_REGION: "ap-northeast-1",
      S3_ACCESS_KEY_ID: "AKIA",
      S3_SECRET_ACCESS_KEY: "secret",
    });
    expect(aws).toMatchObject({ driver: "s3", forcePathStyle: false, region: "ap-northeast-1", endpoint: undefined });
    if (aws.driver !== "s3") return;
    expect(s3ClientOptions(aws).credentials.accessKeyId).toBe("AKIA");

    const r2 = readStorageConfig({
      STORAGE_DRIVER: "s3",
      S3_BUCKET: "xiami",
      S3_REGION: "auto",
      S3_ENDPOINT: "https://account.r2.cloudflarestorage.com",
      S3_ACCESS_KEY_ID: "r2",
      S3_SECRET_ACCESS_KEY: "secret",
      S3_FORCE_PATH_STYLE: "true",
    });
    expect(r2).toMatchObject({
      endpoint: "https://account.r2.cloudflarestorage.com",
      forcePathStyle: true,
      region: "auto",
    });

    const minio = readStorageConfig({
      STORAGE_DRIVER: "s3",
      S3_BUCKET: "xiami",
      S3_ENDPOINT: "http://minio:9000",
      S3_ACCESS_KEY_ID: "minio",
      S3_SECRET_ACCESS_KEY: "secret",
    });
    expect(minio).toMatchObject({ forcePathStyle: true, region: "auto" });

    const gcs = readStorageConfig({
      STORAGE_DRIVER: "s3",
      S3_BUCKET: "xiami",
      S3_ENDPOINT: "https://storage.googleapis.com",
      S3_ACCESS_KEY_ID: "gcs",
      S3_SECRET_ACCESS_KEY: "secret",
      S3_FORCE_PATH_STYLE: "false",
    });
    expect(gcs).toMatchObject({ endpoint: "https://storage.googleapis.com", forcePathStyle: false });
    expect(() => readStorageConfig({ STORAGE_DRIVER: "s3" })).toThrow(/S3_BUCKET/);
  });
});

describe("byte ranges", () => {
  it("parses open, closed, and suffix ranges", () => {
    expect(parseByteRange(null, 10)).toBeNull();
    expect(parseByteRange("bytes=0-3", 10)).toEqual({ start: 0, end: 3 });
    expect(parseByteRange("bytes=8-", 10)).toEqual({ start: 8, end: 9 });
    expect(parseByteRange("bytes=-4", 10)).toEqual({ start: 6, end: 9 });
    expect(parseByteRange("bytes=10-11", 10)).toBe("invalid");
    expect(parseByteRange("bytes=abc", 10)).toBe("invalid");
  });
});
