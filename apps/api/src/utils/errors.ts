/**
 * Base API Error class
 */
export class ApiError extends Error {
  statusCode: number;
  isOperational: boolean;
  errors?: any;

  constructor(
    statusCode: number,
    message: string,
    isOperational: boolean = true,
    errors?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errors = errors;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error - for input validation failures
 */
export class ValidationError extends ApiError {
  constructor(message: string = 'Validation failed', errors?: any) {
    super(400, message, true, errors);
    this.name = 'ValidationError';
  }
}

/**
 * Unauthorized Error - for authentication failures
 */
export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden Error - for authorization failures
 */
export class ForbiddenError extends ApiError {
  constructor(message: string = 'Forbidden') {
    super(403, message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Not Found Error
 */
export class NotFoundError extends ApiError {
  constructor(message: string = 'Resource not found') {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict Error - for duplicate resource conflicts
 */
export class ConflictError extends ApiError {
  constructor(message: string = 'Resource already exists') {
    super(409, message);
    this.name = 'ConflictError';
  }
}

/**
 * Internal Server Error
 */
export class InternalServerError extends ApiError {
  constructor(message: string = 'Internal server error') {
    super(500, message, false);
    this.name = 'InternalServerError';
  }
}

/**
 * Bad Request Error
 */
export class BadRequestError extends ApiError {
  constructor(message: string = 'Bad request', errors?: any) {
    super(400, message, true, errors);
    this.name = 'BadRequestError';
  }
}

/**
 * DB Error
 */
export class DbError extends ApiError {
    constructor(message: string = 'Database error', error: Error | null | undefined = null) {
    super(500, message, true, error);
    this.name = "DbError";
  }
}