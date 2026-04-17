import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: jwt.JwtPayload | string;
}

export function authenticateAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'JWT secret not configured' });
    return;
  }

  try {
    req.user = jwt.verify(token, secret);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
