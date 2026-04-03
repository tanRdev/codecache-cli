import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSnippetService } from "@/app/snippets";
import { openVaultDatabase } from "@/storage/sqlite";

describe("sqlite storage", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "cache-cli-storage-"));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("bootstraps a vault database and stores snippets", async () => {
    const db = openVaultDatabase(tempRoot);
    const snippets = createSnippetService(db);

    const created = await snippets.create({
      title: "Answer",
      description: "Useful code",
      notes: "Remember this",
      language: "typescript",
      code: "export const answer = 42;",
      tags: ["demo", "math"],
    });

    const snippet = await snippets.get(created.id);

    expect(snippet.title).toBe("Answer");
    expect(snippet.tags).toEqual(["demo", "math"]);
  });

  it("searches snippets across code and metadata", async () => {
    const db = openVaultDatabase(tempRoot);
    const snippets = createSnippetService(db);

    await snippets.create({
      title: "Reducer helper",
      description: "State helper",
      notes: "Use in forms",
      language: "typescript",
      code: "export function createReducer() { return 'ok'; }",
      tags: ["react", "state"],
    });

    const byCode = await snippets.list({ query: "createReducer" });
    const byTag = await snippets.list({ query: "react" });

    expect(byCode).toHaveLength(1);
    expect(byTag).toHaveLength(1);
  });

  it("limits snippet list results", async () => {
    const db = openVaultDatabase(tempRoot);
    const snippets = createSnippetService(db);

    await snippets.create({
      title: "One",
      language: "text",
      code: "one",
      tags: [],
    });
    await snippets.create({
      title: "Two",
      language: "text",
      code: "two",
      tags: [],
    });

    const result = await snippets.list({ limit: 1 });

    expect(result).toHaveLength(1);
  });

  it("updates and deletes snippets", async () => {
    const db = openVaultDatabase(tempRoot);
    const snippets = createSnippetService(db);

    const created = await snippets.create({
      title: "Before",
      language: "ts",
      code: "const value = 1;",
      tags: [],
    });

    await snippets.update(created.id, {
      title: "After",
      code: "const value = 2;",
      tags: ["updated"],
    });

    const updated = await snippets.get(created.id);
    expect(updated.title).toBe("After");
    expect(updated.tags).toEqual(["updated"]);

    await snippets.remove(created.id);
    await expect(snippets.get(created.id)).rejects.toThrow("Snippet not found");
  });
});
