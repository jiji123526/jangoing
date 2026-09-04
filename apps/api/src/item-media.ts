import { ItemThumbnailUploadRequestSchema } from "@jangoing/contracts";

export interface ParsedThumbnailUpload {
  thumbnailUrl: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  bytes: Uint8Array;
  byteSize: number;
  sha256: string;
}

const itemThumbnailDataUrlPattern =
  /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=_-]+)$/;
const maximumThumbnailBytes = 256 * 1024;

function estimateBase64Bytes(payload: string): number {
  const normalized = payload.replace(/=+$/, "");
  return Math.floor((normalized.length * 3) / 4);
}

function decodeBase64(payload: string): Uint8Array {
  const binary = atob(payload);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return bytesToHex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)),
    ),
  );
}

function extensionForContentType(contentType: ParsedThumbnailUpload["contentType"]): string {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
  }
}

export async function parseThumbnailUpload(
  payload: unknown,
): Promise<ParsedThumbnailUpload | { error: string; details?: unknown }> {
  const parsed = ItemThumbnailUploadRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      error: "Invalid item media payload",
      details: parsed.error.flatten(),
    };
  }

  const match = parsed.data.thumbnail_url.match(itemThumbnailDataUrlPattern);
  if (!match) {
    return { error: "Unsupported image format" };
  }
  if (estimateBase64Bytes(match[2]) > maximumThumbnailBytes) {
    return { error: "Thumbnail is too large" };
  }

  const bytes = decodeBase64(match[2]);
  if (bytes.byteLength > maximumThumbnailBytes) {
    return { error: "Thumbnail is too large" };
  }

  return {
    thumbnailUrl: parsed.data.thumbnail_url,
    contentType: match[1] as ParsedThumbnailUpload["contentType"],
    bytes,
    byteSize: bytes.byteLength,
    sha256: await sha256Hex(bytes),
  };
}

export function buildItemMediaObjectKey(input: {
  householdId: string;
  itemName: string;
  mediaId: string;
  contentType: ParsedThumbnailUpload["contentType"];
}): string {
  return [
    "households",
    input.householdId,
    "items",
    input.itemName,
    input.mediaId,
    `thumbnail.${extensionForContentType(input.contentType)}`,
  ].join("/");
}

export function buildItemMediaReference(objectKey: string): string {
  return `r2:${objectKey}`;
}

export function buildItemMediaUrl(
  requestUrl: string,
  mediaId: string,
  updatedAt: string,
): string {
  const url = new URL(
    `/item-media/${encodeURIComponent(mediaId)}/thumbnail`,
    requestUrl,
  );
  url.searchParams.set("v", updatedAt);
  return url.toString();
}
