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

    saveToken(portalId, accessToken, refreshToken, expiresIn);
    savePortalInfo(portalId, hubDomain);

    console.log(`[auth] Portal ${portalId} (${hubDomain}) installed.`);

    // Redirect to the pricing page so the user can pick a plan
    res.redirect(`/pricing?portalId=${portalId}&installed=1`);
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

export default router;
