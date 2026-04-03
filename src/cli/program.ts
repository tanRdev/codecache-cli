import path from "node:path";
import { readFile } from "node:fs/promises";
import { printError, printSuccess, resolveOutputFormat } from "./output";
import { createVaultDatabase, isVaultInitialized, openVaultDatabase } from "../storage/sqlite";
import { createSnippetService } from "../app/snippets";
import { resolveVaultPath, saveDefaultVault } from "../app/vault";
import { createAttachmentService } from "../app/attachments";
import { CacheError, createIoError, createValidationError } from "../shared/errors";
import type {
  CommandFailure,
  CommandResult,
  CommandSuccess,
  CreateSnippetInput,
  ListSnippetsInput,
  UpdateSnippetInput,
} from "../shared/types";
import { resolvePath } from "../shared/paths";
import { createPromptSession, isInteractiveSession } from "./interactive";

interface ParsedArgs {
  flags: Map<string, string[]>;
  positionals: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, string[]>();
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token) {
      continue;
    }

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const [name, inlineValue] = token.slice(2).split("=", 2);
    if (!name) {
      continue;
    }
    const nextToken = argv[index + 1];
    const values = flags.get(name) ?? [];

    if (inlineValue !== undefined) {
      values.push(inlineValue);
      flags.set(name, values);
      continue;
    }

    if (nextToken && !nextToken.startsWith("--")) {
      values.push(nextToken);
      flags.set(name, values);
      index += 1;
      continue;
    }

    values.push("true");
    flags.set(name, values);
  }

  return { flags, positionals };
}

function getFlag(args: ParsedArgs, name: string) {
  return args.flags.get(name)?.at(-1);
}

function getFlags(args: ParsedArgs, name: string) {
  return args.flags.get(name) ?? [];
}

function readTags(args: ParsedArgs) {
  const repeatedTags = getFlags(args, "tag");
  const joinedTags = getFlag(args, "tags");
  const csvTags = joinedTags ? joinedTags.split(",").map((tag) => tag.trim()).filter(Boolean) : [];
  return [...repeatedTags, ...csvTags];
}

function requireConfirmation(args: ParsedArgs, message: string) {
  if (getFlag(args, "yes") === "true") {
    return;
  }

  throw createValidationError(message);
}

function detectLanguage(source?: string) {
  if (!source || source === "-") {
    return "text";
  }

  const extension = path.extname(source).replace(/^\./, "");
  return extension || "text";
}

async function readSource(source?: string) {
  if (!source) {
    throw createValidationError("Provide a file path or pipe content via stdin");
  }

  if (source === "-") {
    const chunks: Buffer[] = [];

    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks).toString("utf8");
  }

  try {
    return await readFile(source, "utf8");
  } catch (error) {
    throw createIoError(
      error instanceof Error ? error.message : "Failed to read source file",
      { source },
    );
  }
}

async function requireVault(args: ParsedArgs) {
  const vaultPath = await resolveVaultPath(getFlag(args, "vault"));

  if (!vaultPath) {
    throw createValidationError("No vault configured. Run `cache init --vault PATH --set-default` first.");
  }

  const resolvedVaultPath = resolvePath(vaultPath);

  if (!isVaultInitialized(resolvedVaultPath)) {
    throw createValidationError("Vault is not initialized. Run `cache init --vault PATH --set-default` first.");
  }

  return resolvedVaultPath;
}

async function handleInit(args: ParsedArgs) {
  const explicitVault = getFlag(args, "vault");

  if (!explicitVault && isInteractiveSession()) {
    const prompt = createPromptSession();

    try {
      const suggestedVault = resolvePath("./.codecache");
      const vaultPath = resolvePath(await prompt.ask("Vault path", suggestedVault));
      const setDefault = await prompt.confirm("Save as default vault", true);

      createVaultDatabase(vaultPath);

      if (setDefault) {
        await saveDefaultVault(vaultPath);
      }

      return {
        vaultPath,
        created: true,
        default: setDefault,
      };
    } finally {
      prompt.close();
    }
  }

  if (!explicitVault) {
    throw createValidationError("`cache init` requires --vault PATH");
  }

  const vaultPath = resolvePath(explicitVault);
  createVaultDatabase(vaultPath);

  if (getFlag(args, "set-default") === "true") {
    await saveDefaultVault(vaultPath);
  }

  return {
    vaultPath,
    created: true,
    default: getFlag(args, "set-default") === "true",
  };
}

