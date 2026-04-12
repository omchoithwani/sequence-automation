import { Router, Request, Response } from 'express';
import { config } from '../config';
import { createSubscription, getSubscription as getPayPalSub } from '../paypal';
import { getSubscription, upsertSubscription } from '../db';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

type Plan = 'pro' | 'enterprise';
type Cycle = 'monthly' | 'yearly';

function planId(plan: Plan, cycle: Cycle): string {
  const map: Record<string, string> = {
    'pro-monthly': config.paypal.plans.proMonthly,
    'pro-yearly': config.paypal.plans.proYearly,
    'enterprise-monthly': config.paypal.plans.enterpriseMonthly,
    'enterprise-yearly': config.paypal.plans.enterpriseYearly,
  };
  return map[`${plan}-${cycle}`] ?? '';
}

function tierFromPlan(plan: Plan): string {
  return plan.toUpperCase();
}

const FEATURES: Record<string, string[]> = {
  free: ['100 enrollments / month', 'All workflow types (contact, deal, company)', 'Association label filtering', 'Community support'],
  pro: ['1,000 enrollments / month', 'All workflow types (contact, deal, company)', 'Association label filtering', 'Email support'],
  enterprise: ['Unlimited enrollments', 'All workflow types (contact, deal, company)', 'Association label filtering', 'Priority support & onboarding'],
};

// ── Pricing page ──────────────────────────────────────────────────────────────

/**
 * GET /pricing
 * Public pricing page — also the landing page after a fresh install.
 * Pass ?portalId=X to pre-fill the subscribe buttons.
 * Pass ?installed=1 to show a "you just installed" banner.
 */
