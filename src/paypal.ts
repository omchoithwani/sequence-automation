import axios from 'axios';
import { config } from './config';

function baseUrl(): string {
  return config.paypal.env === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

// ── OAuth token cache ─────────────────────────────────────────────────────────

let _token: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (_token && _token.expiresAt > Date.now()) return _token.value;

  if (!config.paypal.clientId || !config.paypal.clientSecret) {
    throw new Error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set');
  }

  const res = await axios.post(
    `${baseUrl()}/v1/oauth2/token`,
    'grant_type=client_credentials',
    {
      auth: { username: config.paypal.clientId, password: config.paypal.clientSecret },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );
  _token = { value: res.data.access_token, expiresAt: Date.now() + (res.data.expires_in - 60) * 1000 };
  return _token.value;
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ── Plans (used by setup-paypal script) ───────────────────────────────────────

export async function createProduct(name: string): Promise<string> {
  const token = await getToken();
  const res = await axios.post(
    `${baseUrl()}/v1/catalogs/products`,
    { name, type: 'SERVICE', category: 'SOFTWARE' },
    { headers: authHeader(token) }
  );
  return res.data.id as string;
}

export async function createPlan(productId: string, name: string, amountUsd: string, intervalUnit: 'MONTH' | 'YEAR'): Promise<string> {
  const token = await getToken();
  const res = await axios.post(
    `${baseUrl()}/v1/billing/plans`,
    {
      product_id: productId,
      name,
      status: 'ACTIVE',
      billing_cycles: [
        {
          frequency: { interval_unit: intervalUnit, interval_count: 1 },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0, // infinite
          pricing_scheme: { fixed_price: { value: amountUsd, currency_code: 'USD' } },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee: { value: '0', currency_code: 'USD' },
        setup_fee_failure_action: 'CONTINUE',
        payment_failure_threshold: 3,
      },
    },
    { headers: authHeader(token) }
  );
  return res.data.id as string;
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

export interface SubscriptionResult {
  id: string;
  approveUrl: string;
}

/**
 * Create a PayPal subscription and return its ID plus the approval URL to
 * redirect the user to.
 *
 * @param customId  Opaque string we get back in webhooks; use "{portalId}:{tier}:{cycle}"
 */
export async function createSubscription(
  planId: string,
  customId: string,
  returnUrl: string,
  cancelUrl: string
): Promise<SubscriptionResult> {
  const token = await getToken();
  const res = await axios.post(
    `${baseUrl()}/v1/billing/subscriptions`,
    {
      plan_id: planId,
      custom_id: customId,
      application_context: {
        return_url: returnUrl,
        cancel_url: cancelUrl,
        user_action: 'SUBSCRIBE_NOW',
        shipping_preference: 'NO_SHIPPING',
      },
    },
    { headers: { ...authHeader(token), Prefer: 'return=representation' } }
  );
  const approveUrl = (res.data.links as any[]).find((l) => l.rel === 'approve')?.href ?? '';
  return { id: res.data.id as string, approveUrl };
}

export async function getSubscription(subscriptionId: string): Promise<any> {
  const token = await getToken();
  const res = await axios.get(`${baseUrl()}/v1/billing/subscriptions/${subscriptionId}`, {
    headers: authHeader(token),
  });
  return res.data;
}

export async function cancelSubscription(subscriptionId: string, reason = 'Cancelled by user'): Promise<void> {
  const token = await getToken();
  await axios.post(
    `${baseUrl()}/v1/billing/subscriptions/${subscriptionId}/cancel`,
    { reason },
    { headers: authHeader(token) }
  );
}

// ── Webhook signature verification ───────────────────────────────────────────

/**
 * Ask PayPal's API to verify the webhook signature.
 * Returns true if verified (or if PAYPAL_WEBHOOK_ID is not set — disable in dev).
 */
export async function verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string): Promise<boolean> {
  if (!config.paypal.webhookId) {
    console.warn('[paypal] PAYPAL_WEBHOOK_ID not set — skipping webhook verification');
    return true;
  }
  try {
    const token = await getToken();
    const res = await axios.post(
      `${baseUrl()}/v1/notifications/verify-webhook-signature`,
      {
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: config.paypal.webhookId,
        webhook_event: JSON.parse(rawBody),
      },
      { headers: authHeader(token) }
    );
    return res.data.verification_status === 'SUCCESS';
  } catch (err: any) {
    console.error('[paypal] Webhook verification failed:', err?.response?.data ?? err.message);
    return false;
  }
}
