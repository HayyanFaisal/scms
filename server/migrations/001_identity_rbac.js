const permissions = [
  ['dashboard.view', 'View the operational dashboard'],
  ['parents.read', 'View parent records'],
  ['parents.create', 'Create parent records'],
  ['parents.update', 'Update parent records'],
  ['parents.archive', 'Archive parent records'],
  ['children.read', 'View child records'],
  ['children.create', 'Create child records'],
  ['children.update', 'Update child records'],
  ['children.archive', 'Archive child records'],
  ['documents.read', 'View document metadata and permitted content'],
  ['documents.upload', 'Upload documents'],
  ['documents.verify', 'Verify or reject documents'],
  ['documents.delete', 'Remove documents according to retention policy'],
  ['banking.read', 'View banking information'],
  ['banking.update', 'Maintain banking information'],
  ['grants.read', 'View grant records'],
  ['grants.manage', 'Create and update grant records'],
  ['gadgets.read', 'View gadget records'],
  ['gadgets.manage', 'Create and update gadget records'],
  ['applications.read', 'View application requests'],
  ['applications.review', 'Review and request corrections'],
  ['applications.approve', 'Approve or reject applications'],
  ['applications.block', 'Block further online applications'],
  ['reports.read', 'View reports'],
  ['reports.export_sensitive', 'Export sensitive report fields'],
  ['imports.create', 'Upload and validate imports'],
  ['imports.execute', 'Execute validated imports'],
  ['imports.resolve', 'Resolve import conflicts'],
  ['organizations.read', 'View organization master data'],
  ['organizations.manage', 'Manage organization master data'],
  ['rates.read', 'View category rates'],
  ['rates.manage', 'Publish category rate schedules'],
  ['users.read', 'View staff accounts'],
  ['users.manage', 'Create and maintain staff accounts'],
  ['roles.read', 'View roles and permissions'],
  ['roles.manage', 'Manage roles and permissions'],
  ['assignments.manage', 'Assign roles and data scopes'],
  ['accounts.issue_one_time_password', 'Issue one-time credentials'],
  ['accounts.unlock', 'Unlock user accounts'],
  ['audit.read', 'View immutable audit events'],
  ['audit.export', 'Export audit events'],
  ['settings.read', 'View system settings'],
  ['settings.manage', 'Manage operational settings'],
  ['security_settings.manage', 'Manage security settings']
];

const adminPermissions = [
  'dashboard.view',
  'parents.read', 'parents.create', 'parents.update', 'parents.archive',
  'children.read', 'children.create', 'children.update', 'children.archive',
  'documents.read', 'documents.upload', 'documents.verify', 'documents.delete',
  'banking.read', 'banking.update',
  'grants.read', 'grants.manage',
  'gadgets.read', 'gadgets.manage',
  'applications.read', 'applications.review', 'applications.approve',
  'reports.read', 'reports.export_sensitive',
  'imports.create', 'imports.execute', 'imports.resolve',
  'organizations.read', 'organizations.manage',
  'rates.read', 'users.read', 'roles.read',
  'accounts.issue_one_time_password', 'accounts.unlock',
  'audit.read', 'settings.read'
];

const supportPermissions = [
  'dashboard.view',
  'parents.read', 'parents.update',
  'children.read',
  'applications.read',
  'documents.read',
  'organizations.read',
  'accounts.issue_one_time_password', 'accounts.unlock'
];

async function assignPermissions(connection, roleName, permissionCodes) {
  const [[role]] = await connection.query('SELECT id FROM scms_roles WHERE name = ?', [roleName]);
  if (!role) throw new Error(`Role ${roleName} was not created`);

  for (const code of permissionCodes) {
    await connection.query(
      `INSERT IGNORE INTO scms_role_permissions (role_id, permission_id)
       SELECT ?, id FROM scms_permissions WHERE code = ?`,
      [role.id, code]
    );
  }
}

