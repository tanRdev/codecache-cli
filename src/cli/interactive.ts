import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";

export function isInteractiveSession() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export function resolveChoice(input: string, options: string[]) {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  const index = Number(trimmed);
  if (Number.isInteger(index) && index >= 1 && index <= options.length) {
    return options[index - 1] ?? null;
  }

  const normalizedInput = trimmed.toLowerCase();
  return options.find((option) => option.toLowerCase() === normalizedInput) ?? null;
}

export interface PromptSession {
  ask(message: string, defaultValue?: string): Promise<string>;
  askMultiline(message: string, terminator?: string): Promise<string>;
  choose(message: string, options: string[], defaultValue?: string): Promise<string>;
  confirm(message: string, defaultValue?: boolean): Promise<boolean>;
  write(message: string): void;
  close(): void;
}

export function createPromptSession(): PromptSession {
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return {
    async ask(message: string, defaultValue?: string) {
      const suffix = defaultValue ? ` (${defaultValue})` : "";
      const answer = await prompt.question(`${message}${suffix}: `);
      const trimmed = answer.trim();
      return trimmed || defaultValue || "";
    },

    async askMultiline(message: string, terminator = ".") {
      process.stdout.write(`${message}\n`);
      process.stdout.write(`Finish with a line containing only ${terminator}\n`);
      const lines: string[] = [];

      while (true) {
        const line = await prompt.question("");

        if (line.trim() === terminator) {
          return lines.join("\n");
        }

        lines.push(line);
      }
    },

    async choose(message: string, options: string[], defaultValue?: string) {
      process.stdout.write(`${message}\n`);
      options.forEach((option, index) => {
        process.stdout.write(`  ${index + 1}) ${option}\n`);
      });

      while (true) {
        const suffix = defaultValue ? ` [${defaultValue}]` : "";
        const answer = await prompt.question(`Choose one${suffix}: `);
        const resolved = resolveChoice(answer || defaultValue || "", options);

        if (resolved) {
          return resolved;
        }

        process.stdout.write(`Please choose one of: ${options.join(", ")}\n`);
      }
    },

    async confirm(message: string, defaultValue = true) {
      const suffix = defaultValue ? "[Y/n]" : "[y/N]";

      while (true) {
        const answer = (await prompt.question(`${message} ${suffix}: `)).trim().toLowerCase();

        if (!answer) {
          return defaultValue;
        }

        if (answer === "y" || answer === "yes") {
          return true;
        }

        if (answer === "n" || answer === "no") {
          return false;
        }

        process.stdout.write("Please answer yes or no.\n");
      }
    },

    write(message: string) {
      process.stdout.write(message);
    },

    close() {
      prompt.close();
    },
  };
}

export function supportsInteractiveShell() {
  return isInteractiveSession();
}

export interface CompletionState {
  suggestions: string[];
  selectedIndex: number;
}

export interface ShellSession {
  close(): void;
  confirm(message: string, defaultValue?: boolean): Promise<boolean>;
  readLine(render: (input: string, completion?: CompletionState) => void, getSuggestions?: (input: string) => string[]): Promise<string>;
  write(message: string): void;
}

export function createShellSession(): ShellSession {
  const stdin = process.stdin;
  const stdout = process.stdout;

  emitKeypressEvents(stdin);

  if (typeof stdin.setRawMode === "function") {
    stdin.setRawMode(true);
  }

  stdin.resume();

  return {
    readLine(render, getSuggestions?) {
      return new Promise<string>((resolve) => {
        let input = "";
        let completion: CompletionState | undefined;

        const updateRender = () => {
          render(input, completion);
        };

        updateRender();

        const onKeypress = (character: string, key: { ctrl?: boolean; name?: string }) => {
          if (key.ctrl && key.name === "c") {
            stdin.off("keypress", onKeypress);
            stdout.write("\n");
            resolve("/exit");
            return;
          }

          if (key.name === "return") {
            stdin.off("keypress", onKeypress);
            stdout.write("\n");
            resolve(input.trim());
            return;
          }

          if (key.name === "backspace") {
            input = input.slice(0, -1);

            if (getSuggestions && input.startsWith("/")) {
              const suggestions = getSuggestions(input);
              completion = suggestions.length > 0 ? { suggestions, selectedIndex: 0 } : undefined;
            } else if (!input.startsWith("/")) {
              completion = undefined;
            }

            updateRender();
            return;
          }

          if (key.name === "tab" && completion?.suggestions.length) {
            const selected = completion.suggestions[completion.selectedIndex];

            if (selected) {
              input = selected;
              completion = undefined;
              updateRender();
            }

            return;
          }

          if (key.name === "up" && completion?.suggestions.length) {
            completion.selectedIndex = Math.max(0, completion.selectedIndex - 1);
            updateRender();
            return;
          }

          if (key.name === "down" && completion?.suggestions.length) {
            completion.selectedIndex = Math.min(completion.suggestions.length - 1, completion.selectedIndex + 1);
            updateRender();
            return;
          }

          if (character) {
            input += character;

            if (getSuggestions && input.startsWith("/")) {
              const suggestions = getSuggestions(input);
              completion = suggestions.length > 0 ? { suggestions, selectedIndex: 0 } : undefined;
            } else if (!input.startsWith("/")) {
              completion = undefined;
            }

            updateRender();
          }
        };

        stdin.on("keypress", onKeypress);
      });
    },

    async confirm(message, defaultValue = true) {
      stdout.write(`${message} ${defaultValue ? "[Y/n]" : "[y/N]"} `);

      return new Promise<boolean>((resolve) => {
        const onKeypress = (character: string, key: { ctrl?: boolean; name?: string }) => {
          if (key.ctrl && key.name === "c") {
            stdin.off("keypress", onKeypress);
            stdout.write("\n");
            resolve(false);
            return;
          }

          if (key.name === "return") {
            stdin.off("keypress", onKeypress);
            stdout.write("\n");
            resolve(defaultValue);
            return;
          }

          const normalized = character.toLowerCase();

          if (normalized === "y") {
            stdin.off("keypress", onKeypress);
            stdout.write("\n");
            resolve(true);
            return;
          }

          if (normalized === "n") {
            stdin.off("keypress", onKeypress);
            stdout.write("\n");
            resolve(false);
          }
        };

        stdin.on("keypress", onKeypress);
      });
    },

    write(message: string) {
      stdout.write(message);
    },

    close() {
      if (typeof stdin.setRawMode === "function") {
        stdin.setRawMode(false);
      }
    },
  };
}
