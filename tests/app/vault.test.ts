import { afterEach, beforeEach, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import {
  getConfigPath,
  readSavedDefaultVault,
  resolveVaultPath,
  saveDefaultVault,
} from "../../src/app/vault";

describe("vault resolution", () => {
  const originalEnv = { ...process.env };
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "cache-cli-test-"));
    process.env.CACHE_CLI_CONFIG_DIR = tempRoot;
    delete process.env.CACHE_CLI_VAULT;
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("saves and loads the default vault path", async () => {
    const vaultPath = path.join(tempRoot, "vault-a");

    await saveDefaultVault(vaultPath);

    expect(await readSavedDefaultVault()).toBe(vaultPath);
    expect(getConfigPath()).toBe(path.join(tempRoot, "config.json"));
  });

  it("resolves an explicit vault path first", async () => {
    await saveDefaultVault(path.join(tempRoot, "saved"));
    process.env.CACHE_CLI_VAULT = path.join(tempRoot, "env");

    const resolved = await resolveVaultPath(path.join(tempRoot, "explicit"));

    expect(resolved).toBe(path.join(tempRoot, "explicit"));
  });

  it("resolves the env vault path before the saved default", async () => {
    await saveDefaultVault(path.join(tempRoot, "saved"));
    process.env.CACHE_CLI_VAULT = path.join(tempRoot, "env");

    expect(await resolveVaultPath()).toBe(path.join(tempRoot, "env"));
  });

  it("falls back to the saved default vault path", async () => {
    const savedVault = path.join(tempRoot, "saved");
    await saveDefaultVault(savedVault);

    expect(await resolveVaultPath()).toBe(savedVault);
  });

  it("returns null when no vault is configured", async () => {
    expect(await resolveVaultPath()).toBeNull();
  });
});
