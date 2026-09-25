import { hashPassword } from '../security.js';

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

export async function up(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS authority_passwords (
      id INT AUTO_INCREMENT PRIMARY KEY,
      authority VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NULL,
      password_hash VARCHAR(255) NULL,
      must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
      temporary_password_expires_at DATETIME(3) NULL,
      credential_version INT UNSIGNED NOT NULL DEFAULT 1,
      reset_by BIGINT UNSIGNED NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_authority_password_reset_by
        FOREIGN KEY (reset_by) REFERENCES scms_users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB
  `);

  if (!(await columnExists(connection, 'authority_passwords', 'password_hash'))) {
    await connection.query('ALTER TABLE authority_passwords ADD COLUMN password_hash VARCHAR(255) NULL AFTER password');
  }
  if (!(await columnExists(connection, 'authority_passwords', 'must_change_password'))) {
    await connection.query('ALTER TABLE authority_passwords ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT TRUE AFTER password_hash');
  }
  if (!(await columnExists(connection, 'authority_passwords', 'temporary_password_expires_at'))) {
    await connection.query('ALTER TABLE authority_passwords ADD COLUMN temporary_password_expires_at DATETIME(3) NULL AFTER must_change_password');
  }
  if (!(await columnExists(connection, 'authority_passwords', 'credential_version'))) {
    await connection.query('ALTER TABLE authority_passwords ADD COLUMN credential_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER temporary_password_expires_at');
  }
  if (!(await columnExists(connection, 'authority_passwords', 'reset_by'))) {
    await connection.query('ALTER TABLE authority_passwords ADD COLUMN reset_by BIGINT UNSIGNED NULL AFTER credential_version');
    await connection.query(
      `ALTER TABLE authority_passwords ADD CONSTRAINT fk_authority_password_reset_by
       FOREIGN KEY (reset_by) REFERENCES scms_users(id) ON DELETE SET NULL`
    );
  }

  await connection.query('ALTER TABLE authority_passwords MODIFY COLUMN authority VARCHAR(100) NOT NULL');
  await connection.query('ALTER TABLE authority_passwords MODIFY COLUMN password VARCHAR(255) NULL');

  const [legacyRows] = await connection.query(
    `SELECT id, password FROM authority_passwords
     WHERE password_hash IS NULL AND password IS NOT NULL AND password <> ''`
  );
  for (const row of legacyRows) {
    const passwordHash = await hashPassword(String(row.password), { allowLegacyLength: true });
    await connection.query(
      `UPDATE authority_passwords
       SET password_hash = ?, password = NULL, must_change_password = TRUE,
           temporary_password_expires_at = DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 24 HOUR),
           credential_version = credential_version + 1
       WHERE id = ?`,
      [passwordHash, row.id]
    );
  }

  await connection.query(
    `INSERT INTO scms_permissions (code, description)
     VALUES ('authority_accounts.reset_password', 'Reset an authority portal credential without knowing its current password')
     ON DUPLICATE KEY UPDATE description = VALUES(description)`
  );
  await connection.query(
    `INSERT IGNORE INTO scms_role_permissions (role_id, permission_id)
     SELECT r.id, p.id
     FROM scms_roles r
     CROSS JOIN scms_permissions p
     WHERE r.name = 'Director' AND p.code = 'authority_accounts.reset_password'`
  );
}
