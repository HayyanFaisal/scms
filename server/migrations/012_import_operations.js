async function addColumnIfMissing(
  connection,
  tableName,
  columnName,
  definition,
) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );
  if (rows.length === 0)
    await connection.query(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`,
    );
}

async function addIndexIfMissing(connection, tableName, indexName, columns) {
  const [rows] = await connection.query(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [tableName, indexName],
  );
  if (rows.length === 0)
    await connection.query(
      `CREATE INDEX ${indexName} ON ${tableName} (${columns})`,
    );
}

export async function up(connection) {
  await addColumnIfMissing(
    connection,
    "scms_import_jobs",
    "execution_started_by",
    "BIGINT UNSIGNED NULL",
  );
  await addColumnIfMissing(
    connection,
    "scms_import_jobs",
    "execution_started_at",
    "DATETIME(3) NULL",
  );
  await addColumnIfMissing(
    connection,
    "scms_import_jobs",
    "rollback_status",
    "VARCHAR(30) NOT NULL DEFAULT 'not_started'",
  );
  await addColumnIfMissing(
    connection,
    "scms_import_jobs",
    "rollback_reason",
    "VARCHAR(1000) NULL",
  );
  await addColumnIfMissing(
    connection,
    "scms_import_jobs",
    "rollback_started_at",
    "DATETIME(3) NULL",
  );
  await addColumnIfMissing(
    connection,
    "scms_import_jobs",
    "rolled_back_by",
    "BIGINT UNSIGNED NULL",
  );
  await addColumnIfMissing(
    connection,
    "scms_import_jobs",
    "rolled_back_at",
    "DATETIME(3) NULL",
  );
  await addColumnIfMissing(
    connection,
    "scms_import_jobs",
    "rollback_summary",
    "JSON NULL",
  );

  await addColumnIfMissing(
    connection,
    "scms_import_rows",
    "rollback_status",
    "VARCHAR(30) NOT NULL DEFAULT 'not_started'",
  );
  await addColumnIfMissing(
    connection,
    "scms_import_rows",
    "rollback_details",
    "JSON NULL",
  );
  await addColumnIfMissing(
    connection,
    "scms_import_rows",
    "rolled_back_at",
    "DATETIME(3) NULL",
  );

  await addIndexIfMissing(
    connection,
    "scms_import_jobs",
    "idx_import_jobs_rollback_status",
    "rollback_status, rolled_back_at",
  );
  await addIndexIfMissing(
    connection,
    "scms_import_rows",
    "idx_import_rows_rollback_status",
    "import_job_id, rollback_status, source_row_number",
  );
}
