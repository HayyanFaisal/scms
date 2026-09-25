import crypto from 'crypto';
import { hashPassword, hashToken, parseCookies, randomToken, sessionCookie, verifyPassword } from './security.js';

const SESSION_COOKIE = 'scms_session';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

const inactivityMinutes = positiveInteger(process.env.SCMS_SESSION_INACTIVITY_MINUTES, 10);
const absoluteHours = positiveInteger(process.env.SCMS_SESSION_ABSOLUTE_HOURS, 8);
const lockMinutes = positiveInteger(process.env.SCMS_ACCOUNT_LOCK_MINUTES, 15);
const maximumFailures = positiveInteger(process.env.SCMS_MAX_LOGIN_FAILURES, 5);
const secureCookies = process.env.NODE_ENV === 'production' || process.env.SCMS_SECURE_COOKIES === 'true';

function requestIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 64) || null;
}

function correlationId(req) {
  return String(req.headers['x-correlation-id'] || crypto.randomUUID()).slice(0, 36);
}

async function writeAudit(pool, req, { userId = null, action, outcome = 'success', reason = null, details = null }) {
  try {
    await pool.query(
      `INSERT INTO scms_audit_events
        (actor_user_id, action, outcome, reason, ip_address, correlation_id, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, action, outcome, reason, requestIp(req), correlationId(req), details ? JSON.stringify(details) : null]
    );
  } catch (error) {
    console.error('[Audit] Failed to append authentication event:', error instanceof Error ? error.message : error);
  }
}

async function loadUserContext(pool, userId) {
  const [users] = await pool.query(
    `SELECT id, username, display_name, email, is_active, must_change_password, last_login_at
     FROM scms_users WHERE id = ?`,
    [userId]
  );
  if (!users[0] || !users[0].is_active) return null;

  const [roles] = await pool.query(
    `SELECT r.name
     FROM scms_roles r
     INNER JOIN scms_user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = ? AND r.is_active = TRUE
     ORDER BY r.is_protected DESC, r.name`,
    [userId]
  );
  const [permissions] = await pool.query(
    `SELECT DISTINCT p.code
     FROM scms_permissions p
     INNER JOIN scms_role_permissions rp ON rp.permission_id = p.id
     INNER JOIN scms_user_roles ur ON ur.role_id = rp.role_id
     INNER JOIN scms_roles r ON r.id = ur.role_id
     WHERE ur.user_id = ? AND r.is_active = TRUE
     ORDER BY p.code`,
    [userId]
  );

  return {
    id: Number(users[0].id),
    username: users[0].username,
    displayName: users[0].display_name,
    email: users[0].email,
    isActive: Boolean(users[0].is_active),
    mustChangePassword: Boolean(users[0].must_change_password),
    lastLoginAt: users[0].last_login_at,
    roles: roles.map(row => row.name),
    permissions: permissions.map(row => row.code)
  };
}

function clientUser(context) {
  return {
    User_ID: context.id,
    Username: context.username,
    Email: context.email || '',
    Role: context.roles[0] || '',
    Roles: context.roles,
    Permissions: context.permissions,
    Full_Name: context.displayName,
    Is_Active: context.isActive,
    Must_Change_Password: context.mustChangePassword,
    Last_Login: context.lastLoginAt
  };
}

export function createStaffAuth(pool) {
  async function resolveSession(req, { touch = true } = {}) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;

    const tokenHash = hashToken(token);
    const [sessions] = await pool.query(
      `SELECT token_hash, user_id, csrf_hash, last_seen_at, expires_at
       FROM scms_sessions WHERE token_hash = ?`,
      [tokenHash]
    );
    const session = sessions[0];
    if (!session) return null;

    const now = Date.now();
    const lastSeen = new Date(session.last_seen_at).getTime();
    const expiresAt = new Date(session.expires_at).getTime();
    if (expiresAt <= now || lastSeen + inactivityMinutes * 60_000 <= now) {
      await pool.query('DELETE FROM scms_sessions WHERE token_hash = ?', [tokenHash]);
      return null;
    }

    const user = await loadUserContext(pool, session.user_id);
    if (!user) {
      await pool.query('DELETE FROM scms_sessions WHERE token_hash = ?', [tokenHash]);
      return null;
    }

    if (touch) {
      await pool.query('UPDATE scms_sessions SET last_seen_at = CURRENT_TIMESTAMP(3) WHERE token_hash = ?', [tokenHash]);
    }

    return { tokenHash, csrfHash: session.csrf_hash, user };
  }

  async function login(req, res) {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const normalizedUsername = username.toLocaleLowerCase('en-US');

    if (!username || !password) {
      res.status(400).json({ error: { code: 'INVALID_LOGIN_REQUEST', message: 'Username and password are required.' } });
      return;
    }

    const [users] = await pool.query(
      `SELECT id, password_hash, is_active, must_change_password, temporary_password_expires_at,
              failed_login_attempts, locked_until
       FROM scms_users WHERE normalized_username = ?`,
      [normalizedUsername]
    );
    const record = users[0];
    const genericFailure = { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' } };

    if (!record || !record.is_active) {
      await writeAudit(pool, req, { action: 'auth.login', outcome: 'denied', reason: 'invalid_credentials' });
      res.status(401).json(genericFailure);
      return;
    }

    if (record.locked_until && new Date(record.locked_until).getTime() > Date.now()) {
      await writeAudit(pool, req, { userId: record.id, action: 'auth.login', outcome: 'denied', reason: 'account_locked' });
      res.status(423).json({ error: { code: 'ACCOUNT_LOCKED', message: 'Account is temporarily locked. Contact Support if access is urgent.' } });
      return;
    }

    const valid = await verifyPassword(password, record.password_hash);
    if (!valid) {
      const failures = Number(record.failed_login_attempts || 0) + 1;
      const shouldLock = failures >= maximumFailures;
      await pool.query(
        `UPDATE scms_users
         SET failed_login_attempts = ?, locked_until = ?
         WHERE id = ?`,
        [shouldLock ? 0 : failures, shouldLock ? new Date(Date.now() + lockMinutes * 60_000) : null, record.id]
      );
      await writeAudit(pool, req, {
        userId: record.id,
        action: 'auth.login',
        outcome: 'denied',
        reason: shouldLock ? 'account_locked_after_failures' : 'invalid_credentials'
      });
      res.status(401).json(genericFailure);
      return;
    }

    if (record.must_change_password && record.temporary_password_expires_at &&
        new Date(record.temporary_password_expires_at).getTime() <= Date.now()) {
      await writeAudit(pool, req, { userId: record.id, action: 'auth.login', outcome: 'denied', reason: 'temporary_password_expired' });
      res.status(403).json({
        error: {
          code: 'TEMPORARY_PASSWORD_EXPIRED',
          message: 'This temporary password has expired. Ask an authorized staff member to issue a new one.'
        }
      });
      return;
    }

    const token = randomToken();
    const csrfToken = randomToken();
    const expiresAt = new Date(Date.now() + absoluteHours * 60 * 60_000);
    await pool.query('DELETE FROM scms_sessions WHERE user_id = ? OR expires_at <= CURRENT_TIMESTAMP(3)', [record.id]);
    await pool.query(
      `INSERT INTO scms_sessions
        (token_hash, user_id, csrf_hash, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [hashToken(token), record.id, hashToken(csrfToken), expiresAt, requestIp(req), String(req.headers['user-agent'] || '').slice(0, 500) || null]
    );
    await pool.query(
      `UPDATE scms_users
       SET failed_login_attempts = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [record.id]
    );

    const user = await loadUserContext(pool, record.id);
    await writeAudit(pool, req, { userId: record.id, action: 'auth.login' });
    res.setHeader('Set-Cookie', sessionCookie(token, { maxAgeSeconds: absoluteHours * 60 * 60, secure: secureCookies }));
    res.json({ user: clientUser(user), csrfToken, inactivityMinutes });
  }

  async function session(req, res) {
    const resolved = await resolveSession(req);
    if (!resolved) {
      res.setHeader('Set-Cookie', sessionCookie('', { maxAgeSeconds: 0, secure: secureCookies }));
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in is required.' } });
      return;
    }

    const csrfToken = randomToken();
    await pool.query('UPDATE scms_sessions SET csrf_hash = ? WHERE token_hash = ?', [hashToken(csrfToken), resolved.tokenHash]);
    res.json({ user: clientUser(resolved.user), csrfToken, inactivityMinutes });
  }

  async function authenticate(req, res, next) {
    try {
      const resolved = await resolveSession(req);
      if (!resolved) {
        res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in is required.' } });
        return;
      }
      req.staff = resolved.user;
      req.staffSession = { tokenHash: resolved.tokenHash, csrfHash: resolved.csrfHash };
      const isPasswordChange = String(req.originalUrl || '').startsWith('/api/auth/change-password');
      if (resolved.user.mustChangePassword && !isPasswordChange) {
        res.status(403).json({
          error: {
            code: 'PASSWORD_CHANGE_REQUIRED',
            message: 'Replace the temporary password before accessing the system.'
          }
        });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  }

  function requireCsrf(req, res, next) {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const supplied = req.headers['x-csrf-token'];
    if (typeof supplied !== 'string' || hashToken(supplied) !== req.staffSession?.csrfHash) {
      res.status(403).json({ error: { code: 'INVALID_CSRF_TOKEN', message: 'The request security token is invalid. Refresh and try again.' } });
      return;
    }
    next();
  }

  function requirePermission(permission) {
    return (req, res, next) => {
      if (!req.staff?.permissions.includes(permission)) {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Your role does not permit this action.' } });
        return;
      }
      next();
    };
  }

  async function logout(req, res, next) {
    try {
      const resolved = await resolveSession(req, { touch: false });
      if (resolved) {
        const supplied = req.headers['x-csrf-token'];
        if (typeof supplied !== 'string' || hashToken(supplied) !== resolved.csrfHash) {
          res.status(403).json({ error: { code: 'INVALID_CSRF_TOKEN', message: 'The request security token is invalid.' } });
          return;
        }
        await pool.query('DELETE FROM scms_sessions WHERE token_hash = ?', [resolved.tokenHash]);
        await writeAudit(pool, req, { userId: resolved.user.id, action: 'auth.logout' });
      }
      res.setHeader('Set-Cookie', sessionCookie('', { maxAgeSeconds: 0, secure: secureCookies }));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  async function changePassword(req, res, next) {
    try {
      const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
      const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
      if (!currentPassword || newPassword.length < 12) {
        res.status(400).json({ error: { code: 'INVALID_PASSWORD', message: 'The new password must be at least 12 characters.' } });
        return;
      }
      if (currentPassword === newPassword) {
        res.status(400).json({ error: { code: 'PASSWORD_REUSE', message: 'Choose a password different from the temporary password.' } });
        return;
      }

      const [users] = await pool.query('SELECT password_hash FROM scms_users WHERE id = ?', [req.staff.id]);
      if (!users[0] || !(await verifyPassword(currentPassword, users[0].password_hash))) {
        await writeAudit(pool, req, { userId: req.staff.id, action: 'auth.change_password', outcome: 'denied', reason: 'invalid_current_password' });
        res.status(401).json({ error: { code: 'INVALID_CURRENT_PASSWORD', message: 'The current password is incorrect.' } });
        return;
      }

      const passwordHash = await hashPassword(newPassword);
      await pool.query(
        `UPDATE scms_users
         SET password_hash = ?, must_change_password = FALSE, temporary_password_expires_at = NULL
         WHERE id = ?`,
        [passwordHash, req.staff.id]
      );
      await pool.query(
        'DELETE FROM scms_sessions WHERE user_id = ? AND token_hash <> ?',
        [req.staff.id, req.staffSession.tokenHash]
      );
      await writeAudit(pool, req, { userId: req.staff.id, action: 'auth.change_password' });
      const user = await loadUserContext(pool, req.staff.id);
      res.json({ user: clientUser(user) });
    } catch (error) {
      next(error);
    }
  }

  return { login, session, logout, changePassword, authenticate, requireCsrf, requirePermission };
}
