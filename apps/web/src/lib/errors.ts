/**
 * Typed error thrown by the API client. Every failure mode in the network
 * layer (HTTP error, refresh failure, expired session) surfaces as an
 * `ApiError` so feature code can pattern-match on `status` and `body`
 * without inspecting raw responses.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
