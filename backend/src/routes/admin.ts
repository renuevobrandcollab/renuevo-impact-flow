import { Router, Request, Response } from 'express';
import { authenticateAdmin } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { calculateSellingPrice, calculateNetMargin } from '../lib/finance';

const router = Router();

router.use(authenticateAdmin);

// ── PRODUCTS ──

router.get('/products', async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, active } = req.query;
    const where: Record<string, unknown> = {};
    if (category) where.category = category as string;
    if (active !== undefined) where.active = active === 'true';
    const products = await prisma.product.findMany({ where, include: { variants: true } });
    res.json(products);
  } catch {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.get('/products/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { variants: true },
    });
    if (!product) { res.status(404).json({ error: 'Product not found' }); return; }
    res.json(product);
  } catch {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

router.post('/products', async (req: Request, res: Response): Promise<void> => {
  try {
    const product = await prisma.product.create({ data: req.body });
    res.status(201).json(product);
  } catch {
    res.status(500).json({ error: 'Failed to create product' });
  }
});

router.put('/products/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const updated = await prisma.product.update({
      where: { id: req.params.id },
      data: req.body,
      include: { variants: true },
    });

    const marginChanged =
      req.body.gross_margin_percentage !== undefined ||
      req.body.donation_percentage !== undefined;

    if (marginChanged && updated.variants.length > 0) {
      await Promise.all(
        updated.variants.map((v) =>
          prisma.variant.update({
            where: { id: v.id },
            data: {
              selling_price: calculateSellingPrice(v.cost_price, v.gross_margin_percentage),
              net_margin_percentage: calculateNetMargin(
                v.gross_margin_percentage,
                v.donation_percentage
              ),
            },
          })
        )
      );
      const final = await prisma.product.findUnique({
        where: { id: req.params.id },
        include: { variants: true },
      });
      res.json(final);
      return;
    }

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

router.delete('/products/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// ── VARIANTS ──

router.get('/variants', async (req: Request, res: Response): Promise<void> => {
  try {
    const { product_id } = req.query;
    const where: Record<string, unknown> = {};
    if (product_id) where.product_id = product_id as string;
    const variants = await prisma.variant.findMany({ where });
    res.json(variants);
  } catch {
    res.status(500).json({ error: 'Failed to fetch variants' });
  }
});

router.get('/variants/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const variant = await prisma.variant.findUnique({ where: { id: req.params.id } });
    if (!variant) { res.status(404).json({ error: 'Variant not found' }); return; }
    res.json(variant);
  } catch {
    res.status(500).json({ error: 'Failed to fetch variant' });
  }
});

router.post('/variants', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = req.body as {
      cost_price?: number;
      gross_margin_percentage?: number;
      donation_percentage?: number;
      [key: string]: unknown;
    };
    const gross = data.gross_margin_percentage ?? 0;
    const donation = data.donation_percentage ?? 0;
    const cost = data.cost_price ?? 0;
    const variant = await prisma.variant.create({
      data: {
        ...data,
        selling_price: calculateSellingPrice(cost, gross),
        net_margin_percentage: calculateNetMargin(gross, donation),
      },
    });
    res.status(201).json(variant);
  } catch {
    res.status(500).json({ error: 'Failed to create variant' });
  }
});

router.put('/variants/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = await prisma.variant.findUnique({ where: { id: req.params.id } });
    if (!existing) { res.status(404).json({ error: 'Variant not found' }); return; }

    const data = req.body as {
      cost_price?: number;
      gross_margin_percentage?: number;
      donation_percentage?: number;
      [key: string]: unknown;
    };
    const gross = data.gross_margin_percentage ?? existing.gross_margin_percentage;
    const donation = data.donation_percentage ?? existing.donation_percentage;
    const cost = data.cost_price ?? existing.cost_price;
    const selling_price = calculateSellingPrice(cost, gross);

    const variant = await prisma.variant.update({
      where: { id: req.params.id },
      data: {
        ...data,
        selling_price,
        net_margin_percentage: calculateNetMargin(gross, donation),
        ...(selling_price !== existing.selling_price ? { shopify_price_synced: false } : {}),
      },
    });
    res.json(variant);
  } catch {
    res.status(500).json({ error: 'Failed to update variant' });
  }
});

router.delete('/variants/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.variant.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete variant' });
  }
});

