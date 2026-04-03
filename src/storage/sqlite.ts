import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ListSnippetsInput, SnippetRecord, UpdateSnippetInput } from "@/shared/types";
import { normalizeTags } from "@/shared/tags";

type SnippetRow = {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  language: string;
  code: string;
  source_path: string | null;
  created_at: string;
  updated_at: string;
};

function getDatabasePath(vaultPath: string) {
  return path.join(vaultPath, "cache.sqlite");
}

function ensureSchema(database: DatabaseSync) {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS snippets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      notes TEXT,
      language TEXT NOT NULL,
      code TEXT NOT NULL,
      source_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS snippet_tags (
      snippet_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (snippet_id, tag),
      FOREIGN KEY (snippet_id) REFERENCES snippets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      snippet_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      sha256 TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (snippet_id) REFERENCES snippets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_snippets_updated_at ON snippets(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tags_tag ON snippet_tags(tag);
    CREATE INDEX IF NOT EXISTS idx_attachments_snippet ON attachments(snippet_id, created_at DESC);

    CREATE VIRTUAL TABLE IF NOT EXISTS snippet_fts USING fts5(
      snippet_id UNINDEXED,
      title,
      description,
      notes,
      code,
      tags
    );

    PRAGMA user_version = 1;
  `);
}

function selectSnippetTags(database: DatabaseSync, snippetId: string) {
  const rows = database.prepare(
    `SELECT tag FROM snippet_tags WHERE snippet_id = ? ORDER BY tag ASC`,
  ).all(snippetId);

  return rows.map((row) => readStringField(row, "tag"));
}

function toSnippetRecord(database: DatabaseSync, row: SnippetRow): SnippetRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    notes: row.notes,
    language: row.language,
    code: row.code,
    sourcePath: row.source_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags: selectSnippetTags(database, row.id),
  };
}

function updateSnippetSearch(database: DatabaseSync, snippet: {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  code: string;
  tags: string[];
}) {
  database.prepare(`DELETE FROM snippet_fts WHERE snippet_id = ?`).run(snippet.id);
  database.prepare(
    `INSERT INTO snippet_fts (snippet_id, title, description, notes, code, tags)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    snippet.id,
    snippet.title,
    snippet.description,
    snippet.notes,
    snippet.code,
    snippet.tags.join(" "),
  );
}

function quoteFtsQuery(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replaceAll('"', '""')}"`)
    .join(" AND ");
}

export interface VaultDatabase {
  database: DatabaseSync;
  vaultPath: string;
}

export function isVaultInitialized(vaultPath: string) {
  return existsSync(getDatabasePath(vaultPath));
}

type AttachmentRow = {
  id: string;
  snippet_id: string;
  relative_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string | null;
  created_at: string;
};

function readStringField(row: Record<string, unknown>, key: string) {
  const value = row[key];

  if (typeof value !== "string") {
    throw new Error(`Expected string field: ${key}`);
  }

  return value;
}

function readNullableStringField(row: Record<string, unknown>, key: string) {
  const value = row[key];

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`Expected nullable string field: ${key}`);
  }

  return value;
}

function readNumberField(row: Record<string, unknown>, key: string) {
  const value = row[key];

  if (typeof value !== "number") {
    throw new Error(`Expected number field: ${key}`);
  }

  return value;
}

function toSnippetRow(row: Record<string, unknown>): SnippetRow {
  return {
    id: readStringField(row, "id"),
    title: readStringField(row, "title"),
    description: readNullableStringField(row, "description"),
    notes: readNullableStringField(row, "notes"),
    language: readStringField(row, "language"),
    code: readStringField(row, "code"),
    source_path: readNullableStringField(row, "source_path"),
    created_at: readStringField(row, "created_at"),
    updated_at: readStringField(row, "updated_at"),
  };
}

function toAttachmentRow(row: Record<string, unknown>): AttachmentRow {
  return {
    id: readStringField(row, "id"),
    snippet_id: readStringField(row, "snippet_id"),
    relative_path: readStringField(row, "relative_path"),
    file_name: readStringField(row, "file_name"),
    mime_type: readStringField(row, "mime_type"),
    size_bytes: readNumberField(row, "size_bytes"),
    sha256: readNullableStringField(row, "sha256"),
    created_at: readStringField(row, "created_at"),
  };
}

export function createVaultDatabase(vaultPath: string): VaultDatabase {
  mkdirSync(vaultPath, { recursive: true });
  mkdirSync(path.join(vaultPath, "attachments"), { recursive: true });
  const database = new DatabaseSync(getDatabasePath(vaultPath));
  ensureSchema(database);
  return { database, vaultPath };
}

export function openVaultDatabase(vaultPath: string): VaultDatabase {
  const database = new DatabaseSync(getDatabasePath(vaultPath), {
    readOnly: false,
    timeout: 5000,
  });
  ensureSchema(database);
  return { database, vaultPath };
}

