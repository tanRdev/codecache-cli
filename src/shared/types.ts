export interface SnippetRecord {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  language: string;
  code: string;
  sourcePath: string | null;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

export interface CreateSnippetInput {
  title: string;
  description?: string;
  notes?: string;
  language: string;
  code: string;
  sourcePath?: string;
  tags: string[];
}

export interface UpdateSnippetInput {
  title?: string;
  description?: string | null;
  notes?: string | null;
  language?: string;
  code?: string;
  sourcePath?: string | null;
  tags?: string[];
}

export interface ListSnippetsInput {
  query?: string;
  tags?: string[];
  limit?: number;
}

export interface CommandSuccess<T> {
  ok: true;
  data: T;
}

export interface CommandFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type CommandResult<T> = CommandSuccess<T> | CommandFailure;
