import { Router, Request, Response } from 'express';
import { config } from '../config';
import { createSubscription, getSubscription as getPayPalSub } from '../paypal';
import { getSubscription, upsertSubscription } from '../db';
import { TAILWIND_SETUP, FOOTER } from '../ui';

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

// ── Pricing page ──────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  const portalId = String(req.query.portalId ?? '');
  const justInstalled = req.query.installed === '1';
  const { pro, enterprise } = config.pricing;

  const currentTier = portalId
    ? (await getSubscription(parseInt(portalId, 10))).tier
    : null;

  const savePct = Math.round((1 - (pro.yearly / 12) / pro.monthly) * 100);

  const features = {
    free: ['100 enrollments / month', 'All workflow types (contact, deal, company)', 'Association label filtering', 'Community support'],
    pro: ['1,000 enrollments / month', 'All workflow types (contact, deal, company)', 'Association label filtering', 'Email support'],
    enterprise: ['Unlimited enrollments', 'All workflow types (contact, deal, company)', 'Association label filtering', 'Priority support &amp; onboarding'],
  };

  const featureList = (items: string[]) =>
    items.map((f) => `
    <li class="flex items-center gap-3">
      <span class="material-symbols-outlined text-primary-container text-[20px]" style="font-variation-settings: 'FILL' 1;">check_circle</span>
      <span class="font-body-base text-body-base text-on-surface">${f}</span>
    </li>`).join('');

  const isCurrent = (tier: string) => currentTier === tier.toUpperCase();

  const subscribeBtn = (plan: Plan, highlight: boolean) => {
    if (isCurrent(plan)) {
      return `<button class="w-full bg-surface-container border border-outline-variant text-secondary px-4 py-3 rounded-[7px] font-button-text text-button-text mt-auto cursor-default" disabled>Current Plan</button>`;
    }
    const btnClass = highlight
      ? 'w-full bg-primary-container text-white px-4 py-3 rounded-[7px] font-button-text text-button-text hover:opacity-90 transition-all duration-100 active:scale-95 mt-auto shadow-sm'
      : 'w-full bg-white border border-outline-variant text-on-surface px-4 py-3 rounded-[7px] font-button-text text-button-text hover:bg-[#f9fafb] transition-all duration-100 active:scale-95 mt-auto';
    return `
    <form action="/pricing/subscribe" method="POST" class="mt-auto">
      <input type="hidden" name="plan" value="${plan}">
      <input type="hidden" name="cycle" value="monthly" class="cycle-input">
      <input type="hidden" name="portalId" value="${portalId}" class="portal-input">
      <button type="submit" class="${btnClass}"${!portalId ? ' onclick="return checkInstall()"' : ''}>Subscribe</button>
    </form>`;
  };

  res.send(`<!doctype html>
<html class="light" lang="en">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Flow Enroll - Pricing</title>
${TAILWIND_SETUP}
</head>
<body class="font-body-base text-body-base text-on-surface antialiased min-h-screen flex flex-col bg-background">
<header class="bg-[#1a202c] sticky top-0 z-50 w-full border-b border-slate-800 shadow-sm font-['Inter'] text-sm font-medium tracking-tight">
<div class="flex justify-between items-center w-full px-8 h-16 max-w-[1280px] mx-auto">
  <a class="text-xl font-black text-white hover:opacity-100 transition-all duration-200" href="/">Flow Enroll</a>
  <div class="flex items-center gap-6">
    <a class="text-white opacity-100 border-b-2 border-[#ff7a59] pb-1" href="/pricing">Pricing</a>
    <a class="text-white opacity-70 hover:opacity-100 hover:text-white transition-all duration-200" href="mailto:support@flowenroll.io">Support</a>
  </div>
</div>
</header>
${justInstalled ? `<div class="bg-[#ebf8ff] border-b border-[#bee3f8] px-8 py-3 text-center font-body-sm text-body-sm text-[#2c5282]">
  App installed on portal <strong>${portalId}</strong>. Choose a plan or continue on the Free tier.
</div>` : ''}
<main class="flex-grow flex flex-col items-center justify-center px-8 py-16 w-full max-w-[1280px] mx-auto">
  <div class="text-center mb-12">
    <h1 class="font-h1 text-h1 text-on-surface mb-4">Simple, transparent pricing</h1>
    <p class="font-body-base text-body-base text-secondary mb-8 max-w-2xl mx-auto">Choose the plan that fits your enrollment needs. No hidden fees.</p>
    <div class="inline-flex items-center bg-surface-container-low rounded-full p-1 border border-outline-variant">
      <button id="btn-monthly" class="px-6 py-2 rounded-full bg-white shadow-sm font-button-text text-button-text text-on-surface transition-all duration-200" type="button">Monthly</button>
      <div class="flex items-center">
        <button id="btn-yearly" class="px-6 py-2 rounded-full font-button-text text-button-text text-secondary hover:text-on-surface transition-colors duration-200" type="button">Yearly</button>
        <span class="ml-2 mr-4 px-2 py-1 bg-primary-container text-white rounded-full font-label-caps text-label-caps">Save ${savePct}%</span>
      </div>
    </div>
  </div>
  <div class="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl">
    <!-- Free Plan -->
    <div class="bg-white rounded-xl p-card-padding border ${isCurrent('free') ? 'border-2 border-tertiary' : 'border-outline-variant'} shadow-[0_1px_4px_rgba(0,0,0,0.08)] flex flex-col">
      ${isCurrent('free') ? '<div class="text-center mb-2"><span class="bg-tertiary text-white px-3 py-1 rounded-full font-label-caps text-label-caps">Your Plan</span></div>' : ''}
      <div class="mb-6 border-b border-outline-variant pb-6">
        <h3 class="font-h3 text-h3 text-on-surface mb-2">Free</h3>
        <div class="flex items-baseline gap-1 mb-1">
          <span class="font-h1 text-h1 text-on-surface monthly-price">$0</span>
          <span class="font-body-sm text-body-sm text-secondary monthly-price">/mo</span>
          <span class="font-h1 text-h1 text-on-surface yearly-price hidden">$0</span>
          <span class="font-body-sm text-body-sm text-secondary yearly-price hidden">/mo</span>
        </div>
        <p class="font-body-sm text-body-sm text-secondary">Perfect for getting started with basic enrollments.</p>
      </div>
      <ul class="flex-grow space-y-4 mb-8">${featureList(features.free)}</ul>
      <a href="/auth/install" class="w-full inline-flex justify-center items-center bg-white border border-outline-variant text-on-surface px-4 py-3 rounded-[7px] font-button-text text-button-text hover:bg-[#f9fafb] transition-all duration-100 active:scale-95 mt-auto">Get Started Free</a>
    </div>
    <!-- Pro Plan -->
    <div class="bg-white rounded-xl p-card-padding border-2 border-primary-container shadow-[0_4px_12px_rgba(0,0,0,0.12)] flex flex-col relative md:-translate-y-4">
      <div class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
        <span class="bg-primary-container text-white px-3 py-1 rounded-full font-label-caps text-label-caps">${isCurrent('pro') ? 'Your Plan' : 'Most Popular'}</span>
      </div>
      <div class="mb-6 border-b border-outline-variant pb-6">
        <h3 class="font-h3 text-h3 text-on-surface mb-2">Pro</h3>
        <div class="flex items-baseline gap-1 mb-1">
          <span class="font-h1 text-h1 text-on-surface monthly-price">$${pro.monthly}</span>
          <span class="font-body-sm text-body-sm text-secondary monthly-price">/mo</span>
          <span class="font-h1 text-h1 text-on-surface yearly-price hidden">$${Math.round(pro.yearly / 12)}</span>
          <span class="font-body-sm text-body-sm text-secondary yearly-price hidden">/mo</span>
        </div>
        <p class="font-body-sm text-body-sm text-secondary yearly-note hidden">$${pro.yearly} billed annually</p>
        <p class="font-body-sm text-body-sm text-secondary">For growing businesses needing more capacity.</p>
      </div>
      <ul class="flex-grow space-y-4 mb-8">${featureList(features.pro)}</ul>
      ${subscribeBtn('pro', true)}
    </div>
    <!-- Enterprise Plan -->
    <div class="bg-white rounded-xl p-card-padding border ${isCurrent('enterprise') ? 'border-2 border-tertiary' : 'border-outline-variant'} shadow-[0_1px_4px_rgba(0,0,0,0.08)] flex flex-col">
      ${isCurrent('enterprise') ? '<div class="text-center mb-2"><span class="bg-tertiary text-white px-3 py-1 rounded-full font-label-caps text-label-caps">Your Plan</span></div>' : ''}
      <div class="mb-6 border-b border-outline-variant pb-6">
        <h3 class="font-h3 text-h3 text-on-surface mb-2">Enterprise</h3>
        <div class="flex items-baseline gap-1 mb-1">
          <span class="font-h1 text-h1 text-on-surface monthly-price">$${enterprise.monthly}</span>
          <span class="font-body-sm text-body-sm text-secondary monthly-price">/mo</span>
          <span class="font-h1 text-h1 text-on-surface yearly-price hidden">$${Math.round(enterprise.yearly / 12)}</span>
          <span class="font-body-sm text-body-sm text-secondary yearly-price hidden">/mo</span>
        </div>
        <p class="font-body-sm text-body-sm text-secondary yearly-note hidden">$${enterprise.yearly} billed annually</p>
        <p class="font-body-sm text-body-sm text-secondary">Unlimited power for large scale operations.</p>
      </div>
      <ul class="flex-grow space-y-4 mb-8">${featureList(features.enterprise)}</ul>
      ${subscribeBtn('enterprise', false)}
    </div>
  </div>
</main>
${FOOTER}
<script>
  const btnMonthly = document.getElementById('btn-monthly');
  const btnYearly  = document.getElementById('btn-yearly');

  function setYearly(yearly) {
    document.querySelectorAll('.monthly-price').forEach(el => el.classList.toggle('hidden', yearly));
    document.querySelectorAll('.yearly-price').forEach(el  => el.classList.toggle('hidden', !yearly));
    document.querySelectorAll('.yearly-note').forEach(el   => el.classList.toggle('hidden', !yearly));
    document.querySelectorAll('.cycle-input').forEach(el   => el.value = yearly ? 'yearly' : 'monthly');
    btnMonthly.className = yearly
      ? 'px-6 py-2 rounded-full font-button-text text-button-text text-secondary hover:text-on-surface transition-colors duration-200'
      : 'px-6 py-2 rounded-full bg-white shadow-sm font-button-text text-button-text text-on-surface transition-all duration-200';
    btnYearly.className = yearly
      ? 'px-6 py-2 rounded-full bg-white shadow-sm font-button-text text-button-text text-on-surface transition-all duration-200'
      : 'px-6 py-2 rounded-full font-button-text text-button-text text-secondary hover:text-on-surface transition-colors duration-200';
  }

  btnMonthly.addEventListener('click', () => setYearly(false));
  btnYearly.addEventListener('click',  () => setYearly(true));

  const pid = new URLSearchParams(location.search).get('portalId') || '';
  document.querySelectorAll('.portal-input').forEach(el => el.value = pid);

  function checkInstall() {
    alert('Please install the app on your HubSpot portal first.');
    return false;
  }
</script>
</body>
</html>`);
});

