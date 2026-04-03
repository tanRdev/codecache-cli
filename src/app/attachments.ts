import path from "node:path";
import { stat } from "node:fs/promises";
import { createNotFoundError } from "../shared/errors";
import { guessMimeType } from "../shared/mime";
import type { VaultDatabase } from "../storage/sqlite";
import { createAttachmentRepository, createSnippetRepository } from "../storage/sqlite";
import {
  buildAttachmentRelativePath,
  deleteAttachmentFile,
  deleteSnippetAttachmentDirectory,
  exportAttachmentFile,
  importAttachmentFile,
} from "../storage/attachment-files";

interface AttachmentServiceDependencies {
  attachmentRepository: ReturnType<typeof createAttachmentRepository>;
  snippetRepository: ReturnType<typeof createSnippetRepository>;
  importFile: typeof importAttachmentFile;
  exportFile: typeof exportAttachmentFile;
  deleteFile: typeof deleteAttachmentFile;
  deleteSnippetDirectory: typeof deleteSnippetAttachmentDirectory;
}

export function createAttachmentService(
  vault: VaultDatabase,
  dependencies?: Partial<AttachmentServiceDependencies>,
) {
  const attachments = dependencies?.attachmentRepository ?? createAttachmentRepository(vault);
  const snippets = dependencies?.snippetRepository ?? createSnippetRepository(vault);
  const importFile = dependencies?.importFile ?? importAttachmentFile;
  const exportFile = dependencies?.exportFile ?? exportAttachmentFile;
  const deleteFile = dependencies?.deleteFile ?? deleteAttachmentFile;
  const deleteSnippetDirectory = dependencies?.deleteSnippetDirectory ?? deleteSnippetAttachmentDirectory;

  return {
    async add(snippetId: string, filePath: string) {
      const snippet = snippets.get(snippetId);

      if (!snippet) {
        throw createNotFoundError("Snippet not found");
      }

      const attachmentId = crypto.randomUUID();
      const fileName = path.basename(filePath);
      const relativePath = buildAttachmentRelativePath(snippetId, attachmentId, fileName);
      const fileStat = await stat(filePath);

      await importFile(vault, filePath, relativePath);

      try {
        return attachments.create({
          id: attachmentId,
          snippetId,
          relativePath,
          fileName,
          mimeType: guessMimeType(filePath),
          sizeBytes: fileStat.size,
          sha256: null,
        });
      } catch (error) {
        await deleteFile(vault, relativePath);
        await deleteSnippetDirectory(vault, snippetId);
        throw error;
      }
    },

    async list(snippetId: string) {
      return attachments.list(snippetId);
    },

    async writeToFile(attachmentId: string, outputPath: string) {
      const attachment = attachments.get(attachmentId);

      if (!attachment) {
        throw createNotFoundError("Attachment not found");
      }

      await exportFile(vault, attachment.relativePath, outputPath);
      return { success: true, outputPath };
    },

    async remove(attachmentId: string) {
      const attachment = attachments.get(attachmentId);

      if (!attachment) {
        throw createNotFoundError("Attachment not found");
      }

      try {
        await deleteFile(vault, attachment.relativePath);
        const deleted = attachments.remove(attachmentId);

        if (!deleted) {
          throw createNotFoundError("Attachment not found");
        }

        await deleteSnippetDirectory(vault, attachment.snippetId);
        return { success: true };
      } catch (error) {
        if (!attachments.get(attachmentId)) {
          attachments.create({
            id: attachment.id,
            snippetId: attachment.snippetId,
            relativePath: attachment.relativePath,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            sha256: attachment.sha256,
          });
        }

        throw error;
      }
    },

    async removeSnippetFiles(snippetId: string) {
      const existingAttachments = attachments.list(snippetId);

      for (const attachment of existingAttachments) {
        await deleteFile(vault, attachment.relativePath);
      }

      await deleteSnippetDirectory(vault, snippetId);
    },
  };
}
