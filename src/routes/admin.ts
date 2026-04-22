import { Router, Request, Response } from 'express';
import { getAllPortals, upsertSubscription, TIER_LIMITS } from '../db';
import { adminAuth } from '../middleware/admin-auth';

const router = Router();
router.use(adminAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function tierBadge(tier: string, status: string): string {
  const color: Record<string, string> = {
    FREE: '#718096',
    PRO: '#3182ce',
    ENTERPRISE: '#805ad5',
  };
  const statusColor = status === 'ACTIVE' ? '' : ';opacity:.6';
  return `<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:.75rem;font-weight:700;background:${color[tier] ?? '#718096'}22;color:${color[tier] ?? '#718096'}${statusColor}">${tier}${status !== 'ACTIVE' ? ` (${status})` : ''}</span>`;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

/**
 * GET /admin
 * Main admin dashboard. Protected by adminAuth middleware.
 * Access: /admin?secret=YOUR_ADMIN_SECRET
 */
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
    const barColor = pct >= 90 ? '#fc8181' : pct >= 70 ? '#f6ad55' : '#68d391';

    return `
    <tr>
      <td><code>${p.portalId}</code></td>
      <td>${p.hubDomain ?? '—'}</td>
      <td>${tierBadge(p.tier, p.status)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;background:#e2e8f0;border-radius:4px;height:8px;min-width:80px">
            <div style="width:${pct}%;background:${barColor};height:8px;border-radius:4px"></div>
          </div>
          <span style="font-size:.8rem;color:#4a5568;white-space:nowrap">
            ${p.monthlyCount} / ${limit === null ? '∞' : limit}
          </span>
        </div>
      </td>
      <td style="font-size:.8rem;color:#718096">${fmtDate(p.installedAt)}</td>
      <td style="font-size:.75rem;color:#a0aec0">${p.paypalSubscriptionId ? `<code>${p.paypalSubscriptionId.slice(0, 18)}…</code>` : '—'}</td>
      <td>
        <form action="/admin/set-tier?secret=${encodeURIComponent(secret)}" method="POST" style="display:flex;gap:4px">
          <input type="hidden" name="portalId" value="${p.portalId}">
          <select name="tier" style="font-size:.8rem;padding:3px 6px;border:1px solid #e2e8f0;border-radius:5px">
            ${['FREE', 'PRO', 'ENTERPRISE'].map((t) => `<option value="${t}"${t === p.tier ? ' selected' : ''}>${t}</option>`).join('')}
          </select>
          <button type="submit" style="font-size:.8rem;padding:3px 10px;background:#4a5568;color:#fff;border:none;border-radius:5px;cursor:pointer">Set</button>
        </form>
      </td>
    </tr>`;
  }).join('');

  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Admin — Flow Enroll</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f7f8fa;color:#1a202c}
    header{background:#1a202c;color:#fff;padding:16px 32px;display:flex;align-items:center;justify-content:space-between}
    header h1{font-size:1.1rem;font-weight:600}
    header span{font-size:.8rem;color:#a0aec0}
    .wrap{max-width:1200px;margin:0 auto;padding:32px}
    .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px}
    .stat{background:#fff;border-radius:10px;padding:20px 24px;border:1px solid #e2e8f0}
    .stat .label{font-size:.78rem;color:#718096;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
    .stat .value{font-size:2rem;font-weight:700;color:#1a202c}
    .stat .sub{font-size:.78rem;color:#a0aec0;margin-top:2px}
    .section{background:#fff;border-radius:10px;border:1px solid #e2e8f0;overflow:hidden}
    .section-header{padding:16px 24px;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:.95rem;color:#2d3748}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;padding:10px 16px;font-size:.75rem;color:#718096;text-transform:uppercase;letter-spacing:.04em;background:#f7f8fa;border-bottom:1px solid #e2e8f0}
    td{padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:.87rem;vertical-align:middle}
    tr:last-child td{border-bottom:none}
    tr:hover td{background:#fafafa}
    code{background:#f0f0f0;padding:1px 5px;border-radius:3px;font-size:.82rem}
    .empty{padding:48px;text-align:center;color:#a0aec0}
  </style>
</head>
<body>
<header>
  <h1>Super Admin</h1>
  <span>Flow Enroll</span>
</header>
<div class="wrap">
  <div class="cards">
    <div class="stat">
      <div class="label">Total Portals</div>
      <div class="value">${totalPortals}</div>
      <div class="sub">installed all time</div>
    </div>
    <div class="stat">
      <div class="label">Paid Portals</div>
      <div class="value">${paidPortals}</div>
      <div class="sub">Pro + Enterprise</div>
    </div>
    <div class="stat">
      <div class="label">Enrollments This Month</div>
      <div class="value">${totalEnrollments.toLocaleString()}</div>
      <div class="sub">across all portals</div>
    </div>
    <div class="stat">
      <div class="label">Est. MRR</div>
      <div class="value">$${mrr.toLocaleString()}</div>
      <div class="sub">USD / month</div>
    </div>
  </div>

  <div class="section">
    <div class="section-header">Installed Portals (${totalPortals})</div>
    ${portals.length === 0
      ? '<div class="empty">No portals have installed the app yet.</div>'
      : `<table>
        <thead>
          <tr>
            <th>Portal ID</th>
            <th>Domain</th>
            <th>Tier</th>
            <th>This Month</th>
            <th>Installed</th>
            <th>PayPal Sub</th>
            <th>Override</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`
    }
  </div>
</div>
</body>
</html>`);
});

// ── Tier override ─────────────────────────────────────────────────────────────

/**
 * POST /admin/set-tier
 * Override a portal's tier manually. Useful for grandfathered accounts,
 * refunds, or manual deals.
 */
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
