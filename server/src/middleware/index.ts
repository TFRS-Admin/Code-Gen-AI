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
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const status = err.status || err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'An unexpected error occurred';

  console.error(`[error] ${code}: ${message}`, err.stack || '');

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
