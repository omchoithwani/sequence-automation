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

// Public landing page – shareable install link for you and your clients
app.get('/', (_req, res) => {
  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>HubSpot Sequence Automation</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f7f8fa;color:#1a202c;line-height:1.6}
    .wrap{max-width:760px;margin:72px auto;padding:0 24px}
    h1{font-size:2rem;font-weight:700;margin-bottom:12px}
    .sub{color:#718096;font-size:1.05rem;margin-bottom:40px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:44px}
    .card{background:#fff;border-radius:10px;padding:22px 24px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
    .card h3{font-size:.95rem;font-weight:600;margin-bottom:6px}
    .card p{font-size:.85rem;color:#718096}
    .badge{display:inline-block;font-size:.7rem;font-weight:600;background:#ebf8ff;color:#2b6cb0;border-radius:4px;padding:2px 7px;margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em}
    .btn{display:inline-block;background:#ff7a59;color:#fff;padding:14px 36px;border-radius:7px;text-decoration:none;font-weight:600;font-size:1rem}
    .btn:hover{background:#f56444}
    .note{margin-top:28px;font-size:.82rem;color:#a0aec0;text-align:center}
    @media(max-width:540px){.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>HubSpot Sequence Automation</h1>
    <p class="sub">Two custom workflow actions that unlock sequence enrollment and A/B branching — without needing Enterprise.</p>
    <div class="grid">
      <div class="card">
        <div class="badge">Contact · Deal · Company</div>
        <h3>Enroll in Sequence</h3>
        <p>Enroll a contact into any sequence directly, or traverse deal and company associations with optional label filtering. Choose the sender and email address.</p>
      </div>
      <div class="card">
        <div class="badge">Contact · Deal · Company</div>
        <h3>Random Branch</h3>
        <p>Route contacts randomly to Branch A or B based on a percentage you configure — perfect for A/B testing messaging or timing in workflows.</p>
      </div>
    </div>
    <a href="/auth/install" class="btn">Install on HubSpot</a>
    <p class="note">Requires Sales Hub Starter or above for sequences.</p>
  </div>
</body>
</html>`);
});

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
