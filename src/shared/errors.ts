export class CacheError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown> | undefined;

  constructor(
    code: string,
    message: string,
    status = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CacheError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function createValidationError(message: string) {
  return new CacheError("validation_error", message, 400);
}

export function createNotFoundError(message: string) {
  return new CacheError("not_found", message, 404);
}

export function createIoError(message: string, details?: Record<string, unknown>) {
  return new CacheError("io_error", message, 400, details);
}
