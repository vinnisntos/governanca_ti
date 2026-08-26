import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile as fsReadFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Substitui os buckets do Supabase Storage. Arquivos vão para
// STORAGE_ROOT/{bucket}/{ownerId}/{uuid}.{ext} num volume persistente do
// Dokploy — mesma convenção de path de antes (storage.foldername(name)[1]
// = dono). O path nunca é aceito do client: é sempre montado aqui a partir
// de ownerId (do lado do servidor) + um UUID novo, o que já evita path
// traversal.
export type StorageBucket = "hardware-checkin-photos" | "hardware-contracts";

function storageRoot(): string {
  const root = process.env.STORAGE_ROOT;
  if (!root) {
    throw new Error("STORAGE_ROOT não configurada");
  }
  return root;
}

function resolvePath(relativePath: string): string {
  const root = storageRoot();
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) {
    throw new Error("Path de storage inválido");
  }
  return resolved;
}

export async function saveFile(
  bucket: StorageBucket,
  ownerId: string,
  buffer: Buffer,
  ext: string
): Promise<string> {
  const relativePath = path.posix.join(bucket, ownerId, `${randomUUID()}.${ext}`);
  const absolutePath = resolvePath(relativePath);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);

  return relativePath;
}

export async function readFile(relativePath: string): Promise<Buffer> {
  return fsReadFile(resolvePath(relativePath));
}

export async function deleteFile(relativePath: string): Promise<void> {
  await rm(resolvePath(relativePath), { force: true });
}