// ── Subscribe → create PayPal subscription ────────────────────────────────────

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
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Subscribed — Flow Enroll</title>
${TAILWIND_SETUP}
</head>
<body class="bg-background min-h-screen flex items-center justify-center p-6 antialiased">
<div class="w-full max-w-[420px] bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-[24px] flex flex-col items-center text-center">
  <div class="mb-6 flex items-center justify-center w-16 h-16 rounded-full bg-tertiary-container/20">
    <span class="material-symbols-outlined text-[32px] text-tertiary" style="font-variation-settings: 'FILL' 1;">celebration</span>
  </div>
  <h1 class="font-h2 text-h2 text-on-surface mb-3">You're all set!</h1>
  <p class="font-body-base text-body-base text-on-surface-variant mb-8">
    Portal <span class="font-medium text-on-surface">${portalId}</span> has been upgraded to the
    <span class="font-medium text-on-surface">${plan.charAt(0).toUpperCase() + plan.slice(1)}</span> plan (${cycle}).
  </p>
  <a href="https://app.hubspot.com" class="w-full inline-flex justify-center items-center gap-2 px-4 py-3 bg-primary text-on-primary font-button-text text-button-text rounded-lg transition-all duration-200 shadow-sm">
    Back to HubSpot
    <span class="material-symbols-outlined text-[18px]">open_in_new</span>
  </a>
</div>
</body>
</html>`);
  } catch (err: any) {
    console.error('[pricing/return]', err?.response?.data ?? err.message);
    res.redirect('/pricing?error=activation_failed');
  }
});

// ── PayPal webhook for subscription lifecycle events ──────────────────────────

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
    res.sendStatus(200);
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