async function handleSnippet(args: ParsedArgs, alias?: "create" | "search" | "get") {
  const vaultPath = await requireVault(args);
  const vault = openVaultDatabase(vaultPath);
  const snippets = createSnippetService(vault);
  const subcommand = alias ?? args.positionals[1] ?? "list";

  if (subcommand === "create") {
    const source = args.positionals[2];

    if (!source && isInteractiveSession()) {
      const prompt = createPromptSession();

      try {
        const title = await prompt.ask("Title", "Untitled snippet");
        const language = await prompt.ask("Language", "text");
        const description = await prompt.ask("Description", "");
        const notes = await prompt.ask("Notes", "");
        const tagsValue = await prompt.ask("Tags (comma-separated)", "");
        const code = await prompt.askMultiline("Paste snippet code", ".");
        const interactiveInput: CreateSnippetInput = {
          title,
          language,
          code,
          tags: tagsValue ? tagsValue.split(",").map((tag: string) => tag.trim()).filter(Boolean) : [],
        };

        if (description) {
          interactiveInput.description = description;
        }

        if (notes) {
          interactiveInput.notes = notes;
        }

        return snippets.create(interactiveInput);
      } finally {
        prompt.close();
      }
    }

    const code = await readSource(source);
    const title = getFlag(args, "title") ?? (source && source !== "-" ? path.basename(source) : "stdin-snippet");
    const input: CreateSnippetInput = {
      title,
      language: getFlag(args, "language") ?? detectLanguage(source),
      code,
      tags: readTags(args),
    };

    const description = getFlag(args, "description");
    const notes = getFlag(args, "notes");

    if (description !== undefined) {
      input.description = description;
    }

    if (notes !== undefined) {
      input.notes = notes;
    }

    if (source && source !== "-") {
      input.sourcePath = resolvePath(source);
    }

    return snippets.create(input);
  }

  if (subcommand === "get") {
    const snippetId = args.positionals[2];

    if (!snippetId) {
      throw createValidationError("`cache snippet get` requires a snippet id");
    }

    const snippet = await snippets.get(snippetId);

    if (getFlag(args, "raw") === "true") {
      return snippet.code;
    }

    return snippet;
  }

  if (subcommand === "update") {
    const snippetId = args.positionals[2];

    if (!snippetId) {
      throw createValidationError("`cache snippet update` requires a snippet id");
    }

    const source = args.positionals[3];
    const input: UpdateSnippetInput = {};

    const title = getFlag(args, "title");
    const description = getFlag(args, "description");
    const notes = getFlag(args, "notes");
    const language = getFlag(args, "language");

    if (title !== undefined) {
      input.title = title;
    }

    if (description !== undefined) {
      input.description = description;
    }

    if (notes !== undefined) {
      input.notes = notes;
    }

    if (language !== undefined) {
      input.language = language;
    }

    if (source) {
      input.code = await readSource(source);
      input.language = input.language ?? detectLanguage(source);
    }

    if (source && source !== "-") {
      input.sourcePath = resolvePath(source);
    }

    if (args.flags.has("tag") || args.flags.has("tags")) {
      input.tags = readTags(args);
    }

    return snippets.update(snippetId, input);
  }

  if (subcommand === "delete") {
    const snippetId = args.positionals[2];

    if (!snippetId) {
      throw createValidationError("`cache snippet delete` requires a snippet id");
    }

    requireConfirmation(args, "`cache snippet delete` requires --yes");
    const attachments = createAttachmentService(vault);
    await attachments.removeSnippetFiles(snippetId);

    return snippets.remove(snippetId);
  }

  const query = alias === "search" ? args.positionals[1] : args.positionals[2];
  const input: ListSnippetsInput = { tags: readTags(args) };
  const limit = getFlag(args, "limit");

  if (query !== undefined) {
    input.query = query;
  }

  if (limit !== undefined) {
    input.limit = Number.parseInt(limit, 10);
  }

  return snippets.list(input);
}

async function handleTags(args: ParsedArgs) {
  const vaultPath = await requireVault(args);
  const snippets = createSnippetService(openVaultDatabase(vaultPath));
  return snippets.listTags();
}

async function handleVault(args: ParsedArgs) {
  const subcommand = args.positionals[1] ?? "show";

  if (subcommand === "use") {
    const vaultPath = args.positionals[2];

    if (!vaultPath) {
      throw createValidationError("`cache vault use` requires a path");
    }

    const resolvedPath = resolvePath(vaultPath);

    if (!isVaultInitialized(resolvedPath)) {
      throw createValidationError("Vault is not initialized. Run `cache init --vault PATH --set-default` first.");
    }

    await saveDefaultVault(resolvedPath);
    return { vaultPath: resolvedPath, default: true };
  }

  const vaultPath = await resolveVaultPath();

  if (!vaultPath) {
    throw createValidationError("No vault configured. Run `cache init --vault PATH --set-default` first.");
  }

  return { vaultPath: resolvePath(vaultPath) };
}

