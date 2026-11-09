import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { TeamId, User } from '@cti/shared';

/** Test accounts for local development. Replace with company SSO in production. */
export const USERS: Record<string, User> = {
  alex: { id: 'alex', name: 'Alex Chen', firstName: 'Alex', initials: 'AC', team: 'Support Insights', role: 'editor', access: 'all' },
  jordan: { id: 'jordan', name: 'Jordan Lee', firstName: 'Jordan', initials: 'JL', team: 'Money Movement', role: 'viewer', access: ['money'] }
};

/**
 * Sign-in credentials. Passwords are stored only as scrypt hashes.
 * The test passwords are listed in README.md.
 */
const CREDENTIALS: Record<string, { userId: string; salt: string; hash: string }> = {
  'alex.chen@example.com': {
    userId: 'alex',
    salt: '1bca5bd806be2a34b72ec753a4f11fd9',
    hash: '14be775922869539856fc9fe4a3f6be2d135f1b2929fe9d88a97a512453fb9b8'
  },
  'jordan.lee@example.com': {
    userId: 'jordan',
    salt: '63f67ddbe6bf20cde3b986cebd977da5',
    hash: 'f5f03ed5d4c31e787d9e05491e0f8effadbca0370cb04a0f18b4ee490edb875c'
  }
};

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_FAILED = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

function secret(): string {
  const s = process.env.CTI_SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('CTI_SESSION_SECRET must be set in production.');
  return 'cti-local-dev-session-secret';
}

const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

/** Token format: `<userId>.<expiresAtMs>.<hmac>`. Stateless, so sessions survive API restarts. */
export function issueToken(userId: string, now = Date.now()): { token: string; expiresAt: string } {
  const exp = now + SESSION_TTL_MS;
  const payload = `${userId}.${exp}`;
  return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(exp).toISOString() };
}

export function verifyToken(token: string, now = Date.now()): User | undefined {
  const m = /^([a-z]+)\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(token);
  if (!m) return undefined;
  const expected = Buffer.from(sign(`${m[1]}.${m[2]}`));
  const given = Buffer.from(m[3]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined;
  if (Number(m[2]) <= now) return undefined;
  return USERS[m[1]];
}

const failures = new Map<string, { count: number; until: number }>();

export type LoginResult =
  | { ok: true; user: User; token: string; expiresAt: string }
  | { ok: false; status: 400 | 401 | 429; code: string; message: string };

export function login(emailInput: unknown, passwordInput: unknown, now = Date.now()): LoginResult {
  const email = typeof emailInput === 'string' ? emailInput.trim().toLowerCase() : '';
  const password = typeof passwordInput === 'string' ? passwordInput : '';
  if (!email || !password) return { ok: false, status: 400, code: 'invalid_request', message: 'Enter your email and password.' };

  const f = failures.get(email);
  if (f && f.count >= MAX_FAILED && f.until > now) {
    return { ok: false, status: 429, code: 'too_many_attempts', message: 'Too many failed attempts. Try again in a few minutes.' };
  }

  const cred = CREDENTIALS[email];
  // Hash even for unknown emails so response time doesn't reveal which accounts exist.
  const hash = scryptSync(password, cred?.salt ?? '00000000000000000000000000000000', 32);
  const match = !!cred && timingSafeEqual(hash, Buffer.from(cred.hash, 'hex'));
  if (!match) {
    const count = (f && f.until > now ? f.count : 0) + 1;
    failures.set(email, { count, until: now + LOCKOUT_MS });
    return { ok: false, status: 401, code: 'invalid_credentials', message: 'Email or password is incorrect.' };
  }
  failures.delete(email);
  return { ok: true, user: USERS[cred.userId], ...issueToken(cred.userId, now) };
}

/** Clears failed-attempt counters (dev reset and tests). */
export function resetLoginFailures(): void {
  failures.clear();
}

export function canRead(user: User, team: TeamId): boolean {
  return user.access === 'all' || user.access.includes(team);
}

/** Expects `Authorization: Bearer <token from POST /api/auth/login>`. */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const m = /^Bearer\s+(\S+)$/.exec(req.header('authorization') ?? '');
  const user = m ? verifyToken(m[1]) : undefined;
  if (!user) {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Your session has ended. Sign in again.' } });
    return;
  }
  res.locals.user = user;
  next();
}

export function requireEditor(_req: Request, res: Response, next: NextFunction): void {
  if ((res.locals.user as User).role !== 'editor') {
    res.status(403).json({ error: { code: 'forbidden', message: 'Only editors can do this.' } });
    return;
  }
  next();
}
