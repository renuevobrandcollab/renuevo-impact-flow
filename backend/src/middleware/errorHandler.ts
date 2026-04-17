import { Request, Response, NextFunction } from 'express';

interface HttpError extends Error {
  status?: number;
  statusCode?: number;
}

export function errorHandler(
  err: HttpError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(err);
  const status = err.status ?? err.statusCode ?? 500;
  const message = err.message || 'Internal server error';
  res.status(status).json({ error: message });
}