async function handleStatus(args: ParsedArgs) {
  const vaultPath = await requireVault(args);
  openVaultDatabase(vaultPath);
  return { vaultPath, ready: true };
}

async function handleAttachment(args: ParsedArgs) {
  const vaultPath = await requireVault(args);
  const attachments = createAttachmentService(openVaultDatabase(vaultPath));
  const subcommand = args.positionals[1] ?? "list";

  if (subcommand === "add") {
    const snippetId = args.positionals[2];
    const filePath = args.positionals[3];

    if (!snippetId || !filePath) {
      throw createValidationError("`cache attachment add` requires a snippet id and file path");
    }

    return attachments.add(snippetId, resolvePath(filePath));
  }

  if (subcommand === "get") {
    const attachmentId = args.positionals[2];
    const outputPath = getFlag(args, "output");

    if (!attachmentId || !outputPath) {
      throw createValidationError("`cache attachment get` requires an attachment id and --output PATH");
    }

    return attachments.writeToFile(attachmentId, resolvePath(outputPath));
  }

  if (subcommand === "delete") {
    const attachmentId = args.positionals[2];

    if (!attachmentId) {
      throw createValidationError("`cache attachment delete` requires an attachment id");
    }

    requireConfirmation(args, "`cache attachment delete` requires --yes");

    return attachments.remove(attachmentId);
  }

  const snippetId = args.positionals[2];

  if (!snippetId) {
    throw createValidationError("`cache attachment list` requires a snippet id");
  }

  return attachments.list(snippetId);
}

function ok<T>(data: T): CommandSuccess<T> {
  return { ok: true, data };
}

function fail(error: unknown): CommandFailure {
  if (error instanceof CacheError) {
    const payload: CommandFailure["error"] = {
      code: error.code,
      message: error.message,
    };

    if (error.details !== undefined) {
      payload.details = error.details;
    }

    return {
      ok: false,
      error: payload,
    };
  }

  return {
    ok: false,
    error: {
      code: "internal_error",
      message: error instanceof Error ? error.message : "Unexpected error",
    },
  };
}

export async function runCli(argv: string[]): Promise<CommandResult<unknown>> {
  const args = parseArgs(argv);
  const command = args.positionals[0] ?? "help";

  try {
    if (command === "help") {
      return ok({
        commands: [
          "cache init --vault PATH [--set-default]",
          "cache status [--vault PATH]",
          "cache vault show|use PATH",
          "cache snippet create|get|list|update|delete",
          "cache add|search|get|rm",
          "cache tags",
          "cache attachment add|list|get|delete",
        ],
        notes: [
          "pass --yes for destructive delete commands",
          "search matches code, metadata, and tags",
          "use - as the file path to read snippet content from stdin",
        ],
      });
    }

    if (command === "init") {
      return ok(await handleInit(args));
    }

    if (command === "snippet") {
      return ok(await handleSnippet(args));
    }

    if (command === "tags") {
      return ok(await handleTags(args));
    }

    if (command === "vault") {
      return ok(await handleVault(args));
    }

    if (command === "status") {
      return ok(await handleStatus(args));
    }

    if (command === "attachment") {
      return ok(await handleAttachment(args));
    }

    if (command === "add") {
      return ok(await handleSnippet({ ...args, positionals: ["snippet", "create", ...args.positionals.slice(1)] }, "create"));
    }

    if (command === "search") {
      return ok(await handleSnippet(args, "search"));
    }

    if (command === "get") {
      return ok(await handleSnippet({ ...args, positionals: ["snippet", "get", ...args.positionals.slice(1)] }, "get"));
    }

    if (command === "rm") {
      return ok(await handleSnippet({ ...args, positionals: ["snippet", "delete", ...args.positionals.slice(1)] }));
    }

    return fail(createValidationError(`Unknown command: ${command}`));
  } catch (error) {
    return fail(error);
  }
}

export async function main(argv = process.argv) {
  if (argv.slice(2).length === 0 && isInteractiveSession()) {
    const { runInteractiveShell } = await import("./interactive-shell");
    await runInteractiveShell();
    return;
  }

  const args = parseArgs(argv.slice(2));
  const format = resolveOutputFormat(getFlag(args, "format"), Boolean(process.stdout.isTTY));
  const result = await runCli(argv.slice(2));
  const rawRequested = argv.slice(2).includes("--raw");

  if (result.ok) {
    if (rawRequested && typeof result.data === "string") {
      process.stdout.write(result.data);
      return;
    }

    printSuccess(result.data, format);
    return;
  }

  printError(new CacheError(result.error.code, result.error.message, 400, result.error.details), format);
  process.exitCode = 1;
}
