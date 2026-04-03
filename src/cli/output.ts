import { CacheError } from "@/shared/errors";

export type OutputFormat = "human" | "json" | "jsonl";

function stringify(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function formatPrimitive(value: unknown) {
  if (value === null || value === undefined) {
    return "-";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return stringify(value);
}

function isSecretKey(key: string) {
  return ["token", "apiKey", "connectionString", "encryptedSecretJson", "tokenHash", "token_hash"]
    .includes(key);
}

function formatField(key: string, value: unknown) {
  if (isSecretKey(key) && value) {
    return "[hidden]";
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return formatPrimitive(value);
}

function formatRecord(record: Record<string, unknown>) {
  if (typeof record.code === "string") {
    return Object.entries(record)
      .map(([key, value]) => `${key}: ${formatField(key, value)}`)
      .join("\n");
  }

  const preferredLabel = [record.title, record.name, record.id]
    .find((value) => typeof value === "string" && value.trim());

  if (preferredLabel && typeof record.id === "string" && preferredLabel !== record.id) {
    const details: string[] = [];

    if (typeof record.language === "string") {
      details.push(`language: ${record.language}`);
    }

    if (Array.isArray(record.tags) && record.tags.length > 0) {
      details.push(`tags: ${record.tags.join(", ")}`);
    }

    const detailText = details.length > 0 ? ` (${details.join(" | ")})` : "";
    return `${preferredLabel} [${record.id}]${detailText}`;
  }

  return Object.entries(record)
    .map(([key, value]) => `${key}: ${formatField(key, value)}`)
    .join("\n");
}

function toRecord(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value));
}

function renderHuman(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return "No results.";
    }

    return data
      .map((item) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          return `- ${formatRecord(toRecord(item))}`;
        }

        return `- ${formatPrimitive(item)}`;
      })
      .join("\n");
  }

  if (data && typeof data === "object") {
    return formatRecord(toRecord(data));
  }

  return formatPrimitive(data);
}

export function resolveOutputFormat(requestedFormat: string | undefined, isTTY: boolean) {
  if (requestedFormat === "human" || requestedFormat === "json" || requestedFormat === "jsonl") {
    return requestedFormat;
  }

  return isTTY ? "human" : "json";
}

export function printSuccess(data: unknown, format: OutputFormat) {
  if (format === "human") {
    process.stdout.write(`${renderHuman(data)}\n`);
    return;
  }

  if (format === "jsonl" && Array.isArray(data)) {
    data.forEach((item) => {
      process.stdout.write(`${JSON.stringify(item)}\n`);
    });
    return;
  }

  process.stdout.write(`${stringify({ ok: true, data })}\n`);
}

export function printError(error: unknown, format: OutputFormat) {
  const payload = error instanceof CacheError
    ? {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      }
    : {
        ok: false,
        error: {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unexpected error",
        },
      };

  if (format === "human") {
    process.stderr.write(`${payload.error.message}\n`);
    return;
  }

  process.stderr.write(`${stringify(payload)}\n`);
}

export function renderSuccess(data: unknown, format: OutputFormat) {
  if (format === "human") {
    return `${renderHuman(data)}\n`;
  }

  if (format === "jsonl" && Array.isArray(data)) {
    return data.map((item) => JSON.stringify(item)).join("\n") + "\n";
  }

  return `${stringify({ ok: true, data })}\n`;
}
