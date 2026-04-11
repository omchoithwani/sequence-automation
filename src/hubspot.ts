import axios from 'axios';
import { config } from './config';
import { getStoredToken, saveToken } from './db';

const HUBAPI = 'https://api.hubapi.com';

// ── Token management ──────────────────────────────────────────────────────────

/**
 * Returns a valid access token for the given portal, refreshing it if needed.
 * Throws if the portal has never installed the app.
 */
export async function getAccessToken(portalId: number): Promise<string> {
  const stored = getStoredToken(portalId);
  if (!stored) throw new Error(`Portal ${portalId} has not installed the app`);

  // Refresh proactively when fewer than 5 minutes remain
  if (stored.expiresAt - Date.now() < 5 * 60 * 1000) {
    const res = await axios.post(
      `${HUBAPI}/oauth/v1/token`,
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.hubspot.clientId,
        client_secret: config.hubspot.clientSecret,
        refresh_token: stored.refreshToken,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    saveToken(portalId, res.data.access_token, res.data.refresh_token, res.data.expires_in);
    return res.data.access_token as string;
  }

  return stored.accessToken;
}

// ── OAuth helpers ─────────────────────────────────────────────────────────────

/** Exchange an authorization code for tokens and return the portal ID. */
export async function exchangeCode(code: string): Promise<{
  portalId: number;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const tokenRes = await axios.post(
    `${HUBAPI}/oauth/v1/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.hubspot.clientId,
      client_secret: config.hubspot.clientSecret,
      redirect_uri: config.hubspot.redirectUri,
      code,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  // Inspect the token to find out which portal it belongs to
  const infoRes = await axios.get(`${HUBAPI}/oauth/v1/access-tokens/${tokenRes.data.access_token}`);

  return {
    portalId: infoRes.data.hub_id as number,
    accessToken: tokenRes.data.access_token as string,
    refreshToken: tokenRes.data.refresh_token as string,
    expiresIn: tokenRes.data.expires_in as number,
  };
}

// ── Sequences ─────────────────────────────────────────────────────────────────

export interface HubSpotSequence {
  id: string;
  name: string;
}

export async function getSequences(portalId: number): Promise<HubSpotSequence[]> {
  const token = await getAccessToken(portalId);
  const res = await axios.get(`${HUBAPI}/crm/v3/objects/sequences`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { properties: 'hs_name,hs_active', limit: 100 },
  });
  return (res.data.results as any[])
    .filter((s) => s.properties?.hs_active !== 'false')
    .map((s) => ({ id: s.id as string, name: (s.properties?.hs_name ?? `Sequence ${s.id}`) as string }));
}

// ── Users ─────────────────────────────────────────────────────────────────────

export interface HubSpotUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export async function getUsers(portalId: number): Promise<HubSpotUser[]> {
  const token = await getAccessToken(portalId);
  const res = await axios.get(`${HUBAPI}/settings/v3/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (res.data.results as any[]).map((u) => ({
    id: String(u.id),
    email: u.email as string,
    firstName: u.firstName as string | undefined,
    lastName: u.lastName as string | undefined,
  }));
}

/** Returns the email addresses associated with a specific user. */
export async function getUserEmails(portalId: number, userId: string): Promise<string[]> {
  const token = await getAccessToken(portalId);
  try {
    const res = await axios.get(`${HUBAPI}/settings/v3/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const email = res.data.email as string | undefined;
    return email ? [email] : [];
  } catch {
    return [];
  }
}

// ── Sequence enrollment ───────────────────────────────────────────────────────

/**
 * Enroll a contact into a sequence on behalf of a portal user.
 *
 * POST /automation/v4/sequences/enrollments
 * Requires the portal to have Sales Hub Starter+ and the user to have a
 * connected inbox in HubSpot.
 */
export async function enrollInSequence(
  portalId: number,
  contactId: string,
  sequenceId: string,
  userId: string,
  emailAddress: string
): Promise<void> {
  const token = await getAccessToken(portalId);
  await axios.post(
    `${HUBAPI}/automation/v4/sequences/enrollments`,
    {
      contactId,
      sequenceId,
      userId: parseInt(userId, 10),
      emailAddress,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );
}
