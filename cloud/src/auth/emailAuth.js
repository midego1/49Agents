/**
 * Email Auth — local-side signup for local-hosted instances.
 *
 * Replaces the OAuth flow for local mode. User provides an email,
 * we do an MX lookup to validate the domain, issue a local JWT,
 * store the identity locally, and register with the cloud server.
 *
 * POST /auth/email-signup
 */

import dns from 'dns';
import { promisify } from 'util';
import { SignJWT } from 'jose';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { upsertUser } from '../db/users.js';
import { recordEvent } from '../db/events.js';
import { getDb } from '../db/index.js';

const resolveMx = promisify(dns.resolveMx);

function getSecretKey() {
  return new TextEncoder().encode(config.jwt.secret);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function validateEmailDomain(email) {
  const domain = email.split('@')[1];
  try {
    const records = await resolveMx(domain);
    return records && records.length > 0;
  } catch {
    return false;
  }
}

export function ensureEmailAuthTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_email_auth (
      id           INTEGER PRIMARY KEY CHECK (id = 1),
      instance_id  TEXT NOT NULL,
      email        TEXT NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function getEmailAuth() {
  const db = getDb();
  const row = db.prepare('SELECT * FROM local_email_auth WHERE id = 1').get();
  if (!row) return null;
  return { instanceId: row.instance_id, email: row.email };
}

function saveEmailAuth({ instanceId, email }) {
  const db = getDb();
  db.prepare(`
    INSERT INTO local_email_auth (id, instance_id, email)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET instance_id = excluded.instance_id, email = excluded.email
  `).run(instanceId, email);
}

export async function issueEmailInstanceToken(instanceId, email) {
  const secretKey = getSecretKey();
  return new SignJWT({ sub: instanceId, type: 'local_email_instance', email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setJti(nanoid())
    .sign(secretKey);
}

export function setupEmailAuthRoutes(app) {
  // POST /auth/email-signup
  app.post('/auth/email-signup', async (req, res) => {
    try {
      const { email } = req.body;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required.' });
      }

      const trimmed = email.trim().toLowerCase();

      if (!EMAIL_RE.test(trimmed)) {
        return res.status(400).json({ error: 'Invalid email address.' });
      }

      const domainValid = await validateEmailDomain(trimmed);
      if (!domainValid) {
        return res.status(400).json({ error: 'Email domain does not appear to be valid.' });
      }

      const instanceId = `lei_${nanoid(16)}`;

      // Create or update local user record
      const localUser = upsertUser({
        githubId: null,
        githubLogin: null,
        googleId: null,
        email: trimmed,
        displayName: trimmed.split('@')[0],
        avatarUrl: null,
      });

      saveEmailAuth({ instanceId, email: trimmed });

      // Issue local JWT cookies reusing the existing cookie mechanism
      const { issueAccessToken, issueRefreshToken, setAuthCookies } = await import('./github.js');
      const jwtAccess = await issueAccessToken(localUser);
      const jwtRefresh = await issueRefreshToken(localUser);
      setAuthCookies(res, jwtAccess, jwtRefresh);

      recordEvent('user.login', localUser.id, { provider: 'email', instanceId });

      // Register with cloud (fire-and-forget — don't block the user on network failure)
      const instanceToken = await issueEmailInstanceToken(instanceId, trimmed);
      const cloudUrl = config.cloudAuthUrl;
      fetch(`${cloudUrl}/api/local-email-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${instanceToken}` },
        body: JSON.stringify({
          instanceId,
          email: trimmed,
          hostname: req.hostname,
          version: config.version || null,
        }),
        signal: AbortSignal.timeout(8000),
      }).catch((err) => {
        console.warn('[email-auth] Cloud registration failed (non-fatal):', err.message);
      });

      res.json({ ok: true });
    } catch (err) {
      console.error('[email-auth] Signup error:', err);
      res.status(500).json({ error: 'Signup failed. Please try again.' });
    }
  });
}
