import express from 'express';
import { config } from './config';
import authRoutes from './routes/auth';
import webhookRoutes from './routes/webhook';
import optionsRoutes from './routes/options';
import { validateHubSpotSignature } from './middleware/signature';

const app = express();

// Capture raw body buffer alongside parsed JSON so the signature middleware
// can compute HMAC over the original bytes.
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// ── Routes ────────────────────────────────────────────────────────────────────

// OAuth install + callback
app.use('/auth', authRoutes);

// CWA webhooks – validate HubSpot's HMAC signature before processing
app.use('/webhook', validateHubSpotSignature, webhookRoutes);

// Dynamic dropdown options – called from HubSpot's workflow editor UI
// (no HMAC signature on these requests; we verify the portal has a token instead)
app.use('/options', optionsRoutes);

// Health check for load balancers / uptime monitors
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
  console.log(`Install URL → ${config.baseUrl}/auth/install`);
});
