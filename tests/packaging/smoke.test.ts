import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("packaging smoke", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "cache-cli-package-"));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("supports requiring the built main entrypoint", async () => {
    await execFileAsync("npm", ["run", "build"], {
      cwd: path.resolve(__dirname, "../.."),
    });

    const builtModule = await import("../../dist/index.js");

    expect(typeof builtModule.main).toBe("function");
  });
});
