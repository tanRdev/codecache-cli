import os from "node:os";
import path from "node:path";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAttachmentService } from "../../src/app/attachments";
import { createSnippetService } from "../../src/app/snippets";
import { buildAttachmentRelativePath } from "../../src/storage/attachment-files";
import { guessMimeType } from "../../src/shared/mime";
import { openVaultDatabase } from "../../src/storage/sqlite";

describe("attachment rollback", () => {
  let tempRoot: string;
  let filePath: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "cache-cli-attachment-rollback-"));
    filePath = path.join(tempRoot, "example.txt");
    await writeFile(filePath, "rollback\n", "utf8");
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("removes copied files when metadata save fails", async () => {
    const db = openVaultDatabase(tempRoot);
    const snippets = createSnippetService(db);
    const created = await snippets.create({
      title: "Rollback add",
      language: "text",
      code: "body",
      tags: [],
    });

    const attachments = createAttachmentService(db, {
      attachmentRepository: {
        ...(
          await import("../../src/storage/sqlite")
        ).createAttachmentRepository(db),
        create() {
          throw new Error("db insert failed");
        },
      },
    });

    await expect(attachments.add(created.id, filePath)).rejects.toThrow("db insert failed");
    await expect(access(path.join(tempRoot, "attachments", created.id))).rejects.toThrow();
  });

  it("restores metadata when file deletion fails", async () => {
    const db = openVaultDatabase(tempRoot);
    const snippets = createSnippetService(db);
    const created = await snippets.create({
      title: "Rollback delete",
      language: "text",
      code: "body",
      tags: [],
    });

    const attachmentId = crypto.randomUUID();
    const relativePath = buildAttachmentRelativePath(created.id, attachmentId, path.basename(filePath));
    const repository = (await import("../../src/storage/sqlite")).createAttachmentRepository(db);
    repository.create({
      id: attachmentId,
      snippetId: created.id,
      relativePath,
      fileName: path.basename(filePath),
      mimeType: guessMimeType(filePath),
      sizeBytes: 9,
      sha256: null,
    });
    await mkdir(path.dirname(path.join(tempRoot, "attachments", relativePath)), { recursive: true });
    await writeFile(path.join(tempRoot, "attachments", relativePath), "rollback\n", "utf8");

    const attachments = createAttachmentService(db, {
      attachmentRepository: repository,
      async deleteFile() {
        throw new Error("delete failed");
      },
    });

    await expect(attachments.remove(attachmentId)).rejects.toThrow("delete failed");

    const outputPath = path.join(tempRoot, "copy.txt");
    await expect(attachments.writeToFile(attachmentId, outputPath)).resolves.toMatchObject({ success: true });
    await expect(readFile(outputPath, "utf8")).resolves.toBe("rollback\n");
  });
});
