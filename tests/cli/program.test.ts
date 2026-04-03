import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "@/cli/program";

describe("cli program", () => {
  let tempRoot: string;
  let vaultPath: string;
  let snippetFile: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "cache-cli-program-"));
    vaultPath = path.join(tempRoot, "vault");
    snippetFile = path.join(tempRoot, "snippet.ts");
    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(snippetFile, "export const cached = true;\n", "utf8"),
    );
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("initializes a vault and saves it as default", async () => {
    const result = await runCli(["init", "--vault", vaultPath, "--set-default"]);

    expect(result).toMatchObject({ ok: true });
    await expect(readFile(path.join(vaultPath, "cache.sqlite"))).resolves.toBeDefined();
  });

  it("reports status for an initialized vault", async () => {
    await runCli(["init", "--vault", vaultPath, "--set-default"]);

    const result = await runCli(["status", "--vault", vaultPath]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({ vaultPath, ready: true });
    }
  });

  it("does not create a vault for a missing status path", async () => {
    const missingVault = path.join(tempRoot, "missing-vault");

    const result = await runCli(["status", "--vault", missingVault]);

    expect(result.ok).toBe(false);
    await expect(readFile(path.join(missingVault, "cache.sqlite"))).rejects.toThrow();
  });

  it("creates, fetches, and searches snippets", async () => {
    await runCli(["init", "--vault", vaultPath, "--set-default"]);

    const created = await runCli([
      "add",
      snippetFile,
      "--vault",
      vaultPath,
      "--title",
      "Cached snippet",
      "--tag",
      "demo",
    ]);

    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error("Expected create command to succeed");
    }

    const snippetId = String((created.data as { id: string }).id);
    const fetched = await runCli(["get", snippetId, "--vault", vaultPath]);
    const searched = await runCli(["search", "cached", "--vault", vaultPath]);

    expect(fetched.ok).toBe(true);
    expect(searched.ok).toBe(true);
    if (fetched.ok) {
      expect((fetched.data as { title: string }).title).toBe("Cached snippet");
    }
    if (searched.ok) {
      expect((searched.data as Array<{ id: string }>)).toHaveLength(1);
    }
  });

  it("supports limiting list results", async () => {
    await runCli(["init", "--vault", vaultPath, "--set-default"]);

    await runCli(["add", snippetFile, "--vault", vaultPath, "--title", "One"]);
    await runCli(["add", snippetFile, "--vault", vaultPath, "--title", "Two"]);

    const result = await runCli(["snippet", "list", "--vault", vaultPath, "--limit", "1"]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as Array<unknown>)).toHaveLength(1);
    }
  });

  it("supports vault commands, snippet updates, tags, and raw get", async () => {
    await runCli(["init", "--vault", vaultPath, "--set-default"]);

    const created = await runCli([
      "add",
      snippetFile,
      "--vault",
      vaultPath,
      "--title",
      "Original",
      "--tag",
      "first",
    ]);

    if (!created.ok) {
      throw new Error("Expected create command to succeed");
    }

    const snippetId = String((created.data as { id: string }).id);
    const updated = await runCli([
      "snippet",
      "update",
      snippetId,
      snippetFile,
      "--vault",
      vaultPath,
      "--title",
      "Updated",
      "--tag",
      "second",
    ]);
    const tags = await runCli(["tags", "--vault", vaultPath]);
    const vaultShow = await runCli(["vault", "show"]);
    const raw = await runCli(["snippet", "get", snippetId, "--vault", vaultPath, "--raw"]);

    expect(updated.ok).toBe(true);
    expect(tags.ok).toBe(true);
    expect(vaultShow.ok).toBe(true);
    expect(raw.ok).toBe(true);

    if (tags.ok) {
      expect(tags.data).toEqual(["second"]);
    }

    if (vaultShow.ok) {
      expect(vaultShow.data).toMatchObject({ vaultPath });
    }

    if (raw.ok) {
      expect(raw.data).toBe("export const cached = true;\n");
    }
  });

  it("supports switching the default vault", async () => {
    const firstVault = path.join(tempRoot, "vault-one");
    const secondVault = path.join(tempRoot, "vault-two");

    await runCli(["init", "--vault", firstVault, "--set-default"]);
    await runCli(["init", "--vault", secondVault]);
    const switched = await runCli(["vault", "use", secondVault]);
    const shown = await runCli(["vault", "show"]);

    expect(switched.ok).toBe(true);
    expect(shown.ok).toBe(true);

    if (shown.ok) {
      expect(shown.data).toMatchObject({ vaultPath: secondVault });
    }
  });

  it("rejects switching to a vault that is not initialized", async () => {
    const missingVault = path.join(tempRoot, "missing-vault");

    const result = await runCli(["vault", "use", missingVault]);

    expect(result.ok).toBe(false);
  });

  it("reads snippet content from stdin", async () => {
    await runCli(["init", "--vault", vaultPath, "--set-default"]);

    const originalStdin = process.stdin;
    const stdin = new PassThrough();
    Object.defineProperty(process, "stdin", {
      value: stdin,
      configurable: true,
    });

    stdin.end("const fromStdin = true;\n");

    try {
      const created = await runCli([
        "add",
        "-",
        "--vault",
        vaultPath,
        "--title",
        "stdin-snippet",
        "--language",
        "typescript",
      ]);

      expect(created.ok).toBe(true);
      if (!created.ok) {
        throw new Error("Expected stdin create command to succeed");
      }

      const snippetId = String((created.data as { id: string }).id);
      const fetched = await runCli(["get", snippetId, "--vault", vaultPath]);

      expect(fetched.ok).toBe(true);
      if (fetched.ok) {
        expect((fetched.data as { code: string }).code).toBe("const fromStdin = true;\n");
      }
    } finally {
      Object.defineProperty(process, "stdin", {
        value: originalStdin,
        configurable: true,
      });
    }
  });

  it("supports attachment commands and snippet deletion", async () => {
    await runCli(["init", "--vault", vaultPath, "--set-default"]);

    const created = await runCli([
      "add",
      snippetFile,
      "--vault",
      vaultPath,
      "--title",
      "With file",
    ]);

    if (!created.ok) {
      throw new Error("Expected create command to succeed");
    }

    const attachmentSource = path.join(tempRoot, "info.txt");
    await import("node:fs/promises").then(({ writeFile }) => writeFile(attachmentSource, "attached\n", "utf8"));

    const snippetId = String((created.data as { id: string }).id);
    const added = await runCli(["attachment", "add", snippetId, attachmentSource, "--vault", vaultPath]);

    expect(added.ok).toBe(true);
    if (!added.ok) {
      throw new Error("Expected attachment command to succeed");
    }

    const attachmentId = String((added.data as { id: string }).id);
    const listed = await runCli(["attachment", "list", snippetId, "--vault", vaultPath]);
    const exportPath = path.join(tempRoot, "exported.txt");
    const downloaded = await runCli([
      "attachment",
      "get",
      attachmentId,
      "--vault",
      vaultPath,
      "--output",
      exportPath,
    ]);
    const deletedSnippet = await runCli(["rm", snippetId, "--vault", vaultPath, "--yes"]);

    expect(listed.ok).toBe(true);
    expect(downloaded.ok).toBe(true);
    expect(deletedSnippet.ok).toBe(true);
    await expect(readFile(exportPath, "utf8")).resolves.toBe("attached\n");
  });

  it("requires --yes for destructive snippet deletion", async () => {
    await runCli(["init", "--vault", vaultPath, "--set-default"]);

    const created = await runCli([
      "add",
      snippetFile,
      "--vault",
      vaultPath,
      "--title",
      "Needs confirm",
    ]);

    if (!created.ok) {
      throw new Error("Expected create command to succeed");
    }

    const snippetId = String((created.data as { id: string }).id);
    const rejected = await runCli(["rm", snippetId, "--vault", vaultPath]);
    const accepted = await runCli(["rm", snippetId, "--vault", vaultPath, "--yes"]);

    expect(rejected.ok).toBe(false);
    expect(accepted.ok).toBe(true);
  });

  it("requires --yes for destructive attachment deletion", async () => {
    await runCli(["init", "--vault", vaultPath, "--set-default"]);

    const created = await runCli([
      "add",
      snippetFile,
      "--vault",
      vaultPath,
      "--title",
      "Attachment confirm",
    ]);

    if (!created.ok) {
      throw new Error("Expected create command to succeed");
    }

    const attachmentSource = path.join(tempRoot, "confirm.txt");
    await import("node:fs/promises").then(({ writeFile }) => writeFile(attachmentSource, "confirm\n", "utf8"));
    const snippetId = String((created.data as { id: string }).id);
    const added = await runCli(["attachment", "add", snippetId, attachmentSource, "--vault", vaultPath]);

    if (!added.ok) {
      throw new Error("Expected attachment create command to succeed");
    }

    const attachmentId = String((added.data as { id: string }).id);
    const rejected = await runCli(["attachment", "delete", attachmentId, "--vault", vaultPath]);
    const accepted = await runCli(["attachment", "delete", attachmentId, "--vault", vaultPath, "--yes"]);

    expect(rejected.ok).toBe(false);
    expect(accepted.ok).toBe(true);
  });

  it("rejects blank title and language updates", async () => {
    await runCli(["init", "--vault", vaultPath, "--set-default"]);

    const created = await runCli([
      "add",
      snippetFile,
      "--vault",
      vaultPath,
      "--title",
      "Needs validation",
    ]);

    if (!created.ok) {
      throw new Error("Expected create command to succeed");
    }

    const snippetId = String((created.data as { id: string }).id);
    const result = await runCli([
      "snippet",
      "update",
      snippetId,
      "--vault",
      vaultPath,
      "--title",
      "   ",
      "--language",
      "   ",
    ]);

    expect(result.ok).toBe(false);
  });

  it("returns an io_error for missing source files", async () => {
    await runCli(["init", "--vault", vaultPath, "--set-default"]);

    const result = await runCli([
      "add",
      path.join(tempRoot, "missing.ts"),
      "--vault",
      vaultPath,
      "--title",
      "missing",
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("io_error");
    }
  });

  it("prints raw snippet content for non-tty main output", async () => {
    await runCli(["init", "--vault", vaultPath, "--set-default"]);

    const created = await runCli([
      "add",
      snippetFile,
      "--vault",
      vaultPath,
      "--title",
      "Raw output",
    ]);

    if (!created.ok) {
      throw new Error("Expected create command to succeed");
    }

    const snippetId = String((created.data as { id: string }).id);
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const originalIsTTY = process.stdout.isTTY;
    const { main } = await import("@/index");

    Object.defineProperty(process.stdout, "isTTY", {
      value: false,
      configurable: true,
    });

    try {
      await main(["node", "cache", "snippet", "get", snippetId, "--vault", vaultPath, "--raw"]);
    } finally {
      Object.defineProperty(process.stdout, "isTTY", {
        value: originalIsTTY,
        configurable: true,
      });
    }

    expect(stdoutSpy).toHaveBeenCalledWith("export const cached = true;\n");
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("prints help through the public main entrypoint", async () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const { main } = await import("@/index");

    await main(["node", "cache", "help"]);

    expect(stdoutSpy).toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
