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
  const stored = await getStoredToken(portalId);
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
    await saveToken(portalId, res.data.access_token, res.data.refresh_token, res.data.expires_in);
    return res.data.access_token as string;
  }

  return stored.accessToken;
}

// ── OAuth helpers ─────────────────────────────────────────────────────────────

/** Exchange an authorization code for tokens and return the portal ID + hub domain. */
export async function exchangeCode(code: string): Promise<{
  portalId: number;
  hubDomain: string;
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
    hubDomain: (infoRes.data.hub_domain ?? '') as string,
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
  const res = await axios.get(`${HUBAPI}/automation/v4/sequences`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { limit: 100 },
  });
  return (res.data.results as any[])
    .filter((s) => s.status !== 'INACTIVE' && s.status !== 'DELETED')
    .map((s) => ({
      id: String(s.id),
      name: (s.name ?? s.label ?? `Sequence ${s.id}`) as string,
    }));
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

// ── Associations ─────────────────────────────────────────────────────────────

const OBJECT_PATH: Record<string, string> = {
  CONTACT: 'contacts',
  DEAL: 'deals',
  COMPANY: 'companies',
};

export interface AssociationLabel {
  category: string;
  typeId: number;
  label: string | null;
}

/**
 * Fetch all contact IDs associated with a deal or company.
 *
 * @param labelFilter
 *   - undefined | "__all__"  → every associated contact
 *   - "__none__"             → only contacts linked via the standard (unlabelled) association
 *   - any other string       → only contacts where at least one association type has that label
 */
export async function getAssociatedContacts(
  portalId: number,
  fromObjectType: string,
  objectId: string,
  labelFilter?: string
): Promise<string[]> {
  const token = await getAccessToken(portalId);
  const fromPath = OBJECT_PATH[fromObjectType] ?? fromObjectType.toLowerCase();
  const contactIds: string[] = [];
  let after: string | undefined;

  do {
    const res = await axios.get(
      `${HUBAPI}/crm/v4/objects/${fromPath}/${objectId}/associations/contacts`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 500, ...(after ? { after } : {}) },
      }
    );

    for (const result of (res.data.results ?? []) as any[]) {
      const types: any[] = result.associationTypes ?? [];
      const include =
        !labelFilter || labelFilter === '__all__'
          ? true
          : labelFilter === '__none__'
          ? types.some((t) => t.label === null)
          : types.some((t) => t.label === labelFilter);

      if (include) contactIds.push(String(result.toObjectId));
    }

    after = res.data.paging?.next?.after;
  } while (after);

  return contactIds;
}

/** Fetch all defined association labels between an object type and contacts. */
export async function getAssociationLabels(
  portalId: number,
  fromObjectType: string
): Promise<AssociationLabel[]> {
  const token = await getAccessToken(portalId);
  const fromPath = OBJECT_PATH[fromObjectType] ?? fromObjectType.toLowerCase();
  const res = await axios.get(
    `${HUBAPI}/crm/v4/associations/${fromPath}/contacts/labels`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return (res.data.results ?? []) as AssociationLabel[];
}

// ── Sequence enrollment & unenrollment ───────────────────────────────────────

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

export interface SequenceEnrollment {
  id: string;
  sequenceId: string;
  contactId: string;
  status: string;
}

/**
 * Get a contact's active sequence enrollments.
 *
 * GET /automation/v4/sequences/enrollments?contactId={id}
 * Filters to ACTIVE status client-side; returns an empty array if the
 * endpoint is unavailable (graceful fallback).
 */
export async function getActiveEnrollments(
  portalId: number,
  contactId: string
): Promise<SequenceEnrollment[]> {
  const token = await getAccessToken(portalId);
  try {
    const res = await axios.get(`${HUBAPI}/automation/v4/sequences/enrollments`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { contactId },
    });
    const all: any[] = res.data.results ?? [];
    return all
      .filter((e) => e.status === 'ACTIVE' || e.state === 'ACTIVE')
      .map((e) => ({
        id: String(e.id),
        sequenceId: String(e.sequenceId ?? e.sequence_id),
        contactId: String(e.contactId ?? e.contact_id ?? contactId),
        status: String(e.status ?? e.state),
      }));
  } catch {
    return [];
  }
}

/**
 * Unenroll a contact from one specific sequence or from all active sequences.
 *
 * @param sequenceId  If provided (and not "__all__"), only that sequence is
 *                    unenrolled. Otherwise all active enrollments are cancelled.
 * @returns           Number of enrollments cancelled.
 */
export async function unenrollFromSequence(
  portalId: number,
  contactId: string,
  sequenceId?: string
): Promise<number> {
  const token = await getAccessToken(portalId);
  const enrollments = await getActiveEnrollments(portalId, contactId);

  const targets =
    !sequenceId || sequenceId === '__all__'
      ? enrollments
      : enrollments.filter((e) => e.sequenceId === sequenceId);

  if (targets.length === 0) return 0;

  await Promise.allSettled(
    targets.map((e) =>
      axios.delete(`${HUBAPI}/automation/v4/sequences/enrollments/${e.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    )
  );

  return targets.length;
}
