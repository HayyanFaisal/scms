async function addColumnIfMissing(connection, tableName, columnName, definition) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  if (rows.length === 0) await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

export async function up(connection) {
  await addColumnIfMissing(connection, 'Dependent_Children', 'Parent_Selected_Category', 'VARCHAR(20) NULL');
  await addColumnIfMissing(connection, 'Dependent_Children', 'Approved_Category', 'VARCHAR(20) NULL');

  await connection.query(`
    UPDATE Dependent_Children
    SET Parent_Selected_Category = COALESCE(Parent_Selected_Category, Disability_Category, Category)
    WHERE Parent_Selected_Category IS NULL
  `);
  await connection.query(`
    UPDATE Dependent_Children
    SET Approved_Category = COALESCE(Approved_Category, Disability_Category, Category)
    WHERE Approved_Category IS NULL AND (Status IS NULL OR Status = 'approved')
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_child_category_decisions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      child_id INT NOT NULL,
      claimed_category VARCHAR(20) NULL,
      approved_category VARCHAR(20) NOT NULL,
      reason VARCHAR(500) NOT NULL,
      decided_by BIGINT UNSIGNED NULL,
      decided_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_category_decision_child FOREIGN KEY (child_id)
        REFERENCES Dependent_Children(Child_ID) ON DELETE CASCADE,
      CONSTRAINT fk_category_decision_actor FOREIGN KEY (decided_by)
        REFERENCES scms_users(id) ON DELETE SET NULL,
      INDEX idx_category_decision_child_time (child_id, decided_at)
    ) ENGINE=InnoDB
  `);
}
