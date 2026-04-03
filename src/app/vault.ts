import os from "node:os";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

interface ConfigFile {
  defaultVaultPath: string | null;
}

function getConfigDir() {
  return process.env.CACHE_CLI_CONFIG_DIR ?? path.join(os.homedir(), ".cache-cli");
}

export function getConfigPath() {
  return path.join(getConfigDir(), "config.json");
}

async function readConfig(): Promise<ConfigFile> {
  try {
    const content = await readFile(getConfigPath(), "utf8");
    const parsed = JSON.parse(content);

    if (!parsed || typeof parsed !== "object") {
      return { defaultVaultPath: null };
    }

    const rawDefaultVaultPath = "defaultVaultPath" in parsed
      ? parsed.defaultVaultPath
      : null;

    return {
      defaultVaultPath: typeof rawDefaultVaultPath === "string" ? rawDefaultVaultPath : null,
    };
  } catch {
    return { defaultVaultPath: null };
  }
}

async function writeConfig(config: ConfigFile) {
  await mkdir(getConfigDir(), { recursive: true });
  await writeFile(getConfigPath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function saveDefaultVault(vaultPath: string) {
  await writeConfig({ defaultVaultPath: vaultPath });
}

export async function readSavedDefaultVault() {
  const config = await readConfig();
  return config.defaultVaultPath;
}

export async function resolveVaultPath(explicitVaultPath?: string) {
  if (explicitVaultPath?.trim()) {
    return explicitVaultPath;
  }

  if (process.env.CACHE_CLI_VAULT?.trim()) {
    return process.env.CACHE_CLI_VAULT;
  }

  return readSavedDefaultVault();
}