export async function up(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_users (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) NOT NULL,
      normalized_username VARCHAR(100) NOT NULL,
      display_name VARCHAR(160) NOT NULL,
      email VARCHAR(255) NULL,
      password_hash VARCHAR(255) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
      failed_login_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      locked_until DATETIME(3) NULL,
      last_login_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_scms_users_normalized_username (normalized_username),
      UNIQUE KEY uq_scms_users_email (email)
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_roles (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description VARCHAR(500) NULL,
      is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
      is_protected BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_scms_roles_name (name)
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_permissions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(120) NOT NULL,
      description VARCHAR(500) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_scms_permissions_code (code)
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_role_permissions (
      role_id BIGINT UNSIGNED NOT NULL,
      permission_id BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      CONSTRAINT fk_scms_role_permissions_role FOREIGN KEY (role_id) REFERENCES scms_roles(id) ON DELETE CASCADE,
      CONSTRAINT fk_scms_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES scms_permissions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_user_roles (
      user_id BIGINT UNSIGNED NOT NULL,
      role_id BIGINT UNSIGNED NOT NULL,
      assigned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      assigned_by BIGINT UNSIGNED NULL,
      PRIMARY KEY (user_id, role_id),
      CONSTRAINT fk_scms_user_roles_user FOREIGN KEY (user_id) REFERENCES scms_users(id) ON DELETE CASCADE,
      CONSTRAINT fk_scms_user_roles_role FOREIGN KEY (role_id) REFERENCES scms_roles(id) ON DELETE RESTRICT,
      CONSTRAINT fk_scms_user_roles_assigner FOREIGN KEY (assigned_by) REFERENCES scms_users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_sessions (
      token_hash CHAR(64) PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      csrf_hash CHAR(64) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      expires_at DATETIME(3) NOT NULL,
      ip_address VARCHAR(64) NULL,
      user_agent VARCHAR(500) NULL,
      CONSTRAINT fk_scms_sessions_user FOREIGN KEY (user_id) REFERENCES scms_users(id) ON DELETE CASCADE,
      INDEX idx_scms_sessions_user (user_id),
      INDEX idx_scms_sessions_expiry (expires_at)
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_audit_events (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      actor_user_id BIGINT UNSIGNED NULL,
      action VARCHAR(120) NOT NULL,
      entity_type VARCHAR(120) NULL,
      entity_id VARCHAR(160) NULL,
      outcome VARCHAR(40) NOT NULL DEFAULT 'success',
      reason VARCHAR(500) NULL,
      ip_address VARCHAR(64) NULL,
      correlation_id CHAR(36) NOT NULL,
      details JSON NULL,
      occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_scms_audit_actor FOREIGN KEY (actor_user_id) REFERENCES scms_users(id) ON DELETE SET NULL,
      INDEX idx_scms_audit_actor_time (actor_user_id, occurred_at),
      INDEX idx_scms_audit_entity (entity_type, entity_id),
      INDEX idx_scms_audit_action_time (action, occurred_at)
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_data_scopes (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      scope_type ENUM('all', 'selected_authorities', 'assigned_authority', 'no_authority', 'assigned_records', 'none') NOT NULL,
      configuration JSON NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      UNIQUE KEY uq_scms_data_scopes_name (name)
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_user_scopes (
      user_id BIGINT UNSIGNED NOT NULL,
      module_code VARCHAR(100) NOT NULL,
      scope_id BIGINT UNSIGNED NOT NULL,
      assigned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (user_id, module_code, scope_id),
      CONSTRAINT fk_scms_user_scopes_user FOREIGN KEY (user_id) REFERENCES scms_users(id) ON DELETE CASCADE,
      CONSTRAINT fk_scms_user_scopes_scope FOREIGN KEY (scope_id) REFERENCES scms_data_scopes(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB
  `);

  for (const [code, description] of permissions) {
    await connection.query(
      `INSERT INTO scms_permissions (code, description) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE description = VALUES(description)`,
      [code, description]
    );
  }

  const roles = [
    ['Director', 'Protected system owner with all permissions', true, true],
    ['Admin', 'Operational administration and approvals', true, false],
    ['Support', 'User assistance and limited record maintenance', true, false]
  ];

  for (const role of roles) {
    await connection.query(
      `INSERT INTO scms_roles (name, description, is_builtin, is_protected)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE description = VALUES(description), is_builtin = VALUES(is_builtin), is_protected = VALUES(is_protected)`,
      role
    );
  }

  await assignPermissions(connection, 'Director', permissions.map(([code]) => code));
  await assignPermissions(connection, 'Admin', adminPermissions);
  await assignPermissions(connection, 'Support', supportPermissions);

  await connection.query(
    `INSERT INTO scms_data_scopes (name, scope_type, configuration)
     VALUES ('All records', 'all', NULL), ('No records', 'none', NULL)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`
  );
}
