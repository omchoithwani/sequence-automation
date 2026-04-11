import BetterSqlite3 from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');
mkdirSync(DATA_DIR, { recursive: true });

const db = new BetterSqlite3(join(DATA_DIR, 'tokens.db'));

db.exec(`
  -- OAuth tokens (one row per installed portal)
  CREATE TABLE IF NOT EXISTS portal_tokens (
    portal_id     INTEGER PRIMARY KEY,
    access_token  TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at    INTEGER NOT NULL
  );

  -- Basic portal metadata captured during OAuth install
  CREATE TABLE IF NOT EXISTS portal_info (
    portal_id    INTEGER PRIMARY KEY,
    hub_domain   TEXT,
    installed_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- Subscription / tier state per portal
  CREATE TABLE IF NOT EXISTS portal_subscriptions (
    portal_id              INTEGER PRIMARY KEY,
    tier                   TEXT NOT NULL DEFAULT 'FREE',     -- FREE | PRO | ENTERPRISE
    billing_cycle          TEXT,                              -- MONTHLY | YEARLY
    paypal_subscription_id TEXT,
    period_end_at          INTEGER,
    status                 TEXT NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE | CANCELLED | SUSPENDED
    updated_at             INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- Monthly enrollment counts for metering / tier enforcement
  CREATE TABLE IF NOT EXISTS enrollment_usage (
    portal_id  INTEGER NOT NULL,
    year_month TEXT NOT NULL,   -- e.g. "2024-01"
    count      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (portal_id, year_month)
  );
`);

// ── Tier limits ───────────────────────────────────────────────────────────────

export const TIER_LIMITS: Record<string, number> = {
  FREE: 100,
  PRO: 1000,
  ENTERPRISE: Infinity,
};

// ── OAuth token helpers ───────────────────────────────────────────────────────

interface TokenRow { access_token: string; refresh_token: string; expires_at: number; }
const stmtUpsertToken = db.prepare<[number, string, string, number]>(
  'INSERT OR REPLACE INTO portal_tokens (portal_id, access_token, refresh_token, expires_at) VALUES (?,?,?,?)'
);
const stmtGetToken = db.prepare<[number], TokenRow>(
  'SELECT access_token, refresh_token, expires_at FROM portal_tokens WHERE portal_id = ?'
);

export function saveToken(portalId: number, accessToken: string, refreshToken: string, expiresIn: number): void {
  stmtUpsertToken.run(portalId, accessToken, refreshToken, Date.now() + expiresIn * 1000);
}

export function getStoredToken(portalId: number): { accessToken: string; refreshToken: string; expiresAt: number } | null {
  const r = stmtGetToken.get(portalId);
  if (!r) return null;
  return { accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt: r.expires_at };
}

// ── Portal info helpers ───────────────────────────────────────────────────────

export function savePortalInfo(portalId: number, hubDomain: string): void {
  db.prepare('INSERT OR IGNORE INTO portal_info (portal_id, hub_domain) VALUES (?,?)')
    .run(portalId, hubDomain);
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

interface SubRow {
  portal_id: number; tier: string; billing_cycle: string | null;
  paypal_subscription_id: string | null; period_end_at: number | null;
  status: string; updated_at: number;
}

function rowToSub(r: SubRow): PortalSubscription {
  return {
    portalId: r.portal_id, tier: r.tier, billingCycle: r.billing_cycle,
    paypalSubscriptionId: r.paypal_subscription_id, periodEndAt: r.period_end_at,
    status: r.status, updatedAt: r.updated_at,
  };
}

export function getSubscription(portalId: number): PortalSubscription {
  const r = db.prepare<[number], SubRow>(
    'SELECT * FROM portal_subscriptions WHERE portal_id = ?'
  ).get(portalId);
  // Default to FREE / ACTIVE if no row exists
  return r ? rowToSub(r) : {
    portalId, tier: 'FREE', billingCycle: null, paypalSubscriptionId: null,
    periodEndAt: null, status: 'ACTIVE', updatedAt: 0,
  };
}

export function upsertSubscription(
  portalId: number,
  data: { tier?: string; billingCycle?: string | null; paypalSubscriptionId?: string | null; periodEndAt?: number | null; status?: string }
): void {
  const current = getSubscription(portalId);
  db.prepare(`
    INSERT OR REPLACE INTO portal_subscriptions
      (portal_id, tier, billing_cycle, paypal_subscription_id, period_end_at, status, updated_at)
    VALUES (?,?,?,?,?,?,unixepoch())
  `).run(
    portalId,
    data.tier ?? current.tier,
    data.billingCycle !== undefined ? data.billingCycle : current.billingCycle,
    data.paypalSubscriptionId !== undefined ? data.paypalSubscriptionId : current.paypalSubscriptionId,
    data.periodEndAt !== undefined ? data.periodEndAt : current.periodEndAt,
    data.status ?? current.status,
  );
}

// ── Enrollment usage helpers ──────────────────────────────────────────────────

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function addEnrollmentCount(portalId: number, count: number): void {
  const ym = currentYearMonth();
  db.prepare(`
    INSERT INTO enrollment_usage (portal_id, year_month, count) VALUES (?,?,?)
    ON CONFLICT(portal_id, year_month) DO UPDATE SET count = count + excluded.count
  `).run(portalId, ym, count);
}

export function getMonthlyCount(portalId: number): number {
  const ym = currentYearMonth();
  const r = db.prepare<[number, string], { count: number }>(
    'SELECT count FROM enrollment_usage WHERE portal_id = ? AND year_month = ?'
  ).get(portalId, ym);
  return r?.count ?? 0;
}

/**
 * Returns how many more enrollments this portal can make this month.
 * Returns Infinity for Enterprise.  Returns 0 if over limit.
 */
export function remainingEnrollments(portalId: number): number {
  const sub = getSubscription(portalId);
  const effectiveTier = sub.status === 'ACTIVE' ? sub.tier : 'FREE';
  const limit = TIER_LIMITS[effectiveTier] ?? TIER_LIMITS.FREE;
  if (limit === Infinity) return Infinity;
  return Math.max(0, limit - getMonthlyCount(portalId));
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

export function getAllPortals(): AdminPortalRow[] {
  const ym = currentYearMonth();
  const rows = db.prepare<[string], any>(`
    SELECT
      pi.portal_id,
      pi.hub_domain,
      pi.installed_at,
      COALESCE(ps.tier, 'FREE')   AS tier,
      ps.billing_cycle,
      ps.paypal_subscription_id,
      COALESCE(ps.status, 'ACTIVE') AS status,
      COALESCE(eu.count, 0) AS monthly_count
    FROM portal_info pi
    LEFT JOIN portal_subscriptions ps ON ps.portal_id = pi.portal_id
    LEFT JOIN enrollment_usage eu ON eu.portal_id = pi.portal_id AND eu.year_month = ?
    ORDER BY pi.installed_at DESC
  `).all(ym);

  return rows.map((r) => ({
    portalId: r.portal_id,
    hubDomain: r.hub_domain,
    installedAt: r.installed_at,
    tier: r.tier,
    billingCycle: r.billing_cycle,
    paypalSubscriptionId: r.paypal_subscription_id,
    status: r.status,
    monthlyCount: r.monthly_count,
    tierLimit: TIER_LIMITS[r.tier] === Infinity ? null : (TIER_LIMITS[r.tier] ?? TIER_LIMITS.FREE),
  }));
}
