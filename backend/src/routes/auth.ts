import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/login', (req: Request, res: Response): void => {
  const { password } = req.body as { password?: string };

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }

  const secret = process.env.JWT_SECRET!;
  const token = jwt.sign({ role: 'admin' }, secret, { expiresIn: '7d' });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  res.json({ token, expiresAt });
});

router.get('/verify', authenticateAdmin, (_req: AuthRequest, res: Response): void => {
  res.json({ valid: true, role: 'admin' });
});

export default router;
