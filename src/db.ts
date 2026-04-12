import { createClient, Client } from '@libsql/client';
import { mkdirSync } from 'fs';
import { join } from 'path';

// ── Client factory ────────────────────────────────────────────────────────────

let _db: Client | null = null;

function getDb(): Client {
  if (!_db) {
    const tursoUrl = process.env.TURSO_DATABASE_URL;
    if (tursoUrl) {
      _db = createClient({
        url: tursoUrl,
        authToken: process.env.TURSO_AUTH_TOKEN,
      });
    } else {
      const dataDir = join(process.cwd(), 'data');
      mkdirSync(dataDir, { recursive: true });
      _db = createClient({ url: `file:${join(dataDir, 'tokens.db')}` });
    }
  }
  return _db;
}

// ── Schema bootstrap ──────────────────────────────────────────────────────────

export async function initDb(): Promise<void> {
  const db = getDb();
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS portal_tokens (
        portal_id     INTEGER PRIMARY KEY,
        access_token  TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at    INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS portal_info (
        portal_id    INTEGER PRIMARY KEY,
        hub_domain   TEXT,
        installed_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`,
      `CREATE TABLE IF NOT EXISTS portal_subscriptions (
        portal_id              INTEGER PRIMARY KEY,
        tier                   TEXT NOT NULL DEFAULT 'FREE',
        billing_cycle          TEXT,
        paypal_subscription_id TEXT,
        period_end_at          INTEGER,
        status                 TEXT NOT NULL DEFAULT 'ACTIVE',
        updated_at             INTEGER NOT NULL DEFAULT (unixepoch())
      )`,
      `CREATE TABLE IF NOT EXISTS enrollment_usage (
        portal_id  INTEGER NOT NULL,
        year_month TEXT NOT NULL,
        count      INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (portal_id, year_month)
      )`,
      `CREATE TABLE IF NOT EXISTS sequence_usage (
        portal_id   INTEGER NOT NULL,
        sequence_id TEXT NOT NULL,
        year_month  TEXT NOT NULL,
        count       INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (portal_id, sequence_id, year_month)
      )`,
    ],
    'write'
  );
}

// ── Tier limits ───────────────────────────────────────────────────────────────

export const TIER_LIMITS: Record<string, number> = {
  FREE: 100,
  PRO: 1000,
  ENTERPRISE: Infinity,
};

// ── OAuth token helpers ───────────────────────────────────────────────────────

export async function saveToken(
  portalId: number,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): Promise<void> {
  await getDb().execute({
    sql: 'INSERT OR REPLACE INTO portal_tokens (portal_id, access_token, refresh_token, expires_at) VALUES (?,?,?,?)',
    args: [portalId, accessToken, refreshToken, Date.now() + expiresIn * 1000],
  });
}

export async function getStoredToken(
  portalId: number
): Promise<{ accessToken: string; refreshToken: string; expiresAt: number } | null> {
  const result = await getDb().execute({
    sql: 'SELECT access_token, refresh_token, expires_at FROM portal_tokens WHERE portal_id = ?',
    args: [portalId],
  });
  const r = result.rows[0];
  if (!r) return null;
  return {
    accessToken: r.access_token as string,
    refreshToken: r.refresh_token as string,
    expiresAt: r.expires_at as number,
  };
}

// ── Portal info helpers ───────────────────────────────────────────────────────

export async function savePortalInfo(portalId: number, hubDomain: string): Promise<void> {
  await getDb().execute({
    sql: 'INSERT OR IGNORE INTO portal_info (portal_id, hub_domain) VALUES (?,?)',
    args: [portalId, hubDomain],
  });
}

// ── Subscription helpers ──────────────────────────────────────────────────────

export interface PortalSubscription {
  portalId: number;
  tier: string;
  billingCycle: string | null;
  paypalSubscriptionId: string | null;
  periodEndAt: number | null;
  status: string;
  updatedAt: number;
}

export async function getSubscription(portalId: number): Promise<PortalSubscription> {
  const result = await getDb().execute({
    sql: 'SELECT * FROM portal_subscriptions WHERE portal_id = ?',
    args: [portalId],
  });
  const r = result.rows[0];
  if (!r) {
    return {
      portalId,
      tier: 'FREE',
      billingCycle: null,
      paypalSubscriptionId: null,
      periodEndAt: null,
      status: 'ACTIVE',
      updatedAt: 0,
    };
  }
  return {
    portalId: r.portal_id as number,
    tier: r.tier as string,
    billingCycle: r.billing_cycle as string | null,
    paypalSubscriptionId: r.paypal_subscription_id as string | null,
    periodEndAt: r.period_end_at as number | null,
    status: r.status as string,
    updatedAt: r.updated_at as number,
  };
}

export async function upsertSubscription(
  portalId: number,
  data: {
    tier?: string;
    billingCycle?: string | null;
    paypalSubscriptionId?: string | null;
    periodEndAt?: number | null;
    status?: string;
  }
): Promise<void> {
  const current = await getSubscription(portalId);
  await getDb().execute({
    sql: `INSERT OR REPLACE INTO portal_subscriptions
      (portal_id, tier, billing_cycle, paypal_subscription_id, period_end_at, status, updated_at)
      VALUES (?,?,?,?,?,?,unixepoch())`,
    args: [
      portalId,
      data.tier ?? current.tier,
      data.billingCycle !== undefined ? data.billingCycle : current.billingCycle,
      data.paypalSubscriptionId !== undefined
        ? data.paypalSubscriptionId
        : current.paypalSubscriptionId,
      data.periodEndAt !== undefined ? data.periodEndAt : current.periodEndAt,
      data.status ?? current.status,
    ],
  });
}

// ── Enrollment usage helpers ──────────────────────────────────────────────────

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function addEnrollmentCount(portalId: number, count: number): Promise<void> {
  const ym = currentYearMonth();
  await getDb().execute({
    sql: `INSERT INTO enrollment_usage (portal_id, year_month, count) VALUES (?,?,?)
      ON CONFLICT(portal_id, year_month) DO UPDATE SET count = count + excluded.count`,
    args: [portalId, ym, count],
  });
}

export async function getMonthlyCount(portalId: number): Promise<number> {
  const ym = currentYearMonth();
  const result = await getDb().execute({
    sql: 'SELECT count FROM enrollment_usage WHERE portal_id = ? AND year_month = ?',
    args: [portalId, ym],
  });
  const r = result.rows[0];
  return r ? (r.count as number) : 0;
}

/**
 * Returns how many more enrollments this portal can make this month.
 * Returns Infinity for Enterprise. Returns 0 if over limit.
 */
export async function remainingEnrollments(portalId: number): Promise<number> {
  const sub = await getSubscription(portalId);
  const effectiveTier = sub.status === 'ACTIVE' ? sub.tier : 'FREE';
  const limit = TIER_LIMITS[effectiveTier] ?? TIER_LIMITS.FREE;
  if (limit === Infinity) return Infinity;
  const used = await getMonthlyCount(portalId);
  return Math.max(0, limit - used);
}

// ── Admin overview ────────────────────────────────────────────────────────────

export interface AdminPortalRow {
  portalId: number;
  hubDomain: string | null;
  installedAt: number;
  tier: string;
  billingCycle: string | null;
  paypalSubscriptionId: string | null;
  status: string;
  monthlyCount: number;
  tierLimit: number | null; // null = unlimited
}

export async function getAllPortals(): Promise<AdminPortalRow[]> {
  const ym = currentYearMonth();
  const result = await getDb().execute({
    sql: `SELECT
      pi.portal_id,
      pi.hub_domain,
      pi.installed_at,
      COALESCE(ps.tier, 'FREE')     AS tier,
      ps.billing_cycle,
      ps.paypal_subscription_id,
      COALESCE(ps.status, 'ACTIVE') AS status,
      COALESCE(eu.count, 0)         AS monthly_count
    FROM portal_info pi
    LEFT JOIN portal_subscriptions ps ON ps.portal_id = pi.portal_id
    LEFT JOIN enrollment_usage eu ON eu.portal_id = pi.portal_id AND eu.year_month = ?
    ORDER BY pi.installed_at DESC`,
    args: [ym],
  });

  return result.rows.map((r) => ({
    portalId: r.portal_id as number,
    hubDomain: r.hub_domain as string | null,
    installedAt: r.installed_at as number,
    tier: r.tier as string,
    billingCycle: r.billing_cycle as string | null,
    paypalSubscriptionId: r.paypal_subscription_id as string | null,
    status: r.status as string,
    monthlyCount: r.monthly_count as number,
    tierLimit:
      TIER_LIMITS[r.tier as string] === Infinity
        ? null
        : (TIER_LIMITS[r.tier as string] ?? TIER_LIMITS.FREE),
  }));
}

// ── Per-sequence usage ────────────────────────────────────────────────────────

export async function addSequenceCount(
  portalId: number,
  sequenceId: string,
  count: number
): Promise<void> {
  const ym = currentYearMonth();
  await getDb().execute({
    sql: `INSERT INTO sequence_usage (portal_id, sequence_id, year_month, count) VALUES (?,?,?,?)
      ON CONFLICT(portal_id, sequence_id, year_month) DO UPDATE SET count = count + excluded.count`,
    args: [portalId, sequenceId, ym, count],
  });
}

export interface SequenceUsageRow {
  sequenceId: string;
  thisMonth: number;
  allTime: number;
}

export async function getSequenceCounts(portalId: number): Promise<SequenceUsageRow[]> {
  const ym = currentYearMonth();
  const result = await getDb().execute({
    sql: `SELECT
        sequence_id,
        SUM(count) AS all_time,
        SUM(CASE WHEN year_month = ? THEN count ELSE 0 END) AS this_month
      FROM sequence_usage
      WHERE portal_id = ?
      GROUP BY sequence_id
      ORDER BY all_time DESC`,
    args: [ym, portalId],
  });
  return result.rows.map((r) => ({
    sequenceId: r.sequence_id as string,
    thisMonth: r.this_month as number,
    allTime: r.all_time as number,
  }));
}
