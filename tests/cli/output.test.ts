import { afterEach, describe, expect, it, vi } from "vitest";
import { printSuccess, renderSuccess, resolveOutputFormat } from "../../src/cli/output";

describe("cli output", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to human format for TTY sessions", () => {
    expect(resolveOutputFormat(undefined, true)).toBe("human");
    expect(resolveOutputFormat(undefined, false)).toBe("json");
  });

  it("renders snippet lists in a human-readable form", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    printSuccess(
      [
        {
          id: "snippet-1",
          title: "Answer",
          language: "typescript",
          tags: ["math", "demo"],
        },
      ],
      "human",
    );

    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining("Answer"));
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining("snippet-1"));
  });

  it("masks secret fields in human-readable output", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    printSuccess(
      {
        vaultPath: "/tmp/demo",
        token: "secret-value",
      },
      "human",
    );

    expect(writeSpy).toHaveBeenCalledWith(expect.not.stringContaining("secret-value"));
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining("[hidden]"));
  });

  it("can render output without printing it", () => {
    const result = renderSuccess({ vaultPath: "/tmp/demo", token: "secret" }, "human");

    expect(result).toContain("/tmp/demo");
    expect(result).toContain("[hidden]");
    expect(result).not.toContain("secret");
  });

  it("renders full snippet bodies for human get-style output", () => {
    const result = renderSuccess(
      {
        id: "snippet-1",
        title: "Reducer helper",
        language: "typescript",
        code: "export const reducer = () => null;",
        notes: "keep this",
        tags: ["react"],
      },
      "human",
    );

    expect(result).toContain("export const reducer = () => null;");
    expect(result).toContain("notes:");
  });
});
