async function addColumnIfMissing(connection, tableName, columnName, definition) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  if (rows.length === 0) await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

export async function up(connection) {
  await addColumnIfMissing(connection, 'Parent_Beneficiary', 'Must_Change_Password', 'BOOLEAN NOT NULL DEFAULT FALSE');
  await addColumnIfMissing(connection, 'Parent_Beneficiary', 'Temporary_Password_Expires_At', 'DATETIME(3) NULL');
  await addColumnIfMissing(connection, 'Parent_Beneficiary', 'Credential_Version', 'INT UNSIGNED NOT NULL DEFAULT 1');

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_parent_credential_events (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      p_no_o_no VARCHAR(50) NOT NULL,
      event_type ENUM('one_time_password_issued', 'password_changed') NOT NULL,
      actor_user_id BIGINT UNSIGNED NULL,
      expires_at DATETIME(3) NULL,
      occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_parent_credential_event_parent FOREIGN KEY (p_no_o_no)
        REFERENCES Parent_Beneficiary(P_No_O_No) ON DELETE CASCADE,
      CONSTRAINT fk_parent_credential_event_actor FOREIGN KEY (actor_user_id)
        REFERENCES scms_users(id) ON DELETE SET NULL,
      INDEX idx_parent_credential_event_parent_time (p_no_o_no, occurred_at)
    ) ENGINE=InnoDB
  `);
}
