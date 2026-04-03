export interface SessionStatus {
  ready: boolean;
  vaultPath: string | null;
}

export function renderSessionStatus(status: SessionStatus) {
  const lines = ["CodeCache shell", ""];

  if (!status.vaultPath) {
    lines.push("Status: not configured");
    lines.push("Run `cache init --vault PATH --set-default` to get started.");
    return lines.join("\n");
  }

  lines.push(`Vault: ${status.vaultPath}`);
  lines.push(`Ready: ${status.ready ? "yes" : "no"}`);
  lines.push("Type /help to see slash commands.");

  return lines.join("\n");
}