// defined before /variants/:id to avoid "bulk-update" matching :id
router.post('/variants/bulk-update', async (req: Request, res: Response): Promise<void> => {
  try {
    const { product_id, gross_margin_percentage, donation_percentage } = req.body as {
      product_id: string;
      gross_margin_percentage: number;
      donation_percentage: number;
    };
    const variants = await prisma.variant.findMany({ where: { product_id } });
    const updated = await Promise.all(
      variants.map((v) =>
        prisma.variant.update({
          where: { id: v.id },
          data: {
            gross_margin_percentage,
            donation_percentage,
            selling_price: calculateSellingPrice(v.cost_price, gross_margin_percentage),
            net_margin_percentage: calculateNetMargin(gross_margin_percentage, donation_percentage),
            shopify_price_synced: false,
          },
        })
      )
    );
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to bulk update variants' });
  }
});

router.post('/variants/:id/activate', async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = await prisma.variant.findUnique({ where: { id: req.params.id } });
    if (!existing) { res.status(404).json({ error: 'Variant not found' }); return; }
    const variant = await prisma.variant.update({
      where: { id: req.params.id },
      data: {
        active: true,
        selling_price: calculateSellingPrice(
          existing.cost_price,
          existing.gross_margin_percentage
        ),
        shopify_price_synced: false,
      },
    });
    res.json(variant);
  } catch {
    res.status(500).json({ error: 'Failed to activate variant' });
  }
});

// ── ORDERS ──

// /orders/stats must be defined before /orders/:id
router.get('/orders/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const orders = await prisma.order.findMany();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const total_revenue = orders.reduce((s, o) => s + o.total_price, 0);
    const total_cost = orders.reduce((s, o) => s + o.total_cost, 0);
    const total_donations = orders.reduce((s, o) => s + o.donation_amount, 0);
    const total_profit = orders.reduce((s, o) => s + o.profit_amount, 0);
    const total_orders = orders.length;

    const thisMonth = orders.filter((o) => new Date(o.order_date) >= monthStart);
    const this_month_orders = thisMonth.length;
    const this_month_revenue = thisMonth.reduce((s, o) => s + o.total_price, 0);
    const avg_order_value = total_orders > 0 ? total_revenue / total_orders : 0;

    const monthMap = new Map<
      string,
      { revenue: number; cost: number; donations: number; profit: number; orders: number }
    >();
    for (const o of orders) {
      const d = new Date(o.order_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const m = monthMap.get(key) ?? { revenue: 0, cost: 0, donations: 0, profit: 0, orders: 0 };
      m.revenue += o.total_price;
      m.cost += o.total_cost;
      m.donations += o.donation_amount;
      m.profit += o.profit_amount;
      m.orders += 1;
      monthMap.set(key, m);
    }
    const by_month = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({ month, ...d }));

    type LineItem = {
      product_name?: string;
      title?: string;
      quantity?: number;
      price?: number;
      cost_price?: number;
      donation_percentage?: number;
    };
    const productMap = new Map<
      string,
      { units: number; revenue: number; cost: number; donations: number }
    >();
    for (const o of orders) {
      const items = o.items as LineItem[];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const name = item.product_name ?? item.title ?? 'Unknown';
        const qty = item.quantity ?? 1;
        const price = item.price ?? 0;
        const cost = item.cost_price ?? 0;
        const donPct = item.donation_percentage ?? 0;
        const lineTotal = price * qty;
        const p = productMap.get(name) ?? { units: 0, revenue: 0, cost: 0, donations: 0 };
        p.units += qty;
        p.revenue += lineTotal;
        p.cost += cost * qty;
        p.donations += lineTotal * (donPct / 100);
        productMap.set(name, p);
      }
    }
    const by_product = Array.from(productMap.entries())
      .map(([product_name, d]) => ({
        product_name,
        units: d.units,
        revenue: d.revenue,
        cost: d.cost,
        donations: d.donations,
        margin: d.revenue > 0 ? ((d.revenue - d.cost) / d.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    res.json({
      total_revenue,
      total_cost,
      total_donations,
      total_profit,
      total_orders,
      this_month_orders,
      this_month_revenue,
      avg_order_value,
      by_month,
      by_product,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch order stats' });
  }
});

router.get('/orders', async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, from, to, search, limit, page } = req.query;
    const where: Record<string, unknown> = {};
    if (status) where.status = status as string;
    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.gte = new Date(from as string);
      if (to) dateFilter.lte = new Date(to as string);
      where.order_date = dateFilter;
    }
    if (search) {
      where.OR = [
        { customer_name: { contains: search as string, mode: 'insensitive' } },
        { customer_email: { contains: search as string, mode: 'insensitive' } },
        { shopify_order_id: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    const take = limit ? parseInt(limit as string, 10) : 50;
    const skip = page ? (parseInt(page as string, 10) - 1) * take : 0;
    const [orders, total] = await Promise.all([
      prisma.order.findMany({ where, orderBy: { order_date: 'desc' }, take, skip }),
      prisma.order.count({ where }),
    ]);
    res.json({ orders, total, page: page ? parseInt(page as string, 10) : 1, limit: take });
  } catch {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

router.get('/orders/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }
    res.json(order);
  } catch {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

router.post('/orders', async (req: Request, res: Response): Promise<void> => {
  try {
    const order = await prisma.order.create({ data: req.body });
    res.status(201).json(order);
  } catch {
    res.status(500).json({ error: 'Failed to create order' });
  }
});

router.put('/orders/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const order = await prisma.order.update({ where: { id: req.params.id }, data: req.body });
    res.json(order);
  } catch {
    res.status(500).json({ error: 'Failed to update order' });
  }
});

router.delete('/orders/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.order.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

// ── PERIOD FINANCE ──

router.get('/period-finance', async (_req: Request, res: Response): Promise<void> => {
  try {
    const periods = await prisma.periodFinance.findMany({ orderBy: { period_key: 'desc' } });
    res.json(periods);
  } catch {
    res.status(500).json({ error: 'Failed to fetch period finance records' });
  }
});

router.get('/period-finance/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const period = await prisma.periodFinance.findUnique({ where: { id: req.params.id } });
    if (!period) { res.status(404).json({ error: 'Period not found' }); return; }
    res.json(period);
  } catch {
    res.status(500).json({ error: 'Failed to fetch period' });
  }
});

router.post('/period-finance', async (req: Request, res: Response): Promise<void> => {
  try {
    const { period_key, ...rest } = req.body as { period_key: string; [key: string]: unknown };
    const period = await prisma.periodFinance.upsert({
      where: { period_key },
      create: { period_key, ...rest },
      update: rest,
    });
    res.status(201).json(period);
  } catch {
    res.status(500).json({ error: 'Failed to create period finance' });
  }
});

router.put('/period-finance/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const period = await prisma.periodFinance.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(period);
  } catch {
    res.status(500).json({ error: 'Failed to update period finance' });
  }
});

router.delete('/period-finance/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.periodFinance.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete period finance' });
  }
});

