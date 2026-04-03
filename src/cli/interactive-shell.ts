import { createPromptSession, createShellSession } from "./interactive";
import { renderSuccess } from "./output";
import { getSlashCommandSuggestions, resolveShellInput } from "./shell";
import { renderSessionStatus } from "./session";
import {
  formatErrorMessage,
  formatHelpPanel,
  formatShellFrame,
  formatSuccessMessage,
  formatSuggestionsBelowInput,
} from "./ui";
import { resolveVaultPath } from "../app/vault";
import { isVaultInitialized } from "../storage/sqlite";
import { runCli } from "./program";
import { CacheError } from "../shared/errors";

function clampActivity(activity: string[], nextLine: string) {
  return [...activity, nextLine].slice(-20);
}

function renderShell(shell: { write(message: string): void }, status: Awaited<ReturnType<typeof getInteractiveSessionStatus>>, input: string, activity: string[]) {
  const frame = formatShellFrame(input, status, activity);
  process.stdout.write("\x1Bc");
  shell.write(`${frame.join("\n")}\n\n`);
}

function renderPrompt(shell: { write(message: string): void }, prompt: string, input: string) {
  shell.write(`${prompt}${input}`);
}

function shouldConfirmDestructiveCommand(argv: string[]) {
  return (
    (argv[0] === "snippet" && argv[1] === "delete") ||
    (argv[0] === "attachment" && argv[1] === "delete")
  );
}

function getDestructiveCommandLabel(argv: string[]) {
  return argv.join(" ");
}

async function getInteractiveSessionStatus() {
  const vaultPath = await resolveVaultPath();

  if (!vaultPath) {
    return {
      ready: false,
      vaultPath: null,
    };
  }

  return {
    ready: isVaultInitialized(vaultPath),
    vaultPath,
  };
}

export async function runInteractiveShell() {
  const shell = createShellSession();

  try {
    let status = await getInteractiveSessionStatus();
    let activity: string[] = [formatSuccessMessage("Ready. Use /help to explore commands.")];
    renderShell(shell, status, "", activity);

    while (true) {
      const line = await shell.readLine((input, completion) => {
        renderShell(shell, status, input, activity);
        renderPrompt(shell, "> ", input);
        const suggestions = formatSuggestionsBelowInput(input, completion?.selectedIndex);

        if (suggestions.length > 0) {
          shell.write(`${suggestions.join("\n")}\n`);
        }
      }, getSlashCommandSuggestions);

      if (!line) {
        continue;
      }

      if (line === "/") {
        activity = formatHelpPanel();
        renderShell(shell, status, line, activity);
        continue;
      }

      if (line === "/status") {
        status = await getInteractiveSessionStatus();
        activity = clampActivity(activity, formatSuccessMessage(renderSessionStatus(status)));
        renderShell(shell, status, line, activity);
        continue;
      }

      const resolved = resolveShellInput(line);

      if (resolved.kind === "builtin") {
        if (resolved.builtin === "exit") {
          break;
        }

        if (resolved.builtin === "help") {
          activity = formatHelpPanel();
          renderShell(shell, status, line, activity);
          continue;
        }

        if (resolved.builtin === "clear") {
          status = await getInteractiveSessionStatus();
          activity = [formatSuccessMessage("Cleared the screen.")];
          renderShell(shell, status, "", activity);
          continue;
        }
      }

      if (resolved.kind === "command" && resolved.argv[0] === "snippet" && resolved.argv[1] === "create" && !resolved.argv[2]) {
        const prompt = createPromptSession();

        try {
          const title = await prompt.ask("Title", "Untitled snippet");
          const language = await prompt.ask("Language", "text");
          const description = await prompt.ask("Description", "");
          const notes = await prompt.ask("Notes", "");
          const tagsValue = await prompt.ask("Tags (comma-separated)", "");
          const code = await prompt.askMultiline("Paste snippet code", ".");

          const argv = [
            "snippet",
            "create",
            "-",
            "--title",
            title,
            "--language",
            language,
            "--description",
            description,
            "--notes",
            notes,
          ];

          tagsValue.split(",").map((tag) => tag.trim()).filter(Boolean).forEach((tag) => {
            argv.push("--tag", tag);
          });

          const originalStdin = process.stdin;
          const { PassThrough } = await import("node:stream");
          const stdin = new PassThrough();
          Object.defineProperty(process, "stdin", { value: stdin, configurable: true });
          stdin.end(code);

          try {
            const result = await runCli(argv);
            activity = clampActivity(activity, renderSuccess(result, "human").trim());
          } finally {
            Object.defineProperty(process, "stdin", { value: originalStdin, configurable: true });
          }
        } catch (error) {
          activity = clampActivity(activity, formatErrorMessage(error instanceof Error ? error.message : "Snippet create failed"));
        } finally {
          prompt.close();
        }

        status = await getInteractiveSessionStatus();
        renderShell(shell, status, line, activity);
        continue;
      }

      if (resolved.kind === "command" && shouldConfirmDestructiveCommand(resolved.argv)) {
        const confirmed = await shell.confirm(`Run destructive command: ${getDestructiveCommandLabel(resolved.argv)}?`, false);

        if (!confirmed) {
          activity = clampActivity(activity, formatErrorMessage("Cancelled."));
          renderShell(shell, status, line, activity);
          continue;
        }

        resolved.argv.push("--yes");
      }

      try {
        const result = await runCli(resolved.kind === "command" ? resolved.argv : []);
        activity = clampActivity(activity, renderSuccess(result, "human").trim());
        status = await getInteractiveSessionStatus();
        renderShell(shell, status, line, activity);
      } catch (error) {
        const message = error instanceof CacheError || error instanceof Error ? error.message : "Unexpected error";
        activity = clampActivity(activity, formatErrorMessage(message));
        renderShell(shell, status, line, activity);
      }
    }
  } finally {
    shell.close();
  }
}
