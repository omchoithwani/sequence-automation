import BetterSqlite3 from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');
mkdirSync(DATA_DIR, { recursive: true });

const db = new BetterSqlite3(join(DATA_DIR, 'tokens.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS portal_tokens (
    portal_id   INTEGER PRIMARY KEY,
    access_token  TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at    INTEGER NOT NULL
  );
`);

interface TokenRow {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

const stmtUpsert = db.prepare<[number, string, string, number]>(`
  INSERT OR REPLACE INTO portal_tokens (portal_id, access_token, refresh_token, expires_at)
  VALUES (?, ?, ?, ?)
`);

const stmtGet = db.prepare<[number], TokenRow>(
  'SELECT access_token, refresh_token, expires_at FROM portal_tokens WHERE portal_id = ?'
);

export function saveToken(
  portalId: number,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): void {
  stmtUpsert.run(portalId, accessToken, refreshToken, Date.now() + expiresIn * 1000);
}

export function getStoredToken(portalId: number): {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
} | null {
  const row = stmtGet.get(portalId);
  if (!row) return null;
  return {
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: row.expires_at,
  };
}
