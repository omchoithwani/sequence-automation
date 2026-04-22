import { Router, Request, Response } from 'express';
import { getAllPortals, upsertSubscription, TIER_LIMITS } from '../db';
import { adminAuth } from '../middleware/admin-auth';
import { TAILWIND_SETUP, FOOTER } from '../ui';

const router = Router();
router.use(adminAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function tierBadge(tier: string, status: string): string {
  const label = tier === 'ENTERPRISE' ? 'ENT' : tier;
  const cls: Record<string, string> = {
    FREE: 'bg-slate-100 text-slate-600',
    PRO: 'bg-blue-100 text-blue-800',
    ENTERPRISE: 'bg-purple-100 text-purple-800',
  };
  const dimmed = status !== 'ACTIVE' ? ' opacity-60' : '';
  return `<span class="px-2 py-1 rounded-full font-label-caps text-[10px]${dimmed} ${cls[tier] ?? 'bg-slate-100 text-slate-600'}">${label}${status !== 'ACTIVE' ? ` (${status})` : ''}</span>`;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  const secret = (req as any).adminSecret as string;
  const portals = await getAllPortals();

  const totalPortals = portals.length;
  const paidPortals = portals.filter((p) => p.tier !== 'FREE' && p.status === 'ACTIVE').length;
  const totalEnrollments = portals.reduce((s, p) => s + p.monthlyCount, 0);

  const { pricing } = require('../config').config;
  let mrr = 0;
  for (const p of portals) {
    if (p.status !== 'ACTIVE') continue;
    if (p.tier === 'PRO') mrr += p.billingCycle === 'YEARLY' ? Math.round(pricing.pro.yearly / 12) : pricing.pro.monthly;
    if (p.tier === 'ENTERPRISE') mrr += p.billingCycle === 'YEARLY' ? Math.round(pricing.enterprise.yearly / 12) : pricing.enterprise.monthly;
  }

  const rows = portals.map((p) => {
    const limit = p.tierLimit;
    const pct = limit === null ? 100 : Math.min(100, Math.round((p.monthlyCount / limit) * 100));
    const barColor = pct >= 90 ? 'bg-error' : pct >= 70 ? 'bg-yellow-500' : 'bg-tertiary';
    const subStatus = p.paypalSubscriptionId
      ? `<span class="flex items-center gap-1 text-tertiary font-body-sm text-body-sm"><span class="material-symbols-outlined text-[16px]">check_circle</span> Active</span>`
      : `<span class="flex items-center gap-1 text-secondary opacity-50 font-body-sm text-body-sm"><span class="material-symbols-outlined text-[16px]">cancel</span> None</span>`;

    return `
    <tr class="border-b border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors group">
      <td class="p-4 font-mono text-xs text-on-surface-variant">${p.portalId}</td>
      <td class="p-4 font-medium text-on-surface font-body-sm text-body-sm">${p.hubDomain ?? '—'}</td>
      <td class="p-4">${tierBadge(p.tier, p.status)}</td>
      <td class="p-4">
        <div class="flex items-center gap-2">
          <div class="flex-1 bg-slate-200 rounded-full h-1.5 min-w-[80px]">
            <div class="${barColor} h-1.5 rounded-full" style="width:${pct}%"></div>
          </div>
          <span class="text-xs text-secondary whitespace-nowrap">${p.monthlyCount} / ${limit === null ? '∞' : limit}</span>
        </div>
      </td>
      <td class="p-4 font-body-sm text-body-sm text-on-surface-variant">${fmtDate(p.installedAt)}</td>
      <td class="p-4">${subStatus}</td>
      <td class="p-4 text-right">
        <form action="/admin/set-tier?secret=${encodeURIComponent(secret)}" method="POST" class="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <input type="hidden" name="portalId" value="${p.portalId}">
          <select name="tier" class="border border-[#e5e7eb] rounded px-2 py-1 text-xs outline-none focus:border-primary-container">
            ${['FREE', 'PRO', 'ENTERPRISE'].map((t) => `<option value="${t}"${t === p.tier ? ' selected' : ''}>${t}</option>`).join('')}
          </select>
          <button type="submit" class="bg-surface-variant text-on-surface-variant px-3 py-1 rounded text-xs font-medium hover:bg-surface-tint hover:text-white transition-colors">Set</button>
        </form>
      </td>
    </tr>`;
  }).join('');

  res.send(`<!doctype html>
<html class="light" lang="en">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Flow Enroll - Super Admin</title>
${TAILWIND_SETUP}
</head>
<body class="bg-[#f7f8fa] text-on-background min-h-screen flex flex-col font-body-base">
<header class="bg-[#1a202c] sticky top-0 z-50 shadow-sm border-b border-slate-800">
  <div class="flex justify-between items-center w-full px-8 h-16 max-w-[1280px] mx-auto">
    <div class="flex items-center gap-4">
      <span class="text-xl font-black text-white">Super Admin</span>
    </div>
    <nav class="hidden md:flex items-center gap-6 font-['Inter'] text-sm font-medium tracking-tight">
      <a class="text-white opacity-100 border-b-2 border-[#ff7a59] pb-1 hover:text-white transition-all duration-200" href="/admin?secret=${encodeURIComponent(secret)}">Dashboard</a>
    </nav>
    <div class="flex items-center gap-4">
      <span class="text-sm font-medium text-[#ff7a59]">Flow Enroll</span>
    </div>
  </div>
</header>
<main class="flex-grow w-full max-w-[1280px] mx-auto px-8 py-margin-page">
  <div class="mb-8 flex justify-between items-end">
    <div>
      <h1 class="font-h1 text-h1 text-on-surface">Platform Overview</h1>
      <p class="font-body-base text-body-base text-on-surface-variant mt-2">Global metrics and portal management.</p>
    </div>
  </div>
  <!-- Stats Grid -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter mb-8">
    <div class="bg-surface-container-lowest rounded-xl p-card-padding shadow-[0_1px_4px_rgba(0,0,0,0.08)] border border-[#e5e7eb] flex flex-col justify-between">
      <div class="flex justify-between items-start mb-4">
        <span class="font-label-caps text-label-caps text-secondary uppercase">Total Portals</span>
        <span class="material-symbols-outlined text-secondary opacity-50">domain</span>
      </div>
      <div>
        <div class="font-h1 text-h1 text-on-surface">${totalPortals.toLocaleString()}</div>
        <div class="font-body-sm text-body-sm text-secondary mt-1">installed all time</div>
      </div>
    </div>
    <div class="bg-surface-container-lowest rounded-xl p-card-padding shadow-[0_1px_4px_rgba(0,0,0,0.08)] border border-[#e5e7eb] flex flex-col justify-between">
      <div class="flex justify-between items-start mb-4">
        <span class="font-label-caps text-label-caps text-secondary uppercase">Paid Portals</span>
        <span class="material-symbols-outlined text-secondary opacity-50">verified</span>
      </div>
      <div>
        <div class="font-h1 text-h1 text-on-surface">${paidPortals.toLocaleString()}</div>
        <div class="font-body-sm text-body-sm text-secondary mt-1">Pro + Enterprise</div>
      </div>
    </div>
    <div class="bg-surface-container-lowest rounded-xl p-card-padding shadow-[0_1px_4px_rgba(0,0,0,0.08)] border border-[#e5e7eb] flex flex-col justify-between">
      <div class="flex justify-between items-start mb-4">
        <span class="font-label-caps text-label-caps text-secondary uppercase">Enrollments This Month</span>
        <span class="material-symbols-outlined text-secondary opacity-50">group_add</span>
      </div>
      <div>
        <div class="font-h1 text-h1 text-on-surface">${totalEnrollments.toLocaleString()}</div>
        <div class="font-body-sm text-body-sm text-secondary mt-1">across all portals</div>
      </div>
    </div>
    <div class="bg-surface-container-lowest rounded-xl p-card-padding shadow-[0_1px_4px_rgba(0,0,0,0.08)] border border-[#e5e7eb] flex flex-col justify-between">
      <div class="flex justify-between items-start mb-4">
        <span class="font-label-caps text-label-caps text-secondary uppercase">Est. MRR</span>
        <span class="material-symbols-outlined text-secondary opacity-50">payments</span>
      </div>
      <div>
        <div class="font-h1 text-h1 text-on-surface">$${mrr.toLocaleString()}</div>
        <div class="font-body-sm text-body-sm text-secondary mt-1">USD / month</div>
      </div>
    </div>
  </div>
  <!-- Portals Table -->
  <div class="bg-surface-container-lowest rounded-xl shadow-[0_1px_4px_rgba(0,0,0,0.08)] border border-[#e5e7eb] overflow-hidden">
    <div class="p-6 border-b border-[#e5e7eb] flex justify-between items-center bg-white">
      <h2 class="font-h3 text-h3 text-on-surface">Active Portals (${totalPortals})</h2>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-[#f9fafb] border-b border-[#e5e7eb]">
            <th class="p-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider">Portal ID</th>
            <th class="p-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider">Domain</th>
            <th class="p-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider">Tier</th>
            <th class="p-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider w-48">This Month</th>
            <th class="p-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider">Installed</th>
            <th class="p-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider">PayPal Sub</th>
            <th class="p-4 font-label-caps text-label-caps text-secondary uppercase tracking-wider text-right">Override</th>
          </tr>
        </thead>
        <tbody class="font-body-sm text-body-sm">
          ${portals.length === 0
            ? `<tr><td colspan="7" class="p-12 text-center font-body-base text-body-base text-on-surface-variant">No portals have installed the app yet.</td></tr>`
            : rows}
        </tbody>
      </table>
    </div>
    <div class="p-4 border-t border-[#e5e7eb] bg-[#f9fafb] flex justify-between items-center">
      <span class="font-body-sm text-body-sm text-secondary">Showing ${portals.length} portal${portals.length !== 1 ? 's' : ''}</span>
    </div>
  </div>
</main>
${FOOTER}
</body>
</html>`);
});

// ── Tier override ─────────────────────────────────────────────────────────────

router.post('/set-tier', async (req: Request, res: Response) => {
  const portalId = parseInt(req.body.portalId ?? '', 10);
  const tier = String(req.body.tier ?? 'FREE').toUpperCase();
  const secret = (req as any).adminSecret as string;

  if (isNaN(portalId) || !TIER_LIMITS[tier]) {
    res.status(400).send('Invalid portalId or tier.');
    return;
  }

  await upsertSubscription(portalId, { tier, status: 'ACTIVE' });
  console.log(`[admin] Portal ${portalId} tier set to ${tier}`);
  res.redirect(`/admin?secret=${encodeURIComponent(secret)}`);
});

export default router;
