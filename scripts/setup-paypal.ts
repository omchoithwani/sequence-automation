/**
 * setup-paypal.ts
 *
 * One-time setup: creates the HubSpot Sequence Automation product and
 * four billing plans (Pro Monthly, Pro Yearly, Enterprise Monthly, Enterprise Yearly)
 * in your PayPal account.
 *
 * Run: npm run setup-paypal
 *
 * Then copy the printed Plan IDs into your .env file:
 *   PAYPAL_PLAN_PRO_MONTHLY=P-XXXXXXXX
 *   PAYPAL_PLAN_PRO_YEARLY=P-XXXXXXXX
 *   PAYPAL_PLAN_ENTERPRISE_MONTHLY=P-XXXXXXXX
 *   PAYPAL_PLAN_ENTERPRISE_YEARLY=P-XXXXXXXX
 */

import 'dotenv/config';
import { createProduct, createPlan } from '../src/paypal';

const pricing = {
  pro: {
    monthly: parseInt(process.env.PRICE_PRO_MONTHLY ?? '49', 10),
    yearly:  parseInt(process.env.PRICE_PRO_YEARLY  ?? '490', 10),
  },
  enterprise: {
    monthly: parseInt(process.env.PRICE_ENTERPRISE_MONTHLY ?? '149', 10),
    yearly:  parseInt(process.env.PRICE_ENTERPRISE_YEARLY  ?? '1490', 10),
  },
};

async function main() {
  const env = process.env.PAYPAL_ENV ?? 'sandbox';
  console.log(`\nCreating PayPal plans (env: ${env})\n`);

  console.log('Creating product…');
  const productId = await createProduct('HubSpot Sequence Automation');
  console.log(`  Product ID: ${productId}\n`);

  const plans = [
    { name: 'Pro Monthly',          amount: pricing.pro.monthly.toFixed(2),        interval: 'MONTH' as const, envVar: 'PAYPAL_PLAN_PRO_MONTHLY' },
    { name: 'Pro Yearly',           amount: pricing.pro.yearly.toFixed(2),          interval: 'YEAR'  as const, envVar: 'PAYPAL_PLAN_PRO_YEARLY' },
    { name: 'Enterprise Monthly',   amount: pricing.enterprise.monthly.toFixed(2),  interval: 'MONTH' as const, envVar: 'PAYPAL_PLAN_ENTERPRISE_MONTHLY' },
    { name: 'Enterprise Yearly',    amount: pricing.enterprise.yearly.toFixed(2),   interval: 'YEAR'  as const, envVar: 'PAYPAL_PLAN_ENTERPRISE_YEARLY' },
  ];

  const results: { envVar: string; planId: string }[] = [];

  for (const plan of plans) {
    console.log(`Creating "${plan.name}" plan ($${plan.amount} / ${plan.interval})…`);
    const planId = await createPlan(productId, plan.name, plan.amount, plan.interval);
    console.log(`  Plan ID: ${planId}`);
    results.push({ envVar: plan.envVar, planId });
  }

  console.log('\n─── Add these to your .env file ───────────────────────────────────');
  for (const { envVar, planId } of results) {
    console.log(`${envVar}=${planId}`);
  }
  console.log('────────────────────────────────────────────────────────────────────\n');
  console.log('Next: register a PayPal webhook at developer.paypal.com pointing to:');
  console.log(`  ${process.env.BASE_URL ?? 'https://your-app.fly.dev'}/paypal/webhook`);
  console.log('Subscribe to: BILLING.SUBSCRIPTION.ACTIVATED, BILLING.SUBSCRIPTION.CANCELLED,');
  console.log('              BILLING.SUBSCRIPTION.EXPIRED, BILLING.SUBSCRIPTION.SUSPENDED,');
  console.log('              BILLING.SUBSCRIPTION.RE_ACTIVATED');
  console.log('Then set PAYPAL_WEBHOOK_ID=<webhook_id_from_paypal> in your .env\n');
}

main().catch((err) => {
  console.error('Error:', err?.response?.data ?? err.message);
  process.exit(1);
});
