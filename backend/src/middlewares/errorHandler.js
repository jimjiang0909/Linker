/**
 * Global error handling middleware
 * Unified error response format: { code, message, details }
 */
export function errorHandler(err, _req, res, _next) {
  // Default 500 server error
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'Internal server error';
  const details = err.details || {};

  // Output error stack in non-production environments
  if (process.env.NODE_ENV !== 'production') {
    console.error('[Error]', err);
  }

  res.status(statusCode).json({
    code,
    message,
    details,
  });
}

/**
 * Custom application error class
 * Supports statusCode, code, message, details
 */
export class AppError extends Error {
  constructor(statusCode, code, message, details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = 'AppError';
  }
}

/**
 * 404 route not found handler
 */
export function notFoundHandler(_req, res) {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: 'Resource not found',
    details: {},
  });
}