router.get('/', async (req: Request, res: Response) => {
  const portalId = String(req.query.portalId ?? '');
  const justInstalled = req.query.installed === '1';
  const { pro, enterprise } = config.pricing;

  const currentTier = portalId
    ? (await getSubscription(parseInt(portalId, 10))).tier
    : null;

  const savePct = Math.round((1 - (pro.yearly / 12) / pro.monthly) * 100);

  const card = (
    id: string,
    name: string,
    monthlyPrice: number | null,
    yearlyPrice: number | null,
    features: string[],
    highlight: boolean,
    plan: Plan | null
  ) => {
    const isCurrent = currentTier === id.toUpperCase();
    return `
    <div class="card${highlight ? ' highlight' : ''}${isCurrent ? ' current' : ''}">
      ${highlight ? '<div class="badge">Most Popular</div>' : ''}
      ${isCurrent ? '<div class="badge badge-current">Your Plan</div>' : ''}
      <h3>${name}</h3>
      <div class="price monthly-price">
        ${monthlyPrice === null ? '<span class="amount">$0</span><span class="period">/mo</span>' : `<span class="amount">$${monthlyPrice}</span><span class="period">/mo</span>`}
      </div>
      <div class="price yearly-price" style="display:none">
        ${yearlyPrice === null ? '<span class="amount">$0</span><span class="period">/mo</span><span class="billed">billed annually</span>' : `<span class="amount">$${Math.round(yearlyPrice / 12)}</span><span class="period">/mo</span><span class="billed">$${yearlyPrice} billed annually</span>`}
      </div>
      <ul>
        ${features.map((f) => `<li>${f}</li>`).join('')}
      </ul>
      ${
        plan === null
          ? `<a href="/auth/install" class="btn btn-outline">Get Started Free</a>`
          : isCurrent
          ? `<button class="btn btn-disabled" disabled>Current Plan</button>`
          : `
          <form action="/pricing/subscribe" method="POST">
            <input type="hidden" name="plan" value="${plan}">
            <input type="hidden" name="cycle" value="monthly" class="cycle-input">
            <input type="hidden" name="portalId" value="${portalId}" class="portal-input">
            <button type="submit" class="btn${highlight ? '' : ' btn-outline'}"
              ${!portalId ? 'onclick="return checkInstall()"' : ''}>
              Subscribe
            </button>
          </form>`
      }
    </div>`;
  };

  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Pricing — HubSpot Sequence Automation</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f7f8fa;color:#1a202c}
    nav{background:#fff;border-bottom:1px solid #e2e8f0;padding:0 24px;height:56px;display:flex;align-items:center;justify-content:space-between}
    nav a{color:#1a202c;text-decoration:none;font-weight:600;font-size:.95rem}
    nav .links a{margin-left:24px;font-weight:400;color:#4a5568}
    .banner{background:#ebf8ff;border-bottom:1px solid #bee3f8;padding:12px 24px;text-align:center;font-size:.9rem;color:#2c5282}
    .wrap{max-width:1000px;margin:0 auto;padding:56px 24px}
    h1{font-size:2rem;font-weight:700;text-align:center;margin-bottom:8px}
    .sub{text-align:center;color:#718096;margin-bottom:40px;font-size:1.05rem}
    .toggle-wrap{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:48px}
    .toggle-label{font-size:.9rem;color:#4a5568;font-weight:500}
    .toggle{position:relative;width:52px;height:28px;cursor:pointer}
    .toggle input{opacity:0;width:0;height:0}
    .slider{position:absolute;inset:0;background:#cbd5e0;border-radius:28px;transition:.2s}
    .slider::before{content:'';position:absolute;width:22px;height:22px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.2s}
    input:checked+.slider{background:#ff7a59}
    input:checked+.slider::before{transform:translateX(24px)}
    .save-badge{background:#c6f6d5;color:#276749;font-size:.75rem;font-weight:600;padding:2px 8px;border-radius:20px}
    .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
    .card{background:#fff;border-radius:12px;padding:28px 24px;border:2px solid #e2e8f0;position:relative;display:flex;flex-direction:column;gap:20px}
    .card.highlight{border-color:#ff7a59;box-shadow:0 4px 20px rgba(255,122,89,.15)}
    .card.current{border-color:#48bb78}
    .badge{position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:#ff7a59;color:#fff;font-size:.72rem;font-weight:700;padding:4px 14px;border-radius:20px;white-space:nowrap;text-transform:uppercase;letter-spacing:.04em}
    .badge-current{background:#48bb78}
    h3{font-size:1.1rem;font-weight:700;color:#2d3748}
    .amount{font-size:2.4rem;font-weight:800;color:#1a202c}
    .period{color:#718096;font-size:1rem;margin-left:2px}
    .billed{display:block;font-size:.78rem;color:#a0aec0;margin-top:2px}
    ul{list-style:none;display:flex;flex-direction:column;gap:10px;flex:1}
    li{font-size:.88rem;color:#4a5568;display:flex;gap:8px;align-items:flex-start}
    li::before{content:'✓';color:#48bb78;font-weight:700;flex-shrink:0}
    .btn{display:block;text-align:center;padding:12px;border-radius:7px;font-weight:600;font-size:.95rem;cursor:pointer;border:none;background:#ff7a59;color:#fff;text-decoration:none;width:100%}
    .btn:hover{background:#f56444}
    .btn-outline{background:#fff;color:#ff7a59;border:2px solid #ff7a59}
    .btn-outline:hover{background:#fff5f0}
    .btn-disabled{background:#e2e8f0;color:#a0aec0;cursor:default}
    @media(max-width:700px){.cards{grid-template-columns:1fr}}
  </style>
</head>
<body>
<nav>
  <a href="/">HubSpot Sequence Automation</a>
  <div class="links">
    <a href="/auth/install">Install</a>
  </div>
</nav>
${justInstalled ? `<div class="banner">App installed successfully on portal <strong>${portalId}</strong>. Choose a plan below to get started, or continue on the Free tier.</div>` : ''}
<div class="wrap">
  <h1>Simple, transparent pricing</h1>
  <p class="sub">Start free, upgrade as you grow. No contracts. Cancel anytime.</p>

  <div class="toggle-wrap">
    <span class="toggle-label">Monthly</span>
    <label class="toggle">
      <input type="checkbox" id="cycle-toggle">
      <span class="slider"></span>
    </label>
    <span class="toggle-label">Yearly <span class="save-badge">Save ${savePct}%</span></span>
  </div>

  <div class="cards">
    ${card('free', 'Free', 0, 0, FEATURES.free, false, null)}
    ${card('pro', 'Pro', pro.monthly, pro.yearly, FEATURES.pro, true, 'pro')}
    ${card('enterprise', 'Enterprise', enterprise.monthly, enterprise.yearly, FEATURES.enterprise, false, 'enterprise')}
  </div>
</div>

<script>
  const toggle = document.getElementById('cycle-toggle');
  const monthlyPrices = document.querySelectorAll('.monthly-price');
  const yearlyPrices  = document.querySelectorAll('.yearly-price');
  const cycleInputs   = document.querySelectorAll('.cycle-input');

  toggle.addEventListener('change', () => {
    const yearly = toggle.checked;
    monthlyPrices.forEach(el => el.style.display = yearly ? 'none' : '');
    yearlyPrices.forEach(el  => el.style.display = yearly ? '' : 'none');
    cycleInputs.forEach(el   => el.value = yearly ? 'yearly' : 'monthly');
  });

  // Pre-fill portalId from URL (supports sharing the pricing page directly)
  const pid = new URLSearchParams(location.search).get('portalId') || '';
  document.querySelectorAll('.portal-input').forEach(el => el.value = pid);

  function checkInstall() {
    alert('Please install the app on your HubSpot portal first by clicking "Install" at the top.');
    return false;
  }
</script>
</body>
</html>`);
});

// ── Subscribe → create PayPal subscription ────────────────────────────────────

/**
 * POST /pricing/subscribe
 * Creates a PayPal subscription and redirects to PayPal for approval.
 */
router.post('/subscribe', async (req: Request, res: Response) => {
  const plan = req.body.plan as Plan;
  const cycle = req.body.cycle as Cycle;
  const portalId = parseInt(req.body.portalId ?? '', 10);

  if (!plan || !cycle || isNaN(portalId)) {
    res.status(400).send('Missing plan, cycle, or portalId. Please go back and try again.');
    return;
  }

  const pid = planId(plan, cycle);
  if (!pid) {
    res.status(400).send(
      'PayPal plan IDs are not yet configured. Run <code>npm run setup-paypal</code> and add the IDs to your .env file.'
    );
    return;
  }

  try {
    const customId = `${portalId}:${plan}:${cycle}`;
    const returnUrl = `${config.baseUrl}/pricing/return`;
    const cancelUrl = `${config.baseUrl}/pricing?portalId=${portalId}&cancelled=1`;

    const { approveUrl } = await createSubscription(pid, customId, returnUrl, cancelUrl);
    res.redirect(approveUrl);
  } catch (err: any) {
    console.error('[pricing/subscribe]', err?.response?.data ?? err.message);
    res.status(500).send('Failed to create subscription. Please try again.');
  }
});

// ── Return URL after PayPal approval ─────────────────────────────────────────

/**
 * GET /pricing/return
 * PayPal redirects here after the user approves the subscription.
 * We optimistically activate the tier immediately and show a success page.
 */
router.get('/return', async (req: Request, res: Response) => {
  const subscriptionId = req.query.subscription_id as string | undefined;

  if (!subscriptionId) {
    res.redirect('/pricing?error=missing_subscription');
    return;
  }

  try {
    const sub = await getPayPalSub(subscriptionId);
    const customId: string = sub.custom_id ?? '';
    const [portalIdStr, plan, cycle] = customId.split(':');
    const portalId = parseInt(portalIdStr, 10);

    if (!portalId || !plan || !cycle) {
      console.error('[pricing/return] Bad custom_id:', customId);
      res.redirect('/pricing?error=bad_custom_id');
      return;
    }

    await upsertSubscription(portalId, {
      tier: tierFromPlan(plan as Plan),
      billingCycle: cycle.toUpperCase(),
      paypalSubscriptionId: subscriptionId,
      status: 'ACTIVE',
    });

    console.log(`[pricing/return] Portal ${portalId} subscribed to ${plan} ${cycle} (${subscriptionId})`);

    res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8"><title>Subscribed — HubSpot Sequence Automation</title>
  <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f7f8fa}
  .box{background:#fff;border-radius:12px;padding:48px 40px;max-width:480px;text-align:center;box-shadow:0 2px 16px rgba(0,0,0,.08)}
  h2{font-size:1.6rem;margin-bottom:12px;color:#1a202c} p{color:#718096;line-height:1.6;margin-bottom:24px}
  a{display:inline-block;background:#ff7a59;color:#fff;padding:12px 28px;border-radius:7px;text-decoration:none;font-weight:600}</style>
</head>
<body>
  <div class="box">
    <div style="font-size:2.5rem;margin-bottom:16px">🎉</div>
    <h2>You're all set!</h2>
    <p>Portal <strong>${portalId}</strong> has been upgraded to the <strong>${plan.charAt(0).toUpperCase() + plan.slice(1)}</strong> plan (${cycle}).</p>
    <a href="https://app.hubspot.com">Back to HubSpot</a>
  </div>
</body></html>`);
  } catch (err: any) {
    console.error('[pricing/return]', err?.response?.data ?? err.message);
    res.redirect('/pricing?error=activation_failed');
  }
});

// ── PayPal webhook for subscription lifecycle events ──────────────────────────

/**
 * POST /paypal/webhook
 * Handles subscription activated / cancelled / suspended / expired events.
 * Mounted at the root level in index.ts (not under /pricing).
 */
export async function handlePayPalWebhook(req: Request, res: Response): Promise<void> {
  const { verifyWebhook } = await import('../paypal');
  const rawBody: Buffer = (req as any).rawBody ?? Buffer.alloc(0);

  const valid = await verifyWebhook(
    req.headers as Record<string, string>,
    rawBody.toString()
  );
  if (!valid) { res.status(401).json({ error: 'Invalid signature' }); return; }

  const event = req.body;
  const resource = event?.resource ?? {};
  const subscriptionId: string = resource.id ?? '';
  const customId: string = resource.custom_id ?? '';

  const [portalIdStr, plan, cycle] = customId.split(':');
  const portalId = parseInt(portalIdStr ?? '', 10);

  if (!portalId || !plan) {
    res.sendStatus(200); // Not one of ours (or bad custom_id)
    return;
  }

  const eventType: string = event.event_type ?? '';
  console.log(`[paypal-webhook] ${eventType} → portal ${portalId} (${subscriptionId})`);

  switch (eventType) {
    case 'BILLING.SUBSCRIPTION.ACTIVATED':
      await upsertSubscription(portalId, {
        tier: tierFromPlan(plan as Plan),
        billingCycle: (cycle ?? 'MONTHLY').toUpperCase(),
        paypalSubscriptionId: subscriptionId,
        status: 'ACTIVE',
      });
      break;

    case 'BILLING.SUBSCRIPTION.CANCELLED':
    case 'BILLING.SUBSCRIPTION.EXPIRED':
      await upsertSubscription(portalId, { tier: 'FREE', billingCycle: null, status: 'CANCELLED' });
      break;

    case 'BILLING.SUBSCRIPTION.SUSPENDED':
      await upsertSubscription(portalId, { status: 'SUSPENDED' });
      break;

    case 'BILLING.SUBSCRIPTION.RE_ACTIVATED':
      await upsertSubscription(portalId, {
        tier: tierFromPlan(plan as Plan),
        status: 'ACTIVE',
      });
      break;
  }

  res.sendStatus(200);
}

export default router;
