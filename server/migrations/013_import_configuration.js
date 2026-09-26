async function addColumnIfMissing(connection, tableName, columnName, definition) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  if (rows.length === 0) await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

async function addIndexIfMissing(connection, tableName, indexName, definition) {
  const [rows] = await connection.query(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [tableName, indexName]
  );
  if (rows.length === 0) await connection.query(`ALTER TABLE ${tableName} ADD ${definition}`);
}

export async function up(connection) {
  await addColumnIfMissing(connection, 'scms_import_mapping_templates', 'description', 'VARCHAR(500) NULL');
  await addColumnIfMissing(connection, 'scms_import_mapping_templates', 'updated_by', 'BIGINT UNSIGNED NULL');
  await addColumnIfMissing(connection, 'scms_import_mapping_templates', 'archived_at', 'DATETIME(3) NULL');
  await addColumnIfMissing(connection, 'scms_import_jobs', 'source_deleted_at', 'DATETIME(3) NULL');
  await addColumnIfMissing(connection, 'scms_import_jobs', 'source_delete_reason', 'VARCHAR(160) NULL');
  await addIndexIfMissing(
    connection,
    'scms_import_jobs',
    'idx_import_jobs_source_retention',
    'INDEX idx_import_jobs_source_retention (source_deleted_at, status, completed_at, updated_at)'
  );

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_import_heading_aliases (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      field_code VARCHAR(100) NOT NULL,
      alias VARCHAR(160) NOT NULL,
      normalized_alias VARCHAR(160) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by BIGINT UNSIGNED NULL,
      updated_by BIGINT UNSIGNED NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_import_heading_normalized_alias (normalized_alias),
      INDEX idx_import_heading_field_active (field_code, is_active, alias),
      CONSTRAINT fk_import_heading_creator FOREIGN KEY (created_by) REFERENCES scms_users(id) ON DELETE SET NULL,
      CONSTRAINT fk_import_heading_updater FOREIGN KEY (updated_by) REFERENCES scms_users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_import_settings (
      id TINYINT UNSIGNED PRIMARY KEY,
      source_retention_days INT UNSIGNED NOT NULL DEFAULT 90,
      cleanup_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      updated_by BIGINT UNSIGNED NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT chk_import_settings_singleton CHECK (id = 1),
      CONSTRAINT chk_import_source_retention CHECK (source_retention_days BETWEEN 7 AND 3650),
      CONSTRAINT fk_import_settings_updater FOREIGN KEY (updated_by) REFERENCES scms_users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB
  `);
  await connection.query(`
    INSERT IGNORE INTO scms_import_settings (id, source_retention_days, cleanup_enabled)
    VALUES (1, 90, TRUE)
  `);
}
