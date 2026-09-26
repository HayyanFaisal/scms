const importPermissions = [
  ['imports.rollback', 'Roll back an executed import when the job is eligible']
];

export async function up(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_import_jobs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      original_file_name VARCHAR(255) NOT NULL,
      storage_key CHAR(64) NOT NULL,
      file_format VARCHAR(12) NOT NULL,
      file_size_bytes BIGINT UNSIGNED NOT NULL,
      checksum_sha256 CHAR(64) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'uploaded',
      import_profile VARCHAR(30) NULL,
      selected_sheet VARCHAR(160) NULL,
      header_row INT UNSIGNED NULL,
      source_metadata JSON NOT NULL,
      mapping_json JSON NULL,
      transforms_json JSON NULL,
      total_rows INT UNSIGNED NOT NULL DEFAULT 0,
      valid_rows INT UNSIGNED NOT NULL DEFAULT 0,
      warning_rows INT UNSIGNED NOT NULL DEFAULT 0,
      invalid_rows INT UNSIGNED NOT NULL DEFAULT 0,
      conflict_rows INT UNSIGNED NOT NULL DEFAULT 0,
      executed_rows INT UNSIGNED NOT NULL DEFAULT 0,
      skipped_rows INT UNSIGNED NOT NULL DEFAULT 0,
      progress_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
      last_error VARCHAR(1000) NULL,
      heartbeat_at DATETIME(3) NULL,
      row_version INT UNSIGNED NOT NULL DEFAULT 1,
      created_by BIGINT UNSIGNED NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      completed_at DATETIME(3) NULL,
      UNIQUE KEY uq_import_job_storage_key (storage_key),
      INDEX idx_import_jobs_status_created (status, created_at),
      INDEX idx_import_jobs_creator_created (created_by, created_at),
      CONSTRAINT fk_import_job_creator FOREIGN KEY (created_by) REFERENCES scms_users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_import_rows (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      import_job_id BIGINT UNSIGNED NOT NULL,
      sheet_name VARCHAR(160) NOT NULL,
      source_row_number INT UNSIGNED NOT NULL,
      row_fingerprint CHAR(64) NOT NULL,
      raw_data JSON NOT NULL,
      mapped_data JSON NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'staged',
      issues JSON NULL,
      proposed_action VARCHAR(30) NULL,
      target_parent_p_no_o_no VARCHAR(50) NULL,
      target_child_id INT NULL,
      before_values JSON NULL,
      after_values JSON NULL,
      executed_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_import_row_source (import_job_id, sheet_name, source_row_number),
      INDEX idx_import_rows_job_status (import_job_id, status, source_row_number),
      INDEX idx_import_rows_fingerprint (row_fingerprint),
      CONSTRAINT fk_import_row_job FOREIGN KEY (import_job_id) REFERENCES scms_import_jobs(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_import_conflicts (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      import_job_id BIGINT UNSIGNED NOT NULL,
      import_row_id BIGINT UNSIGNED NOT NULL,
      conflict_type VARCHAR(50) NOT NULL,
      field_code VARCHAR(100) NULL,
      existing_value JSON NULL,
      incoming_value JSON NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      resolution VARCHAR(30) NULL,
      resolved_value JSON NULL,
      resolution_note VARCHAR(1000) NULL,
      resolved_by BIGINT UNSIGNED NULL,
      resolved_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_import_conflicts_job_status (import_job_id, status, id),
      CONSTRAINT fk_import_conflict_job FOREIGN KEY (import_job_id) REFERENCES scms_import_jobs(id) ON DELETE CASCADE,
      CONSTRAINT fk_import_conflict_row FOREIGN KEY (import_row_id) REFERENCES scms_import_rows(id) ON DELETE CASCADE,
      CONSTRAINT fk_import_conflict_resolver FOREIGN KEY (resolved_by) REFERENCES scms_users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_import_mapping_templates (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      import_profile VARCHAR(30) NOT NULL,
      header_signature CHAR(64) NOT NULL,
      mapping_json JSON NOT NULL,
      transforms_json JSON NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      row_version INT UNSIGNED NOT NULL DEFAULT 1,
      created_by BIGINT UNSIGNED NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_import_mapping_name (name),
      INDEX idx_import_mapping_profile_signature (import_profile, header_signature, is_active),
      CONSTRAINT fk_import_mapping_creator FOREIGN KEY (created_by) REFERENCES scms_users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_import_logs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      import_job_id BIGINT UNSIGNED NOT NULL,
      level VARCHAR(12) NOT NULL DEFAULT 'info',
      event_code VARCHAR(80) NOT NULL,
      message VARCHAR(1000) NOT NULL,
      details JSON NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_import_logs_job_created (import_job_id, created_at, id),
      CONSTRAINT fk_import_log_job FOREIGN KEY (import_job_id) REFERENCES scms_import_jobs(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  for (const [code, description] of importPermissions) {
    await connection.query(
      `INSERT INTO scms_permissions (code, description)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE description = VALUES(description)`,
      [code, description]
    );
  }

  await connection.query(`
    INSERT IGNORE INTO scms_role_permissions (role_id, permission_id)
    SELECT role.id, permission.id
    FROM scms_roles role
    INNER JOIN scms_permissions permission ON permission.code = 'imports.rollback'
    WHERE role.name = 'Director'
  `);
}
