async function addColumnIfMissing(connection, tableName, columnName, definition) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );
  if (rows.length === 0) {
    await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function addIndexIfMissing(connection, tableName, indexName, definition) {
  const [rows] = await connection.query(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [tableName, indexName],
  );
  if (rows.length === 0) await connection.query(`ALTER TABLE ${tableName} ADD ${definition}`);
}

export async function up(connection) {
  await addColumnIfMissing(connection, 'Banking_Details', 'Verification_Status', "VARCHAR(30) NOT NULL DEFAULT 'pending_evidence'");
  await addColumnIfMissing(connection, 'Banking_Details', 'Review_Reason', 'VARCHAR(1000) NULL');
  await addColumnIfMissing(connection, 'Banking_Details', 'Verified_By', 'BIGINT UNSIGNED NULL');
  await addColumnIfMissing(connection, 'Banking_Details', 'Verified_At', 'DATETIME(3) NULL');
  await addColumnIfMissing(connection, 'Banking_Details', 'Submitted_At', 'DATETIME(3) NULL');
  await addColumnIfMissing(connection, 'Banking_Details', 'Evidence_Required_From', 'DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)');
  await addColumnIfMissing(connection, 'Banking_Details', 'Updated_At', 'DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)');
  await addColumnIfMissing(connection, 'Banking_Details', 'Row_Version', 'INT UNSIGNED NOT NULL DEFAULT 1');
  await addColumnIfMissing(connection, 'Banking_Details', 'Is_Archived', 'BOOLEAN NOT NULL DEFAULT FALSE');
  await addIndexIfMissing(connection, 'Banking_Details', 'idx_banking_parent_active', 'INDEX idx_banking_parent_active (P_No_O_No, Is_Archived)');
  await addIndexIfMissing(connection, 'Banking_Details', 'idx_banking_review_queue', 'INDEX idx_banking_review_queue (Verification_Status, Submitted_At)');

  const [verifierForeignKey] = await connection.query(
    `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'banking_details'
       AND CONSTRAINT_NAME = 'fk_banking_verifier'`,
  );
  if (verifierForeignKey.length === 0) {
    await connection.query(
      `ALTER TABLE Banking_Details ADD CONSTRAINT fk_banking_verifier
       FOREIGN KEY (Verified_By) REFERENCES scms_users(id) ON DELETE SET NULL`,
    );
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_banking_history (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      account_id INT NOT NULL,
      version_number INT UNSIGNED NOT NULL,
      action VARCHAR(40) NOT NULL,
      verification_status VARCHAR(30) NOT NULL,
      snapshot JSON NOT NULL,
      reason VARCHAR(1000) NULL,
      actor_type VARCHAR(20) NOT NULL,
      actor_id VARCHAR(100) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_banking_history_version (account_id, version_number),
      INDEX idx_banking_history_account_time (account_id, created_at),
      CONSTRAINT fk_banking_history_account FOREIGN KEY (account_id)
        REFERENCES Banking_Details(Account_ID) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  await connection.query(
    `INSERT IGNORE INTO scms_permissions (code, description)
     VALUES ('banking.verify', 'Verify or return banking evidence and account details')`,
  );
  await connection.query(
    `INSERT IGNORE INTO scms_role_permissions (role_id, permission_id)
     SELECT r.id, p.id FROM scms_roles r CROSS JOIN scms_permissions p
     WHERE r.name IN ('Director', 'Admin') AND p.code = 'banking.verify'`,
  );

  await connection.query(
    `UPDATE Banking_Details SET Verification_Status = 'pending_evidence'
     WHERE Verification_Status IS NULL OR Verification_Status = ''`,
  );
}
