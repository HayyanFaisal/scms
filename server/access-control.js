import { hashPassword } from './security.js';

export const DATA_SCOPE_MODULES = [
  { code: 'parents', label: 'Parents' },
  { code: 'children', label: 'Children' },
  { code: 'documents', label: 'Documents' },
  { code: 'banking', label: 'Banking' },
  { code: 'grants', label: 'Grants' },
  { code: 'gadgets', label: 'Gadgets' }
];

const MODULE_CODES = new Set(DATA_SCOPE_MODULES.map(module => module.code));

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.publicCode = code;
  return error;
}

function requireActorPermission(req, permission) {
  if (!req.staff?.permissions?.includes(permission)) {
    throw httpError(403, 'FORBIDDEN', 'Your role does not permit this access-control operation.');
  }
}

function requireString(value, label, maximum = 255) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result) throw httpError(400, 'VALIDATION_ERROR', `${label} is required.`);
  if (result.length > maximum) throw httpError(400, 'VALIDATION_ERROR', `${label} is too long.`);
  return result;
}

function optionalString(value, maximum = 255) {
  if (value === null || value === undefined || value === '') return null;
  const result = String(value).trim();
  if (result.length > maximum) throw httpError(400, 'VALIDATION_ERROR', 'A supplied value is too long.');
  return result || null;
}

export function normalizedIds(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(Number).filter(value => Number.isSafeInteger(value) && value > 0))];
}

