import 'dotenv/config';

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  baseUrl: env('BASE_URL'),
  hubspot: {
    clientId: env('HUBSPOT_CLIENT_ID'),
    clientSecret: env('HUBSPOT_CLIENT_SECRET'),
    appId: env('HUBSPOT_APP_ID'),
    developerApiKey: env('HUBSPOT_DEVELOPER_API_KEY'),
    redirectUri: env('HUBSPOT_REDIRECT_URI'),
    // Scopes the app requests from each portal during OAuth install
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
};