// ── IMPACT FUND ──

// POST /impact-fund/allocate must be defined before PUT /impact-fund/:id
router.post('/impact-fund/allocate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { project_id, amount } = req.body as { project_id: string; amount: number };
    const fund = await prisma.impactFund.findFirst();
    if (!fund) { res.status(404).json({ error: 'Impact fund not found' }); return; }
    if (amount > fund.current_balance) {
      res.status(400).json({ error: 'Amount exceeds current balance' });
      return;
    }
    const [updatedProject, updatedFund] = await Promise.all([
      prisma.impactProject.update({
        where: { id: project_id },
        data: { amount_allocated: { increment: amount } },
      }),
      prisma.impactFund.update({
        where: { id: fund.id },
        data: {
          total_allocated: { increment: amount },
          current_balance: { decrement: amount },
        },
      }),
    ]);
    res.json({ fund: updatedFund, project: updatedProject });
  } catch {
    res.status(500).json({ error: 'Failed to allocate funds' });
  }
});

router.get('/impact-fund', async (_req: Request, res: Response): Promise<void> => {
  try {
    let fund = await prisma.impactFund.findFirst();
    if (!fund) {
      fund = await prisma.impactFund.create({
        data: { total_generated: 0, total_allocated: 0, current_balance: 0 },
      });
    }
    res.json(fund);
  } catch {
    res.status(500).json({ error: 'Failed to fetch impact fund' });
  }
});

router.put('/impact-fund/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const fund = await prisma.impactFund.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(fund);
  } catch {
    res.status(500).json({ error: 'Failed to update impact fund' });
  }
});

