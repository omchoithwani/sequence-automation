import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';

/**
 * Validates the HubSpot v3 request signature on incoming webhook calls.
 * HubSpot computes: HMAC-SHA256( clientSecret, METHOD + URL + rawBody + timestamp )
 * and sends it base64-encoded in X-HubSpot-Signature-v3.
 *
 * We also reject requests with timestamps older than 5 minutes to prevent replays.
 */
export function validateHubSpotSignature(req: Request, res: Response, next: NextFunction): void {
  const signature = req.headers['x-hubspot-signature-v3'] as string | undefined;
  const timestamp = req.headers['x-hubspot-request-timestamp'] as string | undefined;

  if (!signature || !timestamp) {
    res.status(401).json({ error: 'Missing HubSpot signature headers' });
    return;
  }

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Date.now() - ts > 5 * 60 * 1000) {
    res.status(401).json({ error: 'Request timestamp expired' });
    return;
  }

  const rawBody: Buffer = (req as any).rawBody ?? Buffer.alloc(0);
  const url = `${config.baseUrl}${req.originalUrl}`;
  const sourceString = `${req.method}${url}${rawBody.toString()}${timestamp}`;

  const expected = crypto
    .createHmac('sha256', config.hubspot.clientSecret)
    .update(sourceString)
    .digest('base64');

  if (expected !== signature) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  next();
}
