import { Router } from 'express';
import { config } from '../config';
import { exchangeCode } from '../hubspot';
import { saveToken, savePortalInfo } from '../db';

const router = Router();

/**
 * GET /auth/install
 * Redirect to HubSpot's OAuth authorization page.
 * Share this URL (or the homepage /) with anyone who needs to install the app.
 */
router.get('/install', (_req, res) => {
  const params = new URLSearchParams({
    client_id: config.hubspot.clientId,
    redirect_uri: config.hubspot.redirectUri,
    scope: config.hubspot.scopes.join(' '),
  });
  res.redirect(`https://app.hubspot.com/oauth/authorize?${params}`);
});

/**
 * GET /auth/callback
 * HubSpot redirects here after the user authorizes the app.
 * Saves the tokens then redirects to the pricing page so the user can choose
 * (or upgrade to) a plan.
 */
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

/**
 * GET /auth/success
 * Shown after a successful OAuth install. No install button — breaks the loop.
 */
router.get('/success', (req, res) => {
  const portalId = String(req.query.portalId ?? '');
  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Installed — HubSpot Sequence Automation</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f7f8fa;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .box{background:#fff;border-radius:12px;padding:48px 40px;max-width:480px;width:100%;text-align:center;box-shadow:0 2px 16px rgba(0,0,0,.08)}
    .icon{font-size:3rem;margin-bottom:16px}
    h2{font-size:1.6rem;font-weight:700;margin-bottom:12px;color:#1a202c}
    p{color:#718096;line-height:1.6;margin-bottom:28px}
    .actions{display:flex;flex-direction:column;gap:12px}
    a{display:inline-block;padding:13px 28px;border-radius:7px;text-decoration:none;font-weight:600;font-size:.95rem}
    .btn-primary{background:#ff7a59;color:#fff}
    .btn-primary:hover{background:#f56444}
    .btn-outline{background:#fff;color:#4a5568;border:1px solid #e2e8f0}
    .btn-outline:hover{background:#f7f8fa}
  </style>
</head>
<body>
  <div class="box">
    <div class="icon">✅</div>
    <h2>App installed successfully!</h2>
    <p>Portal <strong>${portalId}</strong> is connected. You can now use the Enroll in Sequence, Unenroll from Sequence, and Random Branch actions in any HubSpot workflow.</p>
    <div class="actions">
      <a href="https://app.hubspot.com" class="btn-primary">Go to HubSpot</a>
      <a href="/dashboard?portalId=${portalId}" class="btn-outline">View my dashboard</a>
      <a href="/pricing?portalId=${portalId}" class="btn-outline">View pricing &amp; upgrade</a>
    </div>
  </div>
</body>
</html>`);
});

export default router;
