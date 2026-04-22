import { Router } from 'express';
import { config } from '../config';
import { exchangeCode } from '../hubspot';
import { saveToken, savePortalInfo } from '../db';
import { TAILWIND_SETUP } from '../ui';

const router = Router();

router.get('/install', (_req, res) => {
  const params = new URLSearchParams({
    client_id: config.hubspot.clientId,
    redirect_uri: config.hubspot.redirectUri,
    scope: config.hubspot.scopes.join(' '),
  });
  res.redirect(`https://app.hubspot.com/oauth/authorize?${params}`);
});

router.get('/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error || !code) {
    res.status(400).send(`
      <!doctype html><html><body style="font-family:sans-serif;padding:40px">
        <h2>Installation failed</h2>
        <p>${error_description ?? error ?? 'No authorization code received.'}</p>
      </body></html>
    `);
    return;
  }

  try {
    const { portalId, hubDomain, accessToken, refreshToken, expiresIn } =
      await exchangeCode(code as string);

    await saveToken(portalId, accessToken, refreshToken, expiresIn);
    await savePortalInfo(portalId, hubDomain);

    console.log(`[auth] Portal ${portalId} (${hubDomain}) installed.`);
    res.redirect(`/auth/success?portalId=${portalId}`);
  } catch (err: any) {
    console.error('[auth] OAuth callback error:', err?.response?.data ?? err.message);
    res.status(500).send(`
      <!doctype html><html><body style="font-family:sans-serif;padding:40px">
        <h2>Installation error</h2>
        <p>Something went wrong. Please try again.</p>
      </body></html>
    `);
  }
});

router.get('/success', (req, res) => {
  const portalId = String(req.query.portalId ?? '');
  res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Flow Enroll - App Installed Successfully</title>
${TAILWIND_SETUP}
</head>
<body class="bg-background min-h-screen flex items-center p-6 antialiased flex-col justify-between">
<main class="w-full max-w-[420px] bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant p-[24px] flex flex-col items-center text-center relative overflow-hidden my-auto">
  <div class="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-tertiary-container/10 blur-[40px] rounded-full pointer-events-none"></div>
  <div class="relative z-10 mb-6 flex items-center justify-center w-16 h-16 rounded-full bg-tertiary-container/20 ring-4 ring-surface-container-lowest">
    <span class="material-symbols-outlined text-[32px] text-tertiary" style="font-variation-settings: 'FILL' 1;">check_circle</span>
  </div>
  <h1 class="font-h2 text-h2 text-on-surface mb-3 relative z-10">App installed successfully!</h1>
  <p class="font-body-base text-body-base text-on-surface-variant mb-8 relative z-10">
    Portal <span class="font-medium text-on-surface">${portalId}</span> is connected and authenticated. You can now use all three workflow actions in HubSpot.
  </p>
  <div class="flex flex-col gap-[16px] w-full relative z-10">
    <a href="https://app.hubspot.com" class="w-full inline-flex justify-center items-center gap-2 px-4 py-3 bg-primary hover:bg-primary-container text-on-primary font-button-text text-button-text rounded-lg transition-all duration-200 active:scale-[0.98] shadow-sm">
      Go to HubSpot
      <span class="material-symbols-outlined text-[18px]">open_in_new</span>
    </a>
    <a href="/dashboard?portalId=${portalId}" class="w-full inline-flex justify-center items-center px-4 py-3 bg-surface-container-lowest hover:bg-surface-container border border-outline-variant text-on-surface font-button-text text-button-text rounded-lg transition-colors duration-200">
      View My Dashboard
    </a>
    <a href="/pricing?portalId=${portalId}" class="w-full inline-flex justify-center items-center px-4 py-3 bg-surface-container-lowest hover:bg-surface-container border border-outline-variant text-on-surface font-button-text text-button-text rounded-lg transition-colors duration-200">
      View Pricing &amp; Upgrade
    </a>
  </div>
</main>
<footer class="w-full max-w-[420px] py-6 flex flex-col items-center gap-2">
  <div class="flex gap-4">
    <a class="font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-colors" href="#">Privacy Policy</a>
    <a class="font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-colors" href="#">Terms of Service</a>
    <a class="font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-colors" href="mailto:support@flowenroll.io">Support</a>
  </div>
  <p class="font-body-sm text-body-sm text-on-surface-variant/60">© 2026 Flow Enroll. All rights reserved.</p>
</footer>
</body>
</html>`);
});

export default router;
