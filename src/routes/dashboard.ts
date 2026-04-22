import { Router, Request, Response } from 'express';
import { getSequenceCounts } from '../db';
import { getSequenceStatsMap } from '../hubspot';
import { TAILWIND_SETUP, WORDMARK_DARK, FOOTER } from '../ui';

const router = Router();

function statBadge(val: number | null): string {
  if (val === null || val === undefined) {
    return `<td class="py-4 px-6 text-center font-body-sm text-body-sm text-on-surface-variant">—</td>`;
  }
  const v = val * 100;
  const cls = v >= 50 ? 'bg-[#ecfdf5] text-[#065f46]' : v >= 25 ? 'bg-[#fef3c7] text-[#92400e]' : 'bg-[#fef2f2] text-[#991b1b]';
  return `<td class="py-4 px-6 text-center"><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}">${v.toFixed(1)}%</span></td>`;
}

function dotColor(openRate: number | null): string {
  if (openRate === null) return '#a0aec0';
  const v = openRate * 100;
  return v >= 50 ? '#10b981' : v >= 25 ? '#f59e0b' : '#ef4444';
}

router.get('/', async (req: Request, res: Response) => {
  const portalId = parseInt(req.query.portalId as string ?? '', 10);

  if (isNaN(portalId)) {
    res.send(`<!doctype html>
<html class="light" lang="en">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Dashboard — Flow Enroll</title>
${TAILWIND_SETUP}
</head>
<body class="bg-background min-h-screen flex items-center justify-center p-6 antialiased">
<div class="w-full max-w-[420px] bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-[24px] flex flex-col items-center text-center">
  <div class="mb-6 flex items-center justify-center w-16 h-16 rounded-full bg-primary-container/10">
    <span class="material-symbols-outlined text-[32px] text-primary-container">insert_chart</span>
  </div>
  <h1 class="font-h2 text-h2 text-on-surface mb-3">Sequence Dashboard</h1>
  <p class="font-body-base text-body-base text-on-surface-variant mb-8">
    Enter your HubSpot portal ID to view your sequence performance.
  </p>
  <form action="/dashboard" method="GET" class="w-full flex flex-col gap-4">
    <input
      type="number" name="portalId"
      placeholder="Portal ID (e.g. 12345678)"
      required autofocus
      class="w-full px-4 py-3 border border-outline-variant rounded-lg font-body-base text-body-base bg-white focus:outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 transition-all"
    />
    <button type="submit" class="w-full bg-primary-container text-white px-4 py-3 rounded-lg font-button-text text-button-text hover:opacity-90 transition-opacity shadow-sm">
      View Dashboard
    </button>
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
      const dot = dotColor(s?.openRate ?? null);
      return `
      <tr class="hover:bg-surface-container-lowest/80 transition-colors">
        <td class="py-4 px-6 font-medium text-on-background">
          <div class="flex items-center gap-3">
            <div class="w-2 h-2 rounded-full flex-shrink-0" style="background:${dot}"></div>
            ${name}
          </div>
        </td>
        <td class="py-4 px-6 text-right font-body-sm text-body-sm">${r.thisMonth.toLocaleString()}</td>
        <td class="py-4 px-6 text-right font-body-sm text-body-sm">${r.allTime.toLocaleString()}</td>
        ${statBadge(s?.openRate ?? null)}
        ${statBadge(s?.clickRate ?? null)}
        ${statBadge(s?.replyRate ?? null)}
        ${statBadge(s?.meetingRate ?? null)}
      </tr>`;
    }).join('');

    const emptyState = `
    <tr>
      <td colspan="7" class="py-16 text-center font-body-base text-body-base text-on-surface-variant">
        No enrollments tracked yet. Enroll contacts via a workflow to see data here.
      </td>
    </tr>`;

    res.send(`<!doctype html>
<html class="light" lang="en">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Flow Enroll Portal Dashboard</title>
${TAILWIND_SETUP}
</head>
<body class="bg-background text-on-background min-h-screen flex flex-col">
<header class="bg-[#1a202c] sticky top-0 z-50 shadow-sm border-b border-slate-800">
  <div class="flex justify-between items-center w-full px-8 h-16 max-w-[1280px] mx-auto">
    <div class="flex items-center gap-8">
      ${WORDMARK_DARK}
      <nav class="hidden md:flex gap-6 font-['Inter'] text-sm font-medium tracking-tight">
        <a class="text-white opacity-100 border-b-2 border-[#ff7a59] pb-1 hover:text-white transition-all duration-200" href="/dashboard?portalId=${portalId}">Dashboard</a>
      </nav>
    </div>
    <div class="flex items-center gap-4 font-['Inter'] text-sm font-medium tracking-tight">
      <a class="text-white opacity-70 hover:opacity-100 hover:text-white transition-all duration-200" href="mailto:support@flowenroll.io">Support</a>
    </div>
  </div>
</header>
<main class="flex-grow w-full max-w-[1280px] mx-auto px-4 md:px-8 py-8 flex flex-col gap-8">
  <!-- Header -->
  <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
    <div>
      <h1 class="font-h1 text-h1 text-on-background">Sequence Dashboard</h1>
      <p class="font-body-base text-body-base text-on-surface-variant">Portal ${portalId}</p>
    </div>
    <div class="flex gap-4">
      <a href="https://app.hubspot.com" class="bg-surface-container-lowest border border-outline-variant text-on-surface px-4 py-2 rounded-lg font-button-text text-button-text hover:bg-surface-container transition-colors shadow-sm">HubSpot</a>
      <a href="/pricing?portalId=${portalId}" class="bg-primary-container text-white px-4 py-2 rounded-lg font-button-text text-button-text hover:opacity-90 transition-opacity shadow-sm">Upgrade</a>
    </div>
  </div>
  <!-- Warning Banner -->
  <div class="bg-[#fef3c7] border border-[#f5d0fe] rounded-lg p-4 flex items-start gap-3 shadow-sm">
    <span class="material-symbols-outlined text-[#d97706] mt-0.5">warning</span>
    <div>
      <p class="font-body-base text-body-base text-[#92400e] font-medium">Live Data Notice</p>
      <p class="font-body-sm text-body-sm text-[#92400e] opacity-90 mt-1">Open, click, reply and meeting rates are fetched live from your connected CRM. Depending on volume, this may take a few moments to fully populate.</p>
    </div>
  </div>
  <!-- Stats Grid -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <div class="bg-surface-container-lowest rounded-xl p-card-padding border border-outline-variant shadow-sm relative overflow-hidden group">
      <div class="absolute -right-6 -top-6 w-24 h-24 bg-primary-container/10 rounded-full blur-2xl group-hover:bg-primary-container/20 transition-all"></div>
      <div class="flex justify-between items-start mb-4 relative z-10">
        <h3 class="font-label-caps text-label-caps text-on-surface-variant uppercase">Enrollments This Month</h3>
        <span class="material-symbols-outlined text-primary-container bg-primary-container/10 p-1.5 rounded-lg">trending_up</span>
      </div>
      <div class="relative z-10">
        <p class="font-h1 text-h1 text-on-background">${totalThisMonth.toLocaleString()}</p>
        <p class="font-body-sm text-body-sm text-secondary mt-1">via this app</p>
      </div>
    </div>
    <div class="bg-surface-container-lowest rounded-xl p-card-padding border border-outline-variant shadow-sm relative overflow-hidden group">
      <div class="absolute -right-6 -top-6 w-24 h-24 bg-tertiary-container/10 rounded-full blur-2xl group-hover:bg-tertiary-container/20 transition-all"></div>
      <div class="flex justify-between items-start mb-4 relative z-10">
        <h3 class="font-label-caps text-label-caps text-on-surface-variant uppercase">Enrollments All Time</h3>
        <span class="material-symbols-outlined text-tertiary-container bg-tertiary-container/10 p-1.5 rounded-lg">database</span>
      </div>
      <div class="relative z-10">
        <p class="font-h1 text-h1 text-on-background">${totalAllTime.toLocaleString()}</p>
        <p class="font-body-sm text-body-sm text-secondary mt-1">via this app</p>
      </div>
    </div>
    <div class="bg-surface-container-lowest rounded-xl p-card-padding border border-outline-variant shadow-sm relative overflow-hidden group">
      <div class="absolute -right-6 -top-6 w-24 h-24 bg-[#3b82f6]/10 rounded-full blur-2xl group-hover:bg-[#3b82f6]/20 transition-all"></div>
      <div class="flex justify-between items-start mb-4 relative z-10">
        <h3 class="font-label-caps text-label-caps text-on-surface-variant uppercase">Active Sequences</h3>
        <span class="material-symbols-outlined text-[#3b82f6] bg-[#3b82f6]/10 p-1.5 rounded-lg">all_inbox</span>
      </div>
      <div class="relative z-10">
        <p class="font-h1 text-h1 text-on-background">${usageRows.length}</p>
        <p class="font-body-sm text-body-sm text-secondary mt-1">enrolled via this app</p>
      </div>
    </div>
  </div>
  <!-- Performance Table -->
  <div class="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
    <div class="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-bright">
      <h2 class="font-h2 text-h2 text-on-background">Sequence Performance</h2>
      <span class="font-body-sm text-body-sm text-on-surface-variant">Enrollment counts tracked by this app · Rates fetched live from HubSpot</span>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="border-b border-outline-variant bg-surface-container-highest/30">
            <th class="py-4 px-6 font-label-caps text-label-caps text-on-surface-variant uppercase">Sequence Name</th>
            <th class="py-4 px-6 font-label-caps text-label-caps text-on-surface-variant uppercase text-right">This Month</th>
            <th class="py-4 px-6 font-label-caps text-label-caps text-on-surface-variant uppercase text-right">All Time</th>
            <th class="py-4 px-6 font-label-caps text-label-caps text-on-surface-variant uppercase text-center">Open Rate</th>
            <th class="py-4 px-6 font-label-caps text-label-caps text-on-surface-variant uppercase text-center">Click Rate</th>
            <th class="py-4 px-6 font-label-caps text-label-caps text-on-surface-variant uppercase text-center">Reply Rate</th>
            <th class="py-4 px-6 font-label-caps text-label-caps text-on-surface-variant uppercase text-center">Meeting Rate</th>
          </tr>
        </thead>
        <tbody class="font-body-sm text-body-sm text-on-background divide-y divide-outline-variant/50">
          ${usageRows.length === 0 ? emptyState : rows}
        </tbody>
      </table>
    </div>
    <div class="p-4 border-t border-outline-variant bg-surface-bright flex justify-between items-center font-body-sm text-body-sm text-on-surface-variant">
      <span>Showing ${usageRows.length} sequence${usageRows.length !== 1 ? 's' : ''}</span>
    </div>
  </div>
</main>
${FOOTER}
</body>
</html>`);
  } catch (err: any) {
    console.error('[dashboard]', err?.response?.data ?? err.message);
    res.status(500).send('Failed to load dashboard. Please try again.');
  }
});

export default router;
