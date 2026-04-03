import os from "node:os";
import path from "node:path";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/program";
import { createAttachmentService } from "../../src/app/attachments";
import { createSnippetService } from "../../src/app/snippets";
import { openVaultDatabase } from "../../src/storage/sqlite";

describe("attachment service", () => {
  let tempRoot: string;
  let filePath: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "cache-cli-attachments-"));
    filePath = path.join(tempRoot, "example.txt");
    await writeFile(filePath, "hello attachment\n", "utf8");
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("adds, lists, exports, and deletes attachments", async () => {
    const db = openVaultDatabase(tempRoot);
    const snippets = createSnippetService(db);
    const attachments = createAttachmentService(db);
    const created = await snippets.create({
      title: "With attachment",
      language: "text",
      code: "body",
      tags: [],
    });

    const added = await attachments.add(created.id, filePath);
    const listed = await attachments.list(created.id);
    const outputPath = path.join(tempRoot, "copied.txt");

    await attachments.writeToFile(added.id, outputPath);

    expect(listed).toHaveLength(1);
    expect(await readFile(outputPath, "utf8")).toBe("hello attachment\n");

    await attachments.remove(added.id);
    expect(await attachments.list(created.id)).toHaveLength(0);
  });

  it("removes attachment files when the parent snippet is deleted", async () => {
    const vaultPath = path.join(tempRoot, "vault");
    await runCli(["init", "--vault", vaultPath, "--set-default"]);

    const created = await runCli([
      "snippet",
      "create",
      filePath,
      "--vault",
      vaultPath,
      "--title",
      "Cascade attachment",
      "--language",
      "text",
    ]);

    if (!created.ok) {
      throw new Error("Expected snippet create command to succeed");
    }

    const snippetId = String((created.data as { id: string }).id);
    const added = await runCli(["attachment", "add", snippetId, filePath, "--vault", vaultPath]);

    if (!added.ok) {
      throw new Error("Expected attachment add command to succeed");
    }

    const attachmentId = String((added.data as { id: string }).id);
    const outputPath = path.join(tempRoot, "should-fail.txt");

    await runCli(["rm", snippetId, "--vault", vaultPath, "--yes"]);

    const listed = await runCli(["attachment", "list", snippetId, "--vault", vaultPath]);
    const downloaded = await runCli([
      "attachment",
      "get",
      attachmentId,
      "--vault",
      vaultPath,
      "--output",
      outputPath,
    ]);

    expect(listed.ok).toBe(true);
    expect(downloaded.ok).toBe(false);
    await expect(access(path.join(vaultPath, "attachments", snippetId))).rejects.toThrow();
  });
});