// ── IMPACT PROJECTS ──

router.get('/impact-projects', async (_req: Request, res: Response): Promise<void> => {
  try {
    const projects = await prisma.impactProject.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(projects);
  } catch {
    res.status(500).json({ error: 'Failed to fetch impact projects' });
  }
});

router.get('/impact-projects/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const project = await prisma.impactProject.findUnique({ where: { id: req.params.id } });
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
    res.json(project);
  } catch {
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

router.post('/impact-projects', async (req: Request, res: Response): Promise<void> => {
  try {
    const project = await prisma.impactProject.create({ data: req.body });
    res.status(201).json(project);
  } catch {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

router.put('/impact-projects/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const project = await prisma.impactProject.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(project);
  } catch {
    res.status(500).json({ error: 'Failed to update project' });
  }
});

router.delete('/impact-projects/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.impactProject.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// ── MANUAL DONATIONS ──

router.get('/manual-donations', async (_req: Request, res: Response): Promise<void> => {
  try {
    const donations = await prisma.manualDonation.findMany({ orderBy: { date: 'desc' } });
    res.json(donations);
  } catch {
    res.status(500).json({ error: 'Failed to fetch donations' });
  }
});

router.post('/manual-donations', async (req: Request, res: Response): Promise<void> => {
  try {
    const { amount, ...rest } = req.body as { amount: number; [key: string]: unknown };
    let fund = await prisma.impactFund.findFirst();
    if (!fund) {
      fund = await prisma.impactFund.create({
        data: { total_generated: 0, total_allocated: 0, current_balance: 0 },
      });
    }
    const [donation] = await Promise.all([
      prisma.manualDonation.create({ data: { amount, ...rest } }),
      prisma.impactFund.update({
        where: { id: fund.id },
        data: {
          total_generated: { increment: amount },
          current_balance: { increment: amount },
        },
      }),
    ]);
    res.status(201).json(donation);
  } catch {
    res.status(500).json({ error: 'Failed to create donation' });
  }
});

router.delete('/manual-donations/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const donation = await prisma.manualDonation.findUnique({ where: { id: req.params.id } });
    if (!donation) { res.status(404).json({ error: 'Donation not found' }); return; }
    const fund = await prisma.impactFund.findFirst();
    await prisma.manualDonation.delete({ where: { id: req.params.id } });
    if (fund) {
      await prisma.impactFund.update({
        where: { id: fund.id },
        data: {
          total_generated: { decrement: donation.amount },
          current_balance: { decrement: donation.amount },
        },
      });
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete donation' });
  }
});

// ── BLOG POSTS ──

router.get('/blog-posts', async (req: Request, res: Response): Promise<void> => {
  try {
    const { published, category } = req.query;
    const where: Record<string, unknown> = {};
    if (published !== undefined) where.published = published === 'true';
    if (category) where.category = category as string;
    const posts = await prisma.blogPost.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(posts);
  } catch {
    res.status(500).json({ error: 'Failed to fetch blog posts' });
  }
});

router.get('/blog-posts/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const post = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
    if (!post) { res.status(404).json({ error: 'Blog post not found' }); return; }
    res.json(post);
  } catch {
    res.status(500).json({ error: 'Failed to fetch blog post' });
  }
});

router.post('/blog-posts', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = req.body as { title: string; slug?: string; [key: string]: unknown };
    if (!data.slug) {
      data.slug = data.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }
    const post = await prisma.blogPost.create({ data });
    res.status(201).json(post);
  } catch {
    res.status(500).json({ error: 'Failed to create blog post' });
  }
});

router.put('/blog-posts/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const post = await prisma.blogPost.update({ where: { id: req.params.id }, data: req.body });
    res.json(post);
  } catch {
    res.status(500).json({ error: 'Failed to update blog post' });
  }
});

router.delete('/blog-posts/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.blogPost.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete blog post' });
  }
});

// ── SHOPIFY CONNECTION ──

router.get('/shopify-connection', async (_req: Request, res: Response): Promise<void> => {
  try {
    const connection = await prisma.shopifyConnection.findFirst({ where: { status: 'active' } });
    res.json(connection ?? null);
  } catch {
    res.status(500).json({ error: 'Failed to fetch Shopify connection' });
  }
});

export default router;
