import { Router, Request, Response } from 'express';
import { getSequenceCounts } from '../db';
import { getSequenceStatsMap } from '../hubspot';

const router = Router();

function pct(val: number | null): string {
  if (val === null || val === undefined) return '—';
  return (val * 100).toFixed(1) + '%';
}

function statCell(val: number | null): string {
  if (val === null || val === undefined) return '<td style="color:#a0aec0;text-align:center">—</td>';
  const v = val * 100;
  const color = v >= 50 ? '#276749' : v >= 25 ? '#744210' : '#742a2a';
  const bg    = v >= 50 ? '#c6f6d5' : v >= 25 ? '#fefcbf' : '#fff5f5';
  return `<td style="text-align:center"><span style="background:${bg};color:${color};padding:2px 8px;border-radius:12px;font-size:.8rem;font-weight:600">${v.toFixed(1)}%</span></td>`;
}

/**
 * GET /dashboard?portalId=X
 * Per-portal sequence performance dashboard.
 */
router.get('/', async (req: Request, res: Response) => {
  const portalId = parseInt(req.query.portalId as string ?? '', 10);

  // No portalId — show an entry form
  if (isNaN(portalId)) {
    res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Dashboard — Flow Enroll</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f7f8fa;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .box{background:#fff;border-radius:12px;padding:48px 40px;max-width:420px;width:100%;box-shadow:0 2px 16px rgba(0,0,0,.08);text-align:center}
    h2{font-size:1.4rem;font-weight:700;margin-bottom:8px;color:#1a202c}
    p{color:#718096;font-size:.9rem;margin-bottom:28px}
    input{width:100%;padding:11px 14px;border:1px solid #e2e8f0;border-radius:7px;font-size:1rem;margin-bottom:12px}
    button{width:100%;padding:12px;background:#ff7a59;color:#fff;border:none;border-radius:7px;font-size:1rem;font-weight:600;cursor:pointer}
    button:hover{background:#f56444}
  </style>
</head>
<body>
  <div class="box">
    <h2>Sequence Dashboard</h2>
    <p>Enter your HubSpot portal ID to view your sequence performance.</p>
    <form action="/dashboard" method="GET">
      <input type="number" name="portalId" placeholder="Portal ID (e.g. 12345678)" required autofocus>
      <button type="submit">View Dashboard</button>
    </form>
  </div>
</body>
</html>`);
    return;
  }

  try {
    const [usageRows, statsMap] = await Promise.all([
      getSequenceCounts(portalId),
      getSequenceStatsMap(portalId).catch(() => new Map()),
    ]);

    const totalThisMonth = usageRows.reduce((s, r) => s + r.thisMonth, 0);
    const totalAllTime   = usageRows.reduce((s, r) => s + r.allTime, 0);

    const rows = usageRows.map((r) => {
      const s = statsMap.get(r.sequenceId);
      const name = s?.name ?? `Sequence ${r.sequenceId}`;
      return `
      <tr>
        <td style="font-weight:500">${name}</td>
        <td style="text-align:center;font-weight:600;color:#2d3748">${r.thisMonth.toLocaleString()}</td>
        <td style="text-align:center;color:#718096">${r.allTime.toLocaleString()}</td>
        ${statCell(s?.openRate ?? null)}
        ${statCell(s?.clickRate ?? null)}
        ${statCell(s?.replyRate ?? null)}
        ${statCell(s?.meetingRate ?? null)}
      </tr>`;
    }).join('');

    const statsNote = statsMap.size > 0 && [...statsMap.values()].some(s => s.openRate !== null)
      ? ''
      : `<div style="background:#fffbeb;border:1px solid #f6e05e;border-radius:8px;padding:12px 16px;font-size:.83rem;color:#744210;margin-bottom:24px">
          Open, click, reply and meeting rates are fetched live from HubSpot. If they show — your HubSpot plan may not expose these stats via API.
         </div>`;

    res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Dashboard — Flow Enroll</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f7f8fa;color:#1a202c}
    header{background:#1a202c;color:#fff;padding:16px 32px;display:flex;align-items:center;justify-content:space-between}
    header h1{font-size:1.1rem;font-weight:600}
    header a{color:#a0aec0;font-size:.85rem;text-decoration:none}
    header a:hover{color:#fff}
    .wrap{max-width:1100px;margin:0 auto;padding:32px 24px}
    .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:32px}
    .stat{background:#fff;border-radius:10px;padding:20px 24px;border:1px solid #e2e8f0}
    .stat .label{font-size:.78rem;color:#718096;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
    .stat .value{font-size:2rem;font-weight:700;color:#1a202c}
    .stat .sub{font-size:.78rem;color:#a0aec0;margin-top:2px}
    .section{background:#fff;border-radius:10px;border:1px solid #e2e8f0;overflow:hidden}
    .section-header{padding:16px 24px;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:.95rem;display:flex;align-items:center;justify-content:space-between}
    .section-header span{font-size:.8rem;color:#a0aec0;font-weight:400}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;padding:10px 16px;font-size:.75rem;color:#718096;text-transform:uppercase;letter-spacing:.04em;background:#f7f8fa;border-bottom:1px solid #e2e8f0}
    th.center{text-align:center}
    td{padding:13px 16px;border-bottom:1px solid #f0f0f0;font-size:.87rem;vertical-align:middle}
    tr:last-child td{border-bottom:none}
    tr:hover td{background:#fafafa}
    .empty{padding:48px;text-align:center;color:#a0aec0;font-size:.9rem}
    @media(max-width:700px){.cards{grid-template-columns:1fr}}
  </style>
</head>
<body>
<header>
  <h1>Sequence Dashboard — Portal ${portalId}</h1>
  <div style="display:flex;gap:20px">
    <a href="https://app.hubspot.com">HubSpot ↗</a>
    <a href="/pricing?portalId=${portalId}">Upgrade plan</a>
  </div>
</header>
<div class="wrap">
  <div class="cards">
    <div class="stat">
      <div class="label">Enrollments This Month</div>
      <div class="value">${totalThisMonth.toLocaleString()}</div>
      <div class="sub">via this app</div>
    </div>
    <div class="stat">
      <div class="label">Enrollments All Time</div>
      <div class="value">${totalAllTime.toLocaleString()}</div>
      <div class="sub">via this app</div>
    </div>
    <div class="stat">
      <div class="label">Active Sequences</div>
      <div class="value">${usageRows.length}</div>
      <div class="sub">enrolled via this app</div>
    </div>
  </div>

  ${statsNote}

  <div class="section">
    <div class="section-header">
      Sequence Performance
      <span>Enrollment counts tracked by this app · Rates fetched live from HubSpot</span>
    </div>
    ${usageRows.length === 0
      ? '<div class="empty">No enrollments tracked yet. Enroll contacts via a workflow to see data here.</div>'
      : `<table>
        <thead>
          <tr>
            <th>Sequence</th>
            <th class="center">This Month</th>
            <th class="center">All Time</th>
            <th class="center">Open Rate</th>
            <th class="center">Click Rate</th>
            <th class="center">Reply Rate</th>
            <th class="center">Meeting Rate</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`
    }
  </div>
</div>
</body>
</html>`);
  } catch (err: any) {
    console.error('[dashboard]', err?.response?.data ?? err.message);
    res.status(500).send('Failed to load dashboard. Please try again.');
  }
});

export default router;
