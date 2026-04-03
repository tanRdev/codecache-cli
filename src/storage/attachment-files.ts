import path from "node:path";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import type { VaultDatabase } from "@/storage/sqlite";

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export function buildAttachmentRelativePath(snippetId: string, attachmentId: string, fileName: string) {
  return path.join(
    sanitizePathSegment(snippetId),
    `${sanitizePathSegment(attachmentId)}-${sanitizeFileName(fileName)}`,
  );
}

export function getAttachmentAbsolutePath(vault: VaultDatabase, relativePath: string) {
  return path.join(vault.vaultPath, "attachments", relativePath);
}

export async function importAttachmentFile(vault: VaultDatabase, sourcePath: string, relativePath: string) {
  const absolutePath = getAttachmentAbsolutePath(vault, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await copyFile(sourcePath, absolutePath);
}

export async function exportAttachmentFile(vault: VaultDatabase, relativePath: string, outputPath: string) {
  const content = await readFile(getAttachmentAbsolutePath(vault, relativePath));
  await writeFile(outputPath, content);
}

export async function deleteAttachmentFile(vault: VaultDatabase, relativePath: string) {
  await rm(getAttachmentAbsolutePath(vault, relativePath), { force: true });
}

export async function deleteSnippetAttachmentDirectory(vault: VaultDatabase, snippetId: string) {
  const snippetDirectory = getAttachmentAbsolutePath(vault, sanitizePathSegment(snippetId));

  try {
    const entries = await readdir(snippetDirectory);

    if (entries.length === 0) {
      await rm(snippetDirectory, { recursive: true, force: true });
    }
  } catch {
    // Ignore missing directories.
  }
}
