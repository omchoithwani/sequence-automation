import express, { Request, Response } from 'express';
import { config } from './config';
import { initDb } from './db';
import authRoutes from './routes/auth';
import webhookRoutes from './routes/webhook';
import optionsRoutes from './routes/options';
import pricingRoutes, { handlePayPalWebhook } from './routes/pricing';
import adminRoutes from './routes/admin';
import dashboardRoutes from './routes/dashboard';
import { validateHubSpotSignature } from './middleware/signature';

const app = express();

// Capture raw body buffer alongside parsed JSON so HMAC/webhook verification
// middleware can compute over the original bytes.
app.use(
  express.json({
    verify: (req: any, _res, buf) => { req.rawBody = buf; },
  })
);
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────────────────────────

// Public landing page — Install button for you and your clients
app.get('/', (_req, res) => {
  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Flow Enroll</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f7f8fa;color:#1a202c;line-height:1.6}
    .wrap{max-width:760px;margin:72px auto;padding:0 24px}
    h1{font-size:2rem;font-weight:700;margin-bottom:12px}
    .sub{color:#718096;font-size:1.05rem;margin-bottom:40px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:44px}
    .card{background:#fff;border-radius:10px;padding:22px 24px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
    .card .badge{display:inline-block;font-size:.7rem;font-weight:600;background:#ebf8ff;color:#2b6cb0;border-radius:4px;padding:2px 7px;margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em}
    .card h3{font-size:.95rem;font-weight:600;margin-bottom:6px}
    .card p{font-size:.85rem;color:#718096}
    .actions{display:flex;gap:12px;flex-wrap:wrap}
    .btn{display:inline-block;background:#ff7a59;color:#fff;padding:14px 36px;border-radius:7px;text-decoration:none;font-weight:600;font-size:1rem}
    .btn:hover{background:#f56444}
    .btn-outline{background:#fff;color:#4a5568;border:1px solid #e2e8f0;padding:13px 28px}
    .btn-outline:hover{background:#f7f8fa}
    .note{margin-top:24px;font-size:.82rem;color:#a0aec0}
    @media(max-width:540px){.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Flow Enroll</h1>
    <p class="sub">Custom workflow actions that unlock sequence enrollment, unenrollment, and A/B branching — without needing Enterprise.</p>
    <div class="grid">
      <div class="card">
        <div class="badge">Contact · Deal · Company</div>
        <h3>Enroll in Sequence</h3>
        <p>Enroll contacts into any sequence from any workflow type. Filter by association label. Choose the sender and email.</p>
      </div>
      <div class="card">
        <div class="badge">Contact · Deal · Company</div>
        <h3>Unenroll from Sequence</h3>
        <p>Cancel active sequence enrollments from a workflow. Target a specific sequence or all active ones at once.</p>
      </div>
      <div class="card">
        <div class="badge">Contact · Deal · Company</div>
        <h3>Random Branch</h3>
        <p>Split contacts randomly to Branch A or B based on a percentage — for A/B testing messaging or timing.</p>
      </div>
      <div class="card">
        <div class="badge">Free to start</div>
        <h3>Flexible Pricing</h3>
        <p>Free for 100 enrollments/month. Upgrade to Pro (1,000) or Enterprise (unlimited) as you scale.</p>
      </div>
    </div>
    <div class="actions">
      <a href="/auth/install" class="btn">Install on HubSpot</a>
      <a href="/pricing" class="btn btn-outline">View Pricing</a>
    </div>
    <p class="note">Requires Sales Hub Starter or above for sequences.</p>
  </div>
</body>
</html>`);
});

// OAuth install + callback
app.use('/auth', authRoutes);

// CWA webhooks — validate HubSpot's HMAC signature
app.use('/webhook', validateHubSpotSignature, webhookRoutes);

// Dynamic dropdown options — called from HubSpot workflow editor (no sig)
app.use('/options', optionsRoutes);

// Pricing page + PayPal subscribe / return
app.use('/pricing', pricingRoutes);

// PayPal webhook (raw body needed for sig verification — already captured above)
app.post('/paypal/webhook', handlePayPalWebhook);

// Per-portal sequence performance dashboard
app.use('/dashboard', dashboardRoutes);

// Admin dashboard (protected by ADMIN_SECRET)
app.use('/admin', adminRoutes);

// Health check
app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));

// ── Start ─────────────────────────────────────────────────────────────────────

async function bootstrap() {
  await initDb();
  app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`);
    console.log(`Landing page  → ${config.baseUrl}/`);
    console.log(`Pricing       → ${config.baseUrl}/pricing`);
    console.log(`Install URL   → ${config.baseUrl}/auth/install`);
    console.log(`Admin panel   → ${config.baseUrl}/admin?secret=YOUR_ADMIN_SECRET`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
