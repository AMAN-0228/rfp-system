import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/errors';
import { env } from '../config/env';

/**
 * Error handling middleware
 */
export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // If response already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle known API errors
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        ...(err.errors && { errors: err.errors }),
        ...(env.NODE_ENV === 'development' && { stack: err.stack }),
      },
    });
  }

  // Handle validation errors from express-validator
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: {
        message: err.message,
        ...(env.NODE_ENV === 'development' && { stack: err.stack }),
      },
    });
  }

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    // Handle unique constraint violations
    if ((err as any).code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: {
          message: 'A record with this value already exists',
          ...(env.NODE_ENV === 'development' && { details: err.message }),
        },
      });
    }

    // Handle record not found
    if ((err as any).code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Record not found',
          ...(env.NODE_ENV === 'development' && { details: err.message }),
        },
      });
    }
  }

  // Handle unknown errors
  console.error('Unexpected error:', err);
  
  return res.status(500).json({
    success: false,
    error: {
      message: env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : err.message,
      ...(env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.originalUrl} not found`,
    },
  });
};
