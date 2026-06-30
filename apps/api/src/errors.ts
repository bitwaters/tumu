export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, message, details);
}

export function unauthorized(message = "Unauthorized"): HttpError {
  return new HttpError(401, message);
}

export function forbidden(message = "Forbidden"): HttpError {
  return new HttpError(403, message);
}

export function notFound(message = "Not found"): HttpError {
  return new HttpError(404, message);
}

export function conflict(message = "Conflict", details?: unknown): HttpError {
  return new HttpError(409, message, details);
}
