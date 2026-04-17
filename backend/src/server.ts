import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';

import authRouter from './routes/auth';
import adminRouter from './routes/admin';
import shopifyRouter from './routes/shopify';
import publicRouter from './routes/public';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(morgan('combined'));
app.use(express.json());

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/login', loginLimiter);

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/shopify', shopifyRouter);
app.use('/api/public', publicRouter);

app.use(errorHandler);

const PORT = process.env.PORT ?? 3001;

const defaultShopContent = {
  hero: {
    title: 'Wear the Change',
    subtitle: 'Every purchase funds real-world impact.',
    cta: 'Shop Now',
  },
  mission: {
    heading: 'Our Mission',
    body: 'Renuevo exists to channel commerce into community transformation.',
  },
  impact: {
    heading: 'Impact So Far',
    stats: [],
  },
};

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  const shopContentPath = path.resolve('/data/shop-content.json');
  if (!fs.existsSync(shopContentPath)) {
    try {
      fs.mkdirSync(path.dirname(shopContentPath), { recursive: true });
      fs.writeFileSync(shopContentPath, JSON.stringify(defaultShopContent, null, 2));
      console.log('Created default /data/shop-content.json');
    } catch (err) {
      console.error('Could not create /data/shop-content.json:', err);
    }
  }
});

export default app;
