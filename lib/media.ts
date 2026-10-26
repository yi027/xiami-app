export const MEDIA_LIMITS = {
  maxImageBytes: 8 * 1024 * 1024,
  maxVideoBytes: 50 * 1024 * 1024,
  maxAttachments: 4,
  maxVideos: 1,
  maxBodyLength: 2000,
} as const;

export type MediaKind = "image" | "video";

export type DetectedMedia = {
  kind: MediaKind;
  contentType: string;
};

const IMAGE_LABEL = "圖片請小於 8 MB（JPEG、PNG、GIF、WebP）";
const VIDEO_LABEL = "影片請小於 50 MB（MP4、WebM）";

export function detectMedia(bytes: Uint8Array): DetectedMedia | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { kind: "image", contentType: "image/jpeg" };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { kind: "image", contentType: "image/png" };
  }
  if (bytes.length >= 6) {
    const gif = ascii(bytes, 0, 6);
    if (gif === "GIF87a" || gif === "GIF89a") return { kind: "image", contentType: "image/gif" };
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return { kind: "image", contentType: "image/webp" };
  }
  if (isMp4(bytes)) return { kind: "video", contentType: "video/mp4" };
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { kind: "video", contentType: "video/webm" };
  }
  return null;
}

export function attachmentSizeError(kind: MediaKind, size: number): string | null {
  const max = kind === "image" ? MEDIA_LIMITS.maxImageBytes : MEDIA_LIMITS.maxVideoBytes;
  if (size > max) return kind === "image" ? IMAGE_LABEL : VIDEO_LABEL;
  if (size <= 0) return "檔案是空的";
  return null;
}

export function validateAttachment(
  bytes: Uint8Array,
  declaredType: string,
): { ok: true; kind: MediaKind; contentType: string } | { ok: false; error: string } {
  const sniffed = detectMedia(bytes);
  if (!sniffed) {
    return { ok: false, error: "只接受 JPEG、PNG、GIF、WebP 圖片，或 MP4、WebM 影片" };
  }
  const declared = declaredType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (declared && declared !== "application/octet-stream" && declared !== sniffed.contentType) {
    return { ok: false, error: "檔案內容與類型不符" };
  }
  const sizeError = attachmentSizeError(sniffed.kind, bytes.byteLength);
  if (sizeError) return { ok: false, error: sizeError };
  return { ok: true, kind: sniffed.kind, contentType: sniffed.contentType };
}

export function validateRecordBody(body: string): { ok: true; body: string } | { ok: false; error: string } {
  const trimmed = body.trim();
  if (trimmed.length > MEDIA_LIMITS.maxBodyLength) return { ok: false, error: "紀錄請在 2000 字以內" };
  return { ok: true, body: trimmed };
}

export function sanitizeFileName(name: string, contentType: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const cleaned = base.replace(/[^\w.\-\u4e00-\u9fff]+/g, "_").replace(/^[_\.]+|[_\.]+$/g, "").slice(0, 80);
  if (cleaned) return cleaned;
  const ext = contentType === "image/jpeg" ? "jpg" : (contentType.split("/")[1] ?? "bin");
  return `file.${ext}`;
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}

function isMp4(bytes: Uint8Array) {
  if (bytes.length < 12) return false;
  const brand = ascii(bytes, 4, 8);
  if (brand !== "ftyp") return false;
  const major = ascii(bytes, 8, 12);
  return /^(isom|iso2|mp41|mp42|avc1|dash|M4V |M4A )$/.test(major) || major.trim().length === 4;
}
