import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../errors';
import { ValidationError } from '../../errors/ValidationError';

export const errorHandler = (
  error: Error,
  request: Request,
  response: Response,
  _next: NextFunction
): void => {
  // Log error for debugging
  console.error('Error:', {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    path: request.path,
    method: request.method,
  });

  // Handle AppError instances
  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      success: false,
      message: error.message,
      ...(error instanceof ValidationError && { errors: error.errors }),
    });
    return;
  }

  // Handle validation errors from libraries like Zod, Joi, etc.
  if (error.name === 'ValidationError') {
    response.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: error,
    });
    return;
  }

  // Handle syntax errors in JSON
  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({
      success: false,
      message: 'Invalid JSON format',
    });
    return;
  }

  // Default to 500 Internal Server Error
  response.status(500).json({
    success: false,
    message: process.env["NODE_ENV"] === 'production'
      ? 'Internal server error'
      : error.message,
    ...(process.env["NODE_ENV"] !== 'production' && { stack: error.stack }),
  });
};
