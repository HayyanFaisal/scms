async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

export async function up(connection) {
  if (!(await columnExists(connection, 'scms_users', 'temporary_password_expires_at'))) {
    await connection.query(
      'ALTER TABLE scms_users ADD COLUMN temporary_password_expires_at DATETIME(3) NULL AFTER must_change_password'
    );
  }

  if (!(await columnExists(connection, 'scms_data_scopes', 'is_builtin'))) {
    await connection.query(
      'ALTER TABLE scms_data_scopes ADD COLUMN is_builtin BOOLEAN NOT NULL DEFAULT FALSE AFTER configuration'
    );
  }

  await connection.query(
    `UPDATE scms_data_scopes
     SET is_builtin = TRUE
     WHERE name IN ('All records', 'No records')`
  );
}
