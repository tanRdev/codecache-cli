import type { CreateSnippetInput, ListSnippetsInput, UpdateSnippetInput } from "../shared/types";
import { createNotFoundError, createValidationError } from "../shared/errors";
import { normalizeTags } from "../shared/tags";
import type { VaultDatabase } from "../storage/sqlite";
import { createSnippetRepository } from "../storage/sqlite";

function requireValue(value: string, message: string) {
  if (!value.trim()) {
    throw createValidationError(message);
  }

  return value.trim();
}

function requireText(value: string, message: string) {
  if (!value.trim()) {
    throw createValidationError(message);
  }

  return value;
}

function trimNullable(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function createSnippetService(vault: VaultDatabase) {
  const repository = createSnippetRepository(vault);

  return {
    async create(input: CreateSnippetInput) {
      const id = crypto.randomUUID();
      repository.create({
        id,
        title: requireValue(input.title, "Title is required"),
        description: trimNullable(input.description),
        notes: trimNullable(input.notes),
        language: requireValue(input.language, "Language is required"),
        code: requireText(input.code, "Code is required"),
        sourcePath: trimNullable(input.sourcePath),
        tags: normalizeTags(input.tags),
      });

      return { id };
    },

    async get(snippetId: string) {
      const snippet = repository.get(snippetId);

      if (!snippet) {
        throw createNotFoundError("Snippet not found");
      }

      return snippet;
    },

    async list(input?: ListSnippetsInput) {
      const nextInput: ListSnippetsInput = {};

      if (input?.query !== undefined) {
        nextInput.query = input.query;
      }

      if (input?.tags !== undefined) {
        nextInput.tags = normalizeTags(input.tags);
      }

      if (input?.limit !== undefined) {
        nextInput.limit = input.limit;
      }

      return repository.list(nextInput);
    },

    async update(snippetId: string, input: UpdateSnippetInput) {
      const nextInput: UpdateSnippetInput = {};

      if (input.title !== undefined) {
        nextInput.title = requireValue(input.title, "Title is required");
      }

      if (input.description !== undefined) {
        nextInput.description = trimNullable(input.description);
      }

      if (input.notes !== undefined) {
        nextInput.notes = trimNullable(input.notes);
      }

      if (input.language !== undefined) {
        nextInput.language = requireValue(input.language, "Language is required");
      }

      if (input.code !== undefined) {
        nextInput.code = input.code;
      }

      if (input.sourcePath !== undefined) {
        nextInput.sourcePath = trimNullable(input.sourcePath);
      }

      if (input.tags !== undefined) {
        nextInput.tags = input.tags;
      }

      const updated = repository.update(snippetId, nextInput);

      if (!updated) {
        throw createNotFoundError("Snippet not found");
      }

      return { success: true };
    },

    async remove(snippetId: string) {
      const deleted = repository.remove(snippetId);

      if (!deleted) {
        throw createNotFoundError("Snippet not found");
      }

      return { success: true };
    },

    async listTags() {
      return repository.listTags();
    },
  };
}
