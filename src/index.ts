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
import { TAILWIND_SETUP, topNav, FOOTER } from './ui';

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

app.get('/', (_req, res) => {
  res.send(`<!doctype html>
<html class="light" lang="en">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Flow Enroll - Enroll contacts into sequences from any workflow</title>
${TAILWIND_SETUP}
</head>
<body class="bg-background text-on-background font-body-base antialiased min-h-screen flex flex-col">
${topNav('landing')}
<main class="flex-grow w-full max-w-[1280px] mx-auto px-8 py-20 flex flex-col gap-32">
<!-- Hero Section -->
<section class="flex flex-col items-center text-center max-w-3xl mx-auto gap-8 pt-12">
  <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-high border border-outline-variant/30 text-primary-container font-label-caps text-label-caps shadow-sm">
    <span class="material-symbols-outlined text-[14px]">bolt</span>
    <span>NEW ACTION AVAILABLE</span>
  </div>
  <h1 class="font-h1 text-h1 text-on-surface md:text-[56px] md:leading-[1.1] tracking-tight text-balance">
    Enroll contacts into sequences from any workflow
  </h1>
  <p class="font-body-base text-body-base text-secondary md:text-lg max-w-2xl text-balance">
    Three powerful workflow actions designed to automate your outreach. Scale your sales process without requiring an Enterprise plan.
  </p>
  <div class="flex flex-col sm:flex-row items-center gap-4 mt-4">
    <a class="bg-primary-container text-white px-6 py-3 rounded-lg font-button-text text-button-text hover:scale-95 transition-all duration-200 shadow-md flex items-center gap-2 w-full sm:w-auto justify-center" href="/auth/install">
      Install on HubSpot
    </a>
    <a class="bg-white text-on-surface border border-outline-variant/50 px-6 py-3 rounded-lg font-button-text text-button-text hover:bg-surface-container-lowest transition-all duration-200 shadow-sm flex items-center gap-2 w-full sm:w-auto justify-center" href="/pricing">
      View Pricing
    </a>
  </div>
  <div class="mt-8 text-secondary font-body-sm text-body-sm flex items-center gap-2 opacity-80">
    <span class="material-symbols-outlined text-[16px] text-[#00a4bd]">check_circle</span>
    Works with Sales Hub Professional &amp; Enterprise
  </div>
</section>
<!-- Feature Grid -->
<section class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
  <div class="bg-surface-container-lowest rounded-xl p-card-padding border border-outline-variant/30 shadow-[0_1px_4px_rgba(0,0,0,0.08)] flex flex-col gap-6 relative overflow-hidden group hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] transition-shadow duration-300">
    <div class="absolute top-0 right-0 w-32 h-32 bg-primary-container/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform duration-500"></div>
    <div class="w-12 h-12 rounded-lg bg-primary-container/10 flex items-center justify-center text-primary-container">
      <span class="material-symbols-outlined text-[24px]">person_add</span>
    </div>
    <div class="flex flex-col gap-2">
      <h3 class="font-h3 text-h3 text-on-surface">Enroll in Sequence</h3>
      <p class="font-body-sm text-body-sm text-secondary">
        Automatically drop contacts into your highest performing sequences directly from any contact, deal, or company workflow.
      </p>
    </div>
    <div class="mt-auto flex flex-wrap gap-2 pt-4 border-t border-outline-variant/20">
      <span class="px-2 py-1 bg-surface-container text-on-surface-variant font-label-caps text-[10px] rounded-full">Contact Workflows</span>
      <span class="px-2 py-1 bg-surface-container text-on-surface-variant font-label-caps text-[10px] rounded-full">Deal Workflows</span>
      <span class="px-2 py-1 bg-surface-container text-on-surface-variant font-label-caps text-[10px] rounded-full">Company Workflows</span>
    </div>
  </div>
  <div class="bg-surface-container-lowest rounded-xl p-card-padding border border-outline-variant/30 shadow-[0_1px_4px_rgba(0,0,0,0.08)] flex flex-col gap-6 relative overflow-hidden group hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] transition-shadow duration-300">
    <div class="absolute top-0 right-0 w-32 h-32 bg-error/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform duration-500"></div>
    <div class="w-12 h-12 rounded-lg bg-error/10 flex items-center justify-center text-error">
      <span class="material-symbols-outlined text-[24px]">person_remove</span>
    </div>
    <div class="flex flex-col gap-2">
      <h3 class="font-h3 text-h3 text-on-surface">Unenroll from Sequence</h3>
      <p class="font-body-sm text-body-sm text-secondary">
        Stop outreach instantly. Cancel active sequence enrollments based on custom triggers, deal stage changes, or form submissions.
      </p>
    </div>
    <div class="mt-auto pt-4">
      <div class="h-2 w-full bg-surface-container rounded-full overflow-hidden">
        <div class="h-full bg-error w-1/3"></div>
      </div>
      <span class="text-[10px] text-secondary mt-1 block font-label-caps">PREVENT UNWANTED EMAILS</span>
    </div>
  </div>
  <div class="bg-surface-container-lowest rounded-xl p-card-padding border border-outline-variant/30 shadow-[0_1px_4px_rgba(0,0,0,0.08)] flex flex-col gap-6 relative overflow-hidden group hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] transition-shadow duration-300">
    <div class="absolute top-0 right-0 w-32 h-32 bg-tertiary-container/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform duration-500"></div>
    <div class="w-12 h-12 rounded-lg bg-tertiary-container/20 flex items-center justify-center text-on-tertiary-container">
      <span class="material-symbols-outlined text-[24px]">call_split</span>
    </div>
    <div class="flex flex-col gap-2">
      <h3 class="font-h3 text-h3 text-on-surface">Random Branch</h3>
      <p class="font-body-sm text-body-sm text-secondary">
        A/B test your sequences. Split contacts randomly into up to 5 distinct branches to test different messaging strategies.
      </p>
    </div>
    <div class="mt-auto flex gap-2 pt-4">
      <div class="flex-1 bg-surface-container h-8 rounded-md flex items-center justify-center text-xs font-medium text-secondary">50% A</div>
      <div class="flex-1 bg-surface-container h-8 rounded-md flex items-center justify-center text-xs font-medium text-secondary">50% B</div>
    </div>
  </div>
  <div class="bg-[#1a202c] rounded-xl p-card-padding border border-slate-800 shadow-[0_1px_4px_rgba(0,0,0,0.08)] flex flex-col gap-6 relative overflow-hidden group hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] transition-shadow duration-300 text-white">
    <div class="absolute top-0 right-0 w-32 h-32 bg-primary-container/10 rounded-bl-full -z-10 group-hover:scale-110 transition-transform duration-500"></div>
    <div class="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center text-white border border-slate-700">
      <span class="material-symbols-outlined text-[24px]">payments</span>
    </div>
    <div class="flex flex-col gap-2">
      <h3 class="font-h3 text-h3 text-white">Flexible Pricing</h3>
      <p class="font-body-sm text-body-sm text-slate-400">
        Start for free. Scale when you need to. First 100 successful enrollments every month are completely free.
      </p>
    </div>
    <div class="mt-auto pt-4 flex items-end gap-2 border-t border-slate-800">
      <span class="text-3xl font-bold text-white">$0</span>
      <span class="text-sm text-slate-400 pb-1">/ 100 enrollments</span>
    </div>
  </div>
</section>
</main>
${FOOTER}
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
