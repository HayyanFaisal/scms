async function addColumnIfMissing(connection, tableName, columnName, definition) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  if (rows.length === 0) await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

export async function up(connection) {
  await connection.query("ALTER TABLE Approval_Requests MODIFY COLUMN request_type VARCHAR(50) NOT NULL");
  await connection.query("ALTER TABLE Approval_Requests MODIFY COLUMN status VARCHAR(40) NULL DEFAULT 'pending'");
  await addColumnIfMissing(connection, 'Approval_Requests', 'admin_response', 'VARCHAR(1000) NULL');
}
