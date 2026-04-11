# HubSpot Sequence Automation App

A free, self-hosted HubSpot **public app** that adds two custom workflow actions:

| Action | What it does |
|---|---|
| **Enroll in Sequence** | Enroll a contact into any sequence, choosing the sender user and email address — without Enterprise |
| **Random Branch** | Route contacts randomly to Branch A or B based on a configurable percentage split |

Both actions work inside any contact-based workflow on **Sales Hub Starter and above**.

---

## How it works

HubSpot natively limits workflow-based sequence enrollment to Enterprise plans.
This app bypasses that by registering **Custom Workflow Actions (CWA v4)** that
call your server, which then calls the HubSpot Sequences API on behalf of the
portal's connected user.  The same technique is used by apps on the HubSpot
Marketplace.

---

## Prerequisites

- A free [HubSpot developer account](https://developers.hubspot.com/)
- A HubSpot portal on **Sales Hub Starter** or above (sequences must be available)
- [Node.js 20+](https://nodejs.org/)
- A publicly reachable server (free options: [Fly.io](#deploy-to-flyio), ngrok for local dev)

---

## 1 · Create the HubSpot app

1. Go to [app.hubspot.com](https://app.hubspot.com) → Developer account → **Apps** → **Create app**.
2. Under **Auth**, set:
   - Redirect URL: `https://<your-domain>/auth/callback`
   - Scopes (required): `crm.objects.contacts.read`, `crm.objects.contacts.write`,
     `sales-email-read`, `settings.users.read`, `automation`
3. Save and note your **Client ID**, **Client secret**, and **App ID**.
4. Under your developer account settings, grab your **Developer API key**.

---

## 2 · Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in every value (see comments in the file).

---

## 3 · Local development with ngrok

```bash
npm install
npm run dev          # starts on port 3000

# In another terminal:
ngrok http 3000
```

Set `BASE_URL` and `HUBSPOT_REDIRECT_URI` in `.env` to the ngrok HTTPS URL, then:

```bash
npm run register-actions   # creates the CWA definitions in HubSpot (run once)
```

Open `http://localhost:3000/auth/install` in your browser to install the app on
your portal.

---

## 4 · Deploy to Fly.io

Fly.io's free tier includes persistent volume storage, which keeps the SQLite
token database alive across restarts.

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh
fly auth login

# Launch (use existing fly.toml, skip auto-deploy)
fly launch --no-deploy

# Create a 1 GB persistent volume for the SQLite database
fly volumes create data --size 1 --region iad

# Push all secrets from .env
fly secrets set \
  HUBSPOT_CLIENT_ID="..." \
  HUBSPOT_CLIENT_SECRET="..." \
  HUBSPOT_APP_ID="..." \
  HUBSPOT_DEVELOPER_API_KEY="..." \
  BASE_URL="https://<your-app>.fly.dev" \
  HUBSPOT_REDIRECT_URI="https://<your-app>.fly.dev/auth/callback"

fly deploy
```

After the first successful deploy, register the workflow actions once:

```bash
npm run register-actions
```

---

## 5 · Install the app on your portal

Browse to `https://<your-domain>/auth/install` and authorize the app on your
HubSpot portal.  You'll be redirected back to a confirmation page.

---

## 6 · Using the workflow actions

### Enroll in Sequence

1. Open a contact-based workflow in HubSpot.
2. Add an action → search for **"Enroll in Sequence"**.
3. Configure:
   - **Sequence** – pick from your active sequences
   - **Sender User** – which HubSpot user sends the sequence
   - **Sender Email** – their connected inbox email
4. Save. Contacts that reach this step will be enrolled automatically.

> The sender must have a connected inbox (Gmail/Outlook) in HubSpot.

### Random Branch

1. Add an action → search for **"Random Branch"**.
2. Set **Percentage for Branch A** (e.g. `50` for a 50/50 split).
3. After the action, add an **If/then branch**:
   - Branch condition: `Result (A or B)` **equals** `A` → Path A
   - All other contacts → Path B (or add a second branch for `B`)

---

## API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/auth/install` | Redirect to HubSpot OAuth |
| `GET` | `/auth/callback` | OAuth callback (saves token) |
| `POST` | `/webhook/enroll-sequence` | CWA webhook – enroll action |
| `POST` | `/webhook/random-branch` | CWA webhook – random branch |
| `POST` | `/options/sequences` | Dropdown: active sequences |
| `POST` | `/options/users` | Dropdown: portal users |
| `POST` | `/options/sender-emails` | Dropdown: emails for selected user |
| `GET` | `/health` | Health check |

---

## Security

- Webhook endpoints validate **HubSpot's HMAC-SHA256 v3 signature** and reject
  requests with a timestamp older than 5 minutes.
- OAuth tokens are stored in a local SQLite database (`data/tokens.db`).
  Keep the `data/` directory out of source control (already in `.gitignore`).