export function createSnippetRepository(vault: VaultDatabase) {
  const { database } = vault;

  return {
    create(input: {
      id: string;
      title: string;
      description: string | null;
      notes: string | null;
      language: string;
      code: string;
      sourcePath: string | null;
      tags: string[];
    }) {
      const now = new Date().toISOString();
      database.prepare(
        `INSERT INTO snippets (
          id, title, description, notes, language, code, source_path, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        input.id,
        input.title,
        input.description,
        input.notes,
        input.language,
        input.code,
        input.sourcePath,
        now,
        now,
      );

      const insertTag = database.prepare(
        `INSERT INTO snippet_tags (snippet_id, tag, created_at) VALUES (?, ?, ?)`,
      );

      for (const tag of normalizeTags(input.tags)) {
        insertTag.run(input.id, tag, now);
      }

      updateSnippetSearch(database, {
        id: input.id,
        title: input.title,
        description: input.description,
        notes: input.notes,
        code: input.code,
        tags: normalizeTags(input.tags),
      });

      return { id: input.id };
    },

    get(snippetId: string) {
      const row = database.prepare(
        `SELECT * FROM snippets WHERE id = ? LIMIT 1`,
      ).get(snippetId);

      if (!row) {
        return null;
      }

      return toSnippetRecord(database, toSnippetRow(row));
    },

    list(input?: ListSnippetsInput) {
      let rows: SnippetRow[];

      if (input?.query?.trim()) {
        const match = quoteFtsQuery(input.query);
        rows = database.prepare(
          `SELECT s.*
           FROM snippets s
           INNER JOIN snippet_fts f ON f.snippet_id = s.id
           WHERE snippet_fts MATCH ?
           ORDER BY s.updated_at DESC`,
        ).all(match).map((row) => toSnippetRow(row));
      } else {
        rows = database.prepare(
          `SELECT * FROM snippets ORDER BY updated_at DESC`,
        ).all().map((row) => toSnippetRow(row));
      }

      let snippets = rows.map((row) => toSnippetRecord(database, row));

      if (input?.tags?.length) {
        const requiredTags = new Set(normalizeTags(input.tags));
        snippets = snippets.filter((snippet) => [...requiredTags].every((tag) => snippet.tags.includes(tag)));
      }

      if (typeof input?.limit === "number") {
        return snippets.slice(0, input.limit);
      }

      return snippets;
    },

    update(snippetId: string, input: UpdateSnippetInput) {
      const current = this.get(snippetId);

      if (!current) {
        return false;
      }

      const next = {
        title: input.title ?? current.title,
        description: input.description !== undefined ? input.description : current.description,
        notes: input.notes !== undefined ? input.notes : current.notes,
        language: input.language ?? current.language,
        code: input.code ?? current.code,
        sourcePath: input.sourcePath !== undefined ? input.sourcePath : current.sourcePath,
        tags: input.tags !== undefined ? normalizeTags(input.tags) : current.tags,
      };

      const updatedAt = new Date().toISOString();
      database.prepare(
        `UPDATE snippets
         SET title = ?, description = ?, notes = ?, language = ?, code = ?, source_path = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        next.title,
        next.description,
        next.notes,
        next.language,
        next.code,
        next.sourcePath,
        updatedAt,
        snippetId,
      );

      if (input.tags !== undefined) {
        database.prepare(`DELETE FROM snippet_tags WHERE snippet_id = ?`).run(snippetId);
        const insertTag = database.prepare(
          `INSERT INTO snippet_tags (snippet_id, tag, created_at) VALUES (?, ?, ?)`,
        );
        for (const tag of next.tags) {
          insertTag.run(snippetId, tag, updatedAt);
        }
      }

      updateSnippetSearch(database, {
        id: snippetId,
        title: next.title,
        description: next.description,
        notes: next.notes,
        code: next.code,
        tags: next.tags,
      });

      return true;
    },

    remove(snippetId: string) {
      const deleted = database.prepare(`DELETE FROM snippets WHERE id = ?`).run(snippetId);
      database.prepare(`DELETE FROM snippet_fts WHERE snippet_id = ?`).run(snippetId);
      return deleted.changes > 0;
    },

    listTags() {
      const rows = database.prepare(
        `SELECT DISTINCT tag FROM snippet_tags ORDER BY tag ASC`,
      ).all();
      return rows.map((row) => readStringField(row, "tag"));
    },
  };
}

export function createAttachmentRepository(vault: VaultDatabase) {
  const { database } = vault;

  return {
    create(input: {
      id: string;
      snippetId: string;
      relativePath: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      sha256: string | null;
    }) {
      const createdAt = new Date().toISOString();
      database.prepare(
        `INSERT INTO attachments (
          id, snippet_id, relative_path, file_name, mime_type, size_bytes, sha256, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        input.id,
        input.snippetId,
        input.relativePath,
        input.fileName,
        input.mimeType,
        input.sizeBytes,
        input.sha256,
        createdAt,
      );

      return {
        id: input.id,
        snippetId: input.snippetId,
        relativePath: input.relativePath,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        createdAt,
      };
    },

    list(snippetId: string) {
      const rows = database.prepare(
        `SELECT * FROM attachments WHERE snippet_id = ? ORDER BY created_at DESC`,
      ).all(snippetId).map((row) => toAttachmentRow(row));

      return rows.map((row) => ({
        id: row.id,
        snippetId: row.snippet_id,
        relativePath: row.relative_path,
        fileName: row.file_name,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        sha256: row.sha256,
        createdAt: row.created_at,
      }));
    },

    get(attachmentId: string) {
      const row = database.prepare(
        `SELECT * FROM attachments WHERE id = ? LIMIT 1`,
      ).get(attachmentId);

      if (!row) {
        return null;
      }

      const attachment = toAttachmentRow(row);

      return {
        id: attachment.id,
        snippetId: attachment.snippet_id,
        relativePath: attachment.relative_path,
        fileName: attachment.file_name,
        mimeType: attachment.mime_type,
        sizeBytes: attachment.size_bytes,
        sha256: attachment.sha256,
        createdAt: attachment.created_at,
      };
    },

    remove(attachmentId: string) {
      const row = this.get(attachmentId);

      if (!row) {
        return null;
      }

      database.prepare(`DELETE FROM attachments WHERE id = ?`).run(attachmentId);
      return row;
    },
  };
}
