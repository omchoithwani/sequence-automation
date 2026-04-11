import { Router } from 'express';
import { config } from '../config';
import { exchangeCode } from '../hubspot';
import { saveToken } from '../db';

const router = Router();

/**
 * GET /auth/install
 * Redirect to HubSpot's OAuth authorization page.
 * Share this URL with anyone who needs to install the app on their portal.
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
 * Exchanges the code for tokens and persists them.
 */
router.get('/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error || !code) {
    res.status(400).send(`
      <!doctype html><html><body>
        <h2>Installation failed</h2>
        <p>${error_description ?? error ?? 'No authorization code received.'}</p>
      </body></html>
    `);
    return;
  }

  try {
    const { portalId, accessToken, refreshToken, expiresIn } = await exchangeCode(code as string);
    saveToken(portalId, accessToken, refreshToken, expiresIn);

    console.log(`[auth] Portal ${portalId} installed.`);

    res.send(`
      <!doctype html><html><body>
        <h2>App installed successfully!</h2>
        <p>Portal <strong>${portalId}</strong> is connected.</p>
        <p>You can now add the <strong>Enroll in Sequence</strong> and
           <strong>Random Branch</strong> actions inside any contact-based workflow.</p>
        <p><a href="https://app.hubspot.com">Return to HubSpot</a></p>
      </body></html>
    `);
  } catch (err: any) {
    console.error('[auth] OAuth callback error:', err?.response?.data ?? err.message);
    res.status(500).send(`
      <!doctype html><html><body>
        <h2>Installation error</h2>
        <p>Something went wrong. Please try again.</p>
      </body></html>
    `);
  }
});

export default router;
