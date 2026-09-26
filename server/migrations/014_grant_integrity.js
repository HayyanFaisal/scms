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
  await addColumnIfMissing(connection, 'Monthly_Grants', 'Rate_Schedule_ID', 'BIGINT UNSIGNED NULL');
  await addColumnIfMissing(connection, 'Monthly_Grants', 'Rate_Effective_From', 'DATE NULL');
  await addColumnIfMissing(connection, 'Monthly_Grants', 'Status', "VARCHAR(24) NOT NULL DEFAULT 'approved'");
  await addColumnIfMissing(connection, 'Monthly_Grants', 'Created_By', 'BIGINT UNSIGNED NULL');
  await addColumnIfMissing(connection, 'Monthly_Grants', 'Created_At', 'DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)');
  await addColumnIfMissing(connection, 'Monthly_Grants', 'Updated_At', 'DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)');
  await addColumnIfMissing(connection, 'Monthly_Grants', 'Row_Version', 'INT UNSIGNED NOT NULL DEFAULT 1');
  await addIndexIfMissing(connection, 'Monthly_Grants', 'idx_grant_child_period', 'INDEX idx_grant_child_period (Child_ID, Approved_From, Approved_To)');
  await addIndexIfMissing(connection, 'Monthly_Grants', 'idx_grant_rate_schedule', 'INDEX idx_grant_rate_schedule (Rate_Schedule_ID)');

  const [rateForeignKey] = await connection.query(
    `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'monthly_grants'
       AND CONSTRAINT_NAME = 'fk_grant_rate_schedule'`,
  );
  if (rateForeignKey.length === 0) {
    await connection.query(
      `ALTER TABLE Monthly_Grants ADD CONSTRAINT fk_grant_rate_schedule
       FOREIGN KEY (Rate_Schedule_ID) REFERENCES scms_category_rate_schedules(id) ON DELETE RESTRICT`,
    );
  }

  const [creatorForeignKey] = await connection.query(
    `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'monthly_grants'
       AND CONSTRAINT_NAME = 'fk_grant_creator'`,
  );
  if (creatorForeignKey.length === 0) {
    await connection.query(
      `ALTER TABLE Monthly_Grants ADD CONSTRAINT fk_grant_creator
       FOREIGN KEY (Created_By) REFERENCES scms_users(id) ON DELETE SET NULL`,
    );
  }
}
