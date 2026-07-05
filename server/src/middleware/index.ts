import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

// Attach a unique request ID to every incoming request
export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = (req.headers['x-request-id'] as string) || uuidv4();
  res.setHeader('x-request-id', id);
  (req as any).requestId = id;
  next();
}

// Standard error envelope — all errors return { ok: false, error: { code, message } }
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const status = err.status || err.statusCode || 500;

  // Full detail (DB error codes, stack traces, etc.) always goes to the
  // server log so failures are diagnosable, but 5xx responses to the client
  // are genericized — routes never set err.status/err.code intentionally
  // for unexpected failures (e.g. a Postgres error reaching here has a raw
  // SQLSTATE like '42P01'), so passing those through would leak internal
  // implementation details to the caller.
  const isClientError = status < 500;
  const code = isClientError ? err.code || 'ERROR' : 'INTERNAL_ERROR';
  const message = isClientError ? err.message || 'An unexpected error occurred' : 'An unexpected error occurred';

  console.error(`[error] ${req.method} ${req.path} -> ${status} ${err.code || ''} ${err.message || ''}`, err.stack || '');

  res.status(status).json({
    ok: false,
    error: { code, message },
  });
}

// 404 handler
export function notFound(req: Request, res: Response) {
  res.status(404).json({
    ok: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
}
