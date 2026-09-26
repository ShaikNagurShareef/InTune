import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get } from "@vercel/blob";

/**
 * Private media storage. Production uses a private Vercel Blob store; local development without a
 * Blob token falls back to `.data/media` on disk. Raw media is never served to other users (FR28).
 */
export type StorageMode = "blob" | "local";

export const storageMode = (): StorageMode => (process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local");

const LOCAL_ROOT = path.join(process.cwd(), ".data", "media");

function localPath(key: string): string {
  const resolved = path.resolve(LOCAL_ROOT, key);
  if (!resolved.startsWith(LOCAL_ROOT + path.sep)) throw new Error("invalid storage key");
  return resolved;
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function readObject(key: string): Promise<Buffer | null> {
  if (storageMode() === "local") {
    return readFile(localPath(key)).catch(() => null);
  }
  const res = await get(key, { access: "private", useCache: false });
  if (!res || !res.stream) return null;
  return streamToBuffer(res.stream);
}

export async function writeLocalObject(key: string, bytes: Buffer): Promise<void> {
  const target = localPath(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

export async function deleteObject(key: string): Promise<void> {
  if (storageMode() === "local") {
    await rm(localPath(key), { force: true });
    return;
  }
  await del(key).catch(() => undefined);
}