function parseConfiguration(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function validateIds(connection, table, ids, label) {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.query(`SELECT id FROM ${table} WHERE id IN (${placeholders})`, ids);
  if (rows.length !== ids.length) throw httpError(400, 'INVALID_REFERENCE', `One or more ${label} no longer exist.`);
}

async function validateActiveRoleIds(connection, roleIds) {
  if (roleIds.length === 0) throw httpError(400, 'ROLE_REQUIRED', 'Assign at least one role.');
  const placeholders = roleIds.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT id FROM scms_roles WHERE is_active = TRUE AND id IN (${placeholders})`,
    roleIds
  );
  if (rows.length !== roleIds.length) {
    throw httpError(400, 'INVALID_ROLE', 'Every assigned role must exist and be active.');
  }
}

async function roleIdByName(connection, name) {
  const [rows] = await connection.query('SELECT id FROM scms_roles WHERE name = ?', [name]);
  return rows[0] ? Number(rows[0].id) : null;
}

async function protectDirectorContinuity(connection, targetUserId, nextActive, nextRoleIds) {
  const directorRoleId = await roleIdByName(connection, 'Director');
  const [current] = await connection.query(
    `SELECT u.is_active,
            EXISTS(SELECT 1 FROM scms_user_roles ur WHERE ur.user_id = u.id AND ur.role_id = ?) AS is_director
     FROM scms_users u WHERE u.id = ?`,
    [directorRoleId, targetUserId]
  );
  if (!current[0]) throw httpError(404, 'USER_NOT_FOUND', 'Staff account was not found.');

  const currentlyActiveDirector = Boolean(current[0].is_active) && Boolean(current[0].is_director);
  const remainsActiveDirector = Boolean(nextActive) && nextRoleIds.includes(directorRoleId);
  if (!currentlyActiveDirector || remainsActiveDirector) return;

  const [others] = await connection.query(
    `SELECT COUNT(*) AS total
     FROM scms_users u
     INNER JOIN scms_user_roles ur ON ur.user_id = u.id
     WHERE ur.role_id = ? AND u.is_active = TRUE AND u.id <> ?`,
    [directorRoleId, targetUserId]
  );
  if (Number(others[0].total) === 0) {
    throw httpError(409, 'LAST_DIRECTOR', 'The final active Director account cannot be disabled or stripped of the Director role.');
  }
}

async function replaceRoles(connection, userId, roleIds, actorUserId) {
  await validateActiveRoleIds(connection, roleIds);
  await connection.query('DELETE FROM scms_user_roles WHERE user_id = ?', [userId]);
  for (const roleId of roleIds) {
    await connection.query(
      'INSERT INTO scms_user_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)',
      [userId, roleId, actorUserId]
    );
  }
}

async function protectDirectorAssignment(connection, actor, targetUserId, roleIds) {
  const directorRoleId = await roleIdByName(connection, 'Director');
  const actorIsDirector = actor?.roles?.includes('Director');
  if (roleIds.includes(directorRoleId) && !actorIsDirector) {
    throw httpError(403, 'DIRECTOR_ASSIGNMENT_FORBIDDEN', 'Only a Director can assign the protected Director role.');
  }
  if (targetUserId && !actorIsDirector) {
    const [rows] = await connection.query(
      'SELECT 1 FROM scms_user_roles WHERE user_id = ? AND role_id = ?',
      [targetUserId, directorRoleId]
    );
    if (rows.length > 0) {
      throw httpError(403, 'DIRECTOR_ACCOUNT_PROTECTED', 'Only a Director can change another Director account.');
    }
  }
}

async function replaceScopes(connection, userId, assignments) {
  const normalized = Array.isArray(assignments)
    ? assignments
        .map(item => ({ moduleCode: String(item?.moduleCode || '').trim(), scopeId: Number(item?.scopeId) }))
        .filter(item => MODULE_CODES.has(item.moduleCode) && Number.isSafeInteger(item.scopeId) && item.scopeId > 0)
    : [];
  if (normalized.length !== DATA_SCOPE_MODULES.length) {
    throw httpError(400, 'SCOPE_REQUIRED', 'Choose one data scope for every protected module.');
  }
  if (new Set(normalized.map(item => item.moduleCode)).size !== DATA_SCOPE_MODULES.length) {
    throw httpError(400, 'DUPLICATE_SCOPE_MODULE', 'Each protected module must have exactly one data scope.');
  }
  await validateIds(connection, 'scms_data_scopes', [...new Set(normalized.map(item => item.scopeId))], 'data scopes');
  await connection.query('DELETE FROM scms_user_scopes WHERE user_id = ?', [userId]);
  for (const assignment of normalized) {
    await connection.query(
      'INSERT INTO scms_user_scopes (user_id, module_code, scope_id) VALUES (?, ?, ?)',
      [userId, assignment.moduleCode, assignment.scopeId]
    );
  }
}

async function loadCatalog(pool) {
  const [[permissions], [roles], [rolePermissions], [scopes], [authorities]] = await Promise.all([
    pool.query('SELECT id, code, description FROM scms_permissions ORDER BY code'),
    pool.query(`SELECT id, name, description, is_builtin, is_protected, is_active
                FROM scms_roles ORDER BY is_protected DESC, is_builtin DESC, name`),
    pool.query('SELECT role_id, permission_id FROM scms_role_permissions'),
    pool.query(`SELECT id, name, scope_type, configuration, is_builtin, is_active
                FROM scms_data_scopes ORDER BY is_builtin DESC, name`),
    pool.query(`SELECT name
                FROM scms_reference_items
                WHERE item_type = 'authority' AND is_active = TRUE
                ORDER BY sort_order, name`)
  ]);

  const permissionMap = new Map();
  for (const row of rolePermissions) {
    if (!permissionMap.has(Number(row.role_id))) permissionMap.set(Number(row.role_id), []);
    permissionMap.get(Number(row.role_id)).push(Number(row.permission_id));
  }

  return {
    permissions: permissions.map(row => ({
      id: Number(row.id),
      code: row.code,
      description: row.description,
      group: row.code.split('.')[0]
    })),
    roles: roles.map(row => ({
      id: Number(row.id),
      name: row.name,
      description: row.description || '',
      isBuiltin: Boolean(row.is_builtin),
      isProtected: Boolean(row.is_protected),
      isActive: Boolean(row.is_active),
      permissionIds: permissionMap.get(Number(row.id)) || []
    })),
    scopes: scopes.map(row => ({
      id: Number(row.id),
      name: row.name,
      type: row.scope_type,
      configuration: parseConfiguration(row.configuration),
      isBuiltin: Boolean(row.is_builtin),
      isActive: Boolean(row.is_active)
    })),
    authorities: authorities.map(row => row.name),
    modules: DATA_SCOPE_MODULES
  };
}

async function loadUsers(pool) {
  const [[users], [userRoles], [userScopes]] = await Promise.all([
    pool.query(`SELECT id, username, display_name, email, is_active, must_change_password,
                       temporary_password_expires_at, failed_login_attempts, locked_until,
                       last_login_at, created_at
                FROM scms_users ORDER BY display_name, username`),
    pool.query(`SELECT ur.user_id, r.id, r.name
                FROM scms_user_roles ur
                INNER JOIN scms_roles r ON r.id = ur.role_id
                ORDER BY r.is_protected DESC, r.name`),
    pool.query(`SELECT us.user_id, us.module_code, s.id AS scope_id, s.name AS scope_name
                FROM scms_user_scopes us
                INNER JOIN scms_data_scopes s ON s.id = us.scope_id`)
  ]);
  const rolesByUser = new Map();
  for (const row of userRoles) {
    if (!rolesByUser.has(Number(row.user_id))) rolesByUser.set(Number(row.user_id), []);
    rolesByUser.get(Number(row.user_id)).push({ id: Number(row.id), name: row.name });
  }
  const scopesByUser = new Map();
  for (const row of userScopes) {
    if (!scopesByUser.has(Number(row.user_id))) scopesByUser.set(Number(row.user_id), []);
    scopesByUser.get(Number(row.user_id)).push({
      moduleCode: row.module_code,
      scopeId: Number(row.scope_id),
      scopeName: row.scope_name
    });
  }

  return users.map(row => ({
    id: Number(row.id),
    username: row.username,
    displayName: row.display_name,
    email: row.email || '',
    isActive: Boolean(row.is_active),
    mustChangePassword: Boolean(row.must_change_password),
    temporaryPasswordExpiresAt: row.temporary_password_expires_at,
    failedLoginAttempts: Number(row.failed_login_attempts || 0),
    lockedUntil: row.locked_until,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    roles: rolesByUser.get(Number(row.id)) || [],
    scopes: scopesByUser.get(Number(row.id)) || []
  }));
}

export function registerAccessControlRoutes(app, pool) {
  app.get('/api/access-control/catalog', async (_req, res, next) => {
    try {
      res.json(await loadCatalog(pool));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/access-control/users', async (_req, res, next) => {
    try {
      res.json(await loadUsers(pool));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/access-control/users', async (req, res, next) => {
    const connection = await pool.getConnection();
    try {
      requireActorPermission(req, 'assignments.manage');
      const username = requireString(req.body?.username, 'Username', 100);
      const displayName = requireString(req.body?.displayName, 'Display name', 160);
      const email = optionalString(req.body?.email, 255);
      const temporaryPassword = typeof req.body?.temporaryPassword === 'string' ? req.body.temporaryPassword : '';
      if (temporaryPassword.length < 12) throw httpError(400, 'INVALID_PASSWORD', 'Temporary password must be at least 12 characters.');
      const roleIds = normalizedIds(req.body?.roleIds);
      const passwordHash = await hashPassword(temporaryPassword);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);

      await connection.beginTransaction();
      await protectDirectorAssignment(connection, req.staff, null, roleIds);
      const [result] = await connection.query(
        `INSERT INTO scms_users
          (username, normalized_username, display_name, email, password_hash,
           must_change_password, temporary_password_expires_at)
         VALUES (?, ?, ?, ?, ?, TRUE, ?)`,
        [username, username.toLocaleLowerCase('en-US'), displayName, email, passwordHash, expiresAt]
      );
      await replaceRoles(connection, result.insertId, roleIds, req.staff.id);
      await replaceScopes(connection, result.insertId, req.body?.scopeAssignments);
      await connection.commit();
      res.status(201).json({ id: Number(result.insertId), temporaryPasswordExpiresAt: expiresAt });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally {
      connection.release();
    }
  });

  app.patch('/api/access-control/users/:userId', async (req, res, next) => {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      res.status(400).json({ error: { code: 'INVALID_USER', message: 'Invalid staff account.' } });
      return;
    }
    const connection = await pool.getConnection();
    try {
      requireActorPermission(req, 'assignments.manage');
      const displayName = requireString(req.body?.displayName, 'Display name', 160);
      const email = optionalString(req.body?.email, 255);
      const isActive = Boolean(req.body?.isActive);
      const roleIds = normalizedIds(req.body?.roleIds);
      if (userId === req.staff.id && !isActive) throw httpError(409, 'SELF_DEACTIVATION', 'You cannot deactivate your own account.');

      await connection.beginTransaction();
      await validateActiveRoleIds(connection, roleIds);
      await protectDirectorAssignment(connection, req.staff, userId, roleIds);
      await protectDirectorContinuity(connection, userId, isActive, roleIds);
      await connection.query(
        'UPDATE scms_users SET display_name = ?, email = ?, is_active = ? WHERE id = ?',
        [displayName, email, isActive, userId]
      );
      await replaceRoles(connection, userId, roleIds, req.staff.id);
      await replaceScopes(connection, userId, req.body?.scopeAssignments);
      if (!isActive) await connection.query('DELETE FROM scms_sessions WHERE user_id = ?', [userId]);
      await connection.commit();
      res.status(204).send();
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally {
      connection.release();
    }
  });

  app.post('/api/access-control/users/:userId/reset-password', async (req, res, next) => {
    try {
      requireActorPermission(req, 'accounts.issue_one_time_password');
      const userId = Number(req.params.userId);
      const temporaryPassword = typeof req.body?.temporaryPassword === 'string' ? req.body.temporaryPassword : '';
      if (!Number.isSafeInteger(userId) || userId <= 0) throw httpError(400, 'INVALID_USER', 'Invalid staff account.');
      if (temporaryPassword.length < 12) throw httpError(400, 'INVALID_PASSWORD', 'Temporary password must be at least 12 characters.');
      const passwordHash = await hashPassword(temporaryPassword);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
      const [result] = await pool.query(
        `UPDATE scms_users
         SET password_hash = ?, must_change_password = TRUE, temporary_password_expires_at = ?,
             failed_login_attempts = 0, locked_until = NULL
         WHERE id = ?`,
        [passwordHash, expiresAt, userId]
      );
      if (result.affectedRows === 0) throw httpError(404, 'USER_NOT_FOUND', 'Staff account was not found.');
      await pool.query('DELETE FROM scms_sessions WHERE user_id = ?', [userId]);
      res.json({ temporaryPasswordExpiresAt: expiresAt });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/access-control/users/:userId/unlock', async (req, res, next) => {
    try {
      requireActorPermission(req, 'accounts.unlock');
      const userId = Number(req.params.userId);
      if (!Number.isSafeInteger(userId) || userId <= 0) throw httpError(400, 'INVALID_USER', 'Invalid staff account.');
      const [result] = await pool.query(
        'UPDATE scms_users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?',
        [userId]
      );
      if (result.affectedRows === 0) throw httpError(404, 'USER_NOT_FOUND', 'Staff account was not found.');
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/access-control/roles', async (req, res, next) => {
    const connection = await pool.getConnection();
    try {
      const name = requireString(req.body?.name, 'Role name', 100);
      const description = optionalString(req.body?.description, 500);
      const permissionIds = normalizedIds(req.body?.permissionIds);
      await connection.beginTransaction();
      await validateIds(connection, 'scms_permissions', permissionIds, 'permissions');
      const [result] = await connection.query(
        `INSERT INTO scms_roles (name, description, is_builtin, is_protected, is_active)
         VALUES (?, ?, FALSE, FALSE, TRUE)`,
        [name, description]
      );
      for (const permissionId of permissionIds) {
        await connection.query(
          'INSERT INTO scms_role_permissions (role_id, permission_id) VALUES (?, ?)',
          [result.insertId, permissionId]
        );
      }
      await connection.commit();
      res.status(201).json({ id: Number(result.insertId) });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally {
      connection.release();
    }
  });

  app.patch('/api/access-control/roles/:roleId', async (req, res, next) => {
    const roleId = Number(req.params.roleId);
    const connection = await pool.getConnection();
    try {
      if (!Number.isSafeInteger(roleId) || roleId <= 0) throw httpError(400, 'INVALID_ROLE', 'Invalid role.');
      const [existing] = await connection.query(
        'SELECT name, is_builtin, is_protected FROM scms_roles WHERE id = ?',
        [roleId]
      );
      if (!existing[0]) throw httpError(404, 'ROLE_NOT_FOUND', 'Role was not found.');
      if (existing[0].is_protected) throw httpError(409, 'PROTECTED_ROLE', 'The Director role is protected and always retains every permission.');
      const name = existing[0].is_builtin ? existing[0].name : requireString(req.body?.name, 'Role name', 100);
      const description = optionalString(req.body?.description, 500);
      const isActive = Boolean(req.body?.isActive);
      const permissionIds = normalizedIds(req.body?.permissionIds);
      await connection.beginTransaction();
      await validateIds(connection, 'scms_permissions', permissionIds, 'permissions');
      await connection.query(
        'UPDATE scms_roles SET name = ?, description = ?, is_active = ? WHERE id = ?',
        [name, description, isActive, roleId]
      );
      await connection.query('DELETE FROM scms_role_permissions WHERE role_id = ?', [roleId]);
      for (const permissionId of permissionIds) {
        await connection.query(
          'INSERT INTO scms_role_permissions (role_id, permission_id) VALUES (?, ?)',
          [roleId, permissionId]
        );
      }
      if (!isActive) await connection.query('DELETE s FROM scms_sessions s INNER JOIN scms_user_roles ur ON ur.user_id = s.user_id WHERE ur.role_id = ?', [roleId]);
      await connection.commit();
      res.status(204).send();
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally {
      connection.release();
    }
  });

  app.post('/api/access-control/scopes', async (req, res, next) => {
    try {
      const name = requireString(req.body?.name, 'Scope name', 120);
      const authorities = Array.isArray(req.body?.authorities)
        ? [...new Set(req.body.authorities.map(value => String(value).trim()).filter(Boolean))]
        : [];
      if (authorities.length === 0) throw httpError(400, 'AUTHORITY_REQUIRED', 'Select at least one authority.');
      const [result] = await pool.query(
        `INSERT INTO scms_data_scopes
          (name, scope_type, configuration, is_builtin, is_active)
         VALUES (?, 'selected_authorities', ?, FALSE, TRUE)`,
        [name, JSON.stringify({ authorities })]
      );
      res.status(201).json({ id: Number(result.insertId) });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/access-control/scopes/:scopeId', async (req, res, next) => {
    try {
      const scopeId = Number(req.params.scopeId);
      if (!Number.isSafeInteger(scopeId) || scopeId <= 0) throw httpError(400, 'INVALID_SCOPE', 'Invalid data scope.');
      const [existing] = await pool.query('SELECT is_builtin FROM scms_data_scopes WHERE id = ?', [scopeId]);
      if (!existing[0]) throw httpError(404, 'SCOPE_NOT_FOUND', 'Data scope was not found.');
      if (existing[0].is_builtin) throw httpError(409, 'PROTECTED_SCOPE', 'Built-in data scopes cannot be changed.');
      const name = requireString(req.body?.name, 'Scope name', 120);
      const authorities = Array.isArray(req.body?.authorities)
        ? [...new Set(req.body.authorities.map(value => String(value).trim()).filter(Boolean))]
        : [];
      if (authorities.length === 0) throw httpError(400, 'AUTHORITY_REQUIRED', 'Select at least one authority.');
      await pool.query(
        `UPDATE scms_data_scopes
         SET name = ?, configuration = ?, is_active = ? WHERE id = ?`,
        [name, JSON.stringify({ authorities }), Boolean(req.body?.isActive), scopeId]
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });
}
