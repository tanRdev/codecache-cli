import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { main, runCli } from "../../src/index";
import { resolveShellInput, getSlashCommandSuggestions } from "../../src/cli/shell";

describe("interactive shell behavior", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "codecache-interactive-"));
    process.env.CACHE_CLI_CONFIG_DIR = tempRoot;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("routes slash aliases to CLI commands", () => {
    expect(resolveShellInput("/add file.ts")).toEqual({
      kind: "command",
      argv: ["snippet", "create", "file.ts"],
    });

    expect(resolveShellInput("/search reducer")).toEqual({
      kind: "command",
      argv: ["snippet", "search", "reducer"],
    });

    expect(resolveShellInput("/status")).toEqual({
      kind: "builtin",
      builtin: "status",
    });
  });

  it("returns slash suggestions", () => {
    expect(getSlashCommandSuggestions("/sn")).toContain("/snippet create");
    expect(getSlashCommandSuggestions("/sn")).toContain("/snippet list");
  });

  it("opens interactive shell when no args are passed on a tty", async () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const originalStdoutIsTTY = process.stdout.isTTY;
    const originalStdinIsTTY = process.stdin.isTTY;
    const interactiveModule = await import("../../src/cli/interactive");
    const shellWrite = vi.fn();
    const shellSpy = vi.spyOn(interactiveModule, "createShellSession").mockReturnValue({
      close: vi.fn(),
      confirm: vi.fn().mockResolvedValue(false),
      readLine: vi.fn().mockResolvedValue("/exit"),
      write: shellWrite,
    });

    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

    try {
      await main(["node", "cache"]);
    } finally {
      Object.defineProperty(process.stdout, "isTTY", { value: originalStdoutIsTTY, configurable: true });
      Object.defineProperty(process.stdin, "isTTY", { value: originalStdinIsTTY, configurable: true });
    }

    expect(shellSpy).toHaveBeenCalled();
    expect(stdoutSpy).toHaveBeenCalledWith("\x1Bc");
    expect(shellWrite).toHaveBeenCalledWith(expect.stringContaining("CODECACHE"));
  });

  it("supports interactive snippet creation when no file is provided", async () => {
    await runCli(["init", "--vault", path.join(tempRoot, "vault"), "--set-default"]);

    const promptModule = await import("../../src/cli/interactive");
    const promptSpy = vi.spyOn(promptModule, "createPromptSession").mockReturnValue({
      ask: vi.fn()
        .mockResolvedValueOnce("Interactive snippet")
        .mockResolvedValueOnce("typescript")
        .mockResolvedValueOnce("Description")
        .mockResolvedValueOnce("Notes")
        .mockResolvedValueOnce("demo,interactive"),
      askMultiline: vi.fn().mockResolvedValue("export const interactive = true;\n"),
      choose: vi.fn(),
      confirm: vi.fn(),
      write: vi.fn(),
      close: vi.fn(),
    });

    const originalStdoutIsTTY = process.stdout.isTTY;
    const originalStdinIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

    try {
      const result = await runCli(["snippet", "create", "--vault", path.join(tempRoot, "vault")]);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error("Expected interactive snippet create to succeed");
      }
    } finally {
      Object.defineProperty(process.stdout, "isTTY", { value: originalStdoutIsTTY, configurable: true });
      Object.defineProperty(process.stdin, "isTTY", { value: originalStdinIsTTY, configurable: true });
    }

    promptSpy.mockRestore();
  });
});
