import 'dotenv/config';

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function intOr(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? '', 10);
  return isNaN(n) ? fallback : n;
}

export const config = {
  port: intOr(process.env.PORT, 3000),
  baseUrl: env('BASE_URL'),

  hubspot: {
    clientId: env('HUBSPOT_CLIENT_ID'),
    clientSecret: env('HUBSPOT_CLIENT_SECRET'),
    appId: env('HUBSPOT_APP_ID'),
    developerApiKey: env('HUBSPOT_DEVELOPER_API_KEY'),
    redirectUri: env('HUBSPOT_REDIRECT_URI'),
    scopes: [
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.objects.deals.read',
      'crm.objects.companies.read',
      'sales-email-read',
      'settings.users.read',
      'automation',
    ],
  },

  // PayPal credentials are optional at startup; validated when actually used
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID ?? '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET ?? '',
    webhookId: process.env.PAYPAL_WEBHOOK_ID ?? '',
    env: (process.env.PAYPAL_ENV ?? 'sandbox') as 'sandbox' | 'live',
    plans: {
      proMonthly: process.env.PAYPAL_PLAN_PRO_MONTHLY ?? '',
      proYearly: process.env.PAYPAL_PLAN_PRO_YEARLY ?? '',
      enterpriseMonthly: process.env.PAYPAL_PLAN_ENTERPRISE_MONTHLY ?? '',
      enterpriseYearly: process.env.PAYPAL_PLAN_ENTERPRISE_YEARLY ?? '',
    },
  },

  // USD prices; override via env vars
  pricing: {
    pro: {
      monthly: intOr(process.env.PRICE_PRO_MONTHLY, 49),
      yearly: intOr(process.env.PRICE_PRO_YEARLY, 490),
    },
    enterprise: {
      monthly: intOr(process.env.PRICE_ENTERPRISE_MONTHLY, 149),
      yearly: intOr(process.env.PRICE_ENTERPRISE_YEARLY, 1490),
    },
  },

  // Secret for the /admin panel
  adminSecret: process.env.ADMIN_SECRET ?? 'change-me-please',
};
