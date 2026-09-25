const legacyAuthorities = [
  'HQ COMNOR', 'HQ COMKAR', 'HQ COMCEP', 'HQ PMSA', 'HQ COMPAK',
  'HQ COMCOAST', 'HQ FOST', 'HQ NSFC', 'HQ COMLOG'
];

function stableCode(value) {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .slice(0, 70);
  return normalized || 'ITEM';
}

async function seedItems(connection, itemType, names) {
  let sortOrder = 10;
  for (const rawName of [...new Set(names.map(value => String(value || '').trim()).filter(Boolean))]) {
    const [existing] = await connection.query(
      'SELECT id FROM scms_reference_items WHERE item_type = ? AND name = ?',
      [itemType, rawName]
    );
    if (existing.length > 0) {
      sortOrder += 10;
      continue;
    }
    let code = stableCode(rawName);
    let suffix = 1;
    while (true) {
      try {
        await connection.query(
          `INSERT INTO scms_reference_items
            (item_type, code, name, sort_order, is_active)
           VALUES (?, ?, ?, ?, TRUE)`,
          [itemType, code, rawName, sortOrder]
        );
        break;
      } catch (error) {
        if (error?.code !== 'ER_DUP_ENTRY') throw error;
        code = `${stableCode(rawName).slice(0, 64)}_${suffix++}`;
      }
    }
    sortOrder += 10;
  }
}

async function distinctValues(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT DISTINCT ${column} AS value FROM ${table}
     WHERE ${column} IS NOT NULL AND TRIM(${column}) <> ''`
  );
  return rows.map(row => row.value);
}

export async function up(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_reference_items (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      item_type VARCHAR(40) NOT NULL,
      code VARCHAR(80) NOT NULL,
      name VARCHAR(160) NOT NULL,
      description VARCHAR(500) NULL,
      sort_order INT NOT NULL DEFAULT 0,
      metadata JSON NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by BIGINT UNSIGNED NULL,
      updated_by BIGINT UNSIGNED NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_reference_type_code (item_type, code),
      UNIQUE KEY uq_reference_type_name (item_type, name),
      INDEX idx_reference_type_active_sort (item_type, is_active, sort_order, name),
      CONSTRAINT fk_reference_created_by FOREIGN KEY (created_by) REFERENCES scms_users(id) ON DELETE SET NULL,
      CONSTRAINT fk_reference_updated_by FOREIGN KEY (updated_by) REFERENCES scms_users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_reference_item_history (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      reference_item_id BIGINT UNSIGNED NOT NULL,
      action ENUM('created', 'updated', 'archived', 'reactivated', 'renamed') NOT NULL,
      previous_values JSON NULL,
      new_values JSON NOT NULL,
      changed_by BIGINT UNSIGNED NULL,
      changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_reference_history_item FOREIGN KEY (reference_item_id) REFERENCES scms_reference_items(id) ON DELETE RESTRICT,
      CONSTRAINT fk_reference_history_actor FOREIGN KEY (changed_by) REFERENCES scms_users(id) ON DELETE SET NULL,
      INDEX idx_reference_history_item_time (reference_item_id, changed_at)
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_category_rate_schedules (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      category_item_id BIGINT UNSIGNED NOT NULL,
      monthly_amount DECIMAL(12,2) NOT NULL,
      effective_from DATE NOT NULL,
      effective_to DATE NULL,
      notes VARCHAR(500) NULL,
      published_by BIGINT UNSIGNED NULL,
      published_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_category_rate_start (category_item_id, effective_from),
      INDEX idx_category_rate_period (category_item_id, effective_from, effective_to),
      CONSTRAINT fk_category_rate_category FOREIGN KEY (category_item_id) REFERENCES scms_reference_items(id) ON DELETE RESTRICT,
      CONSTRAINT fk_category_rate_publisher FOREIGN KEY (published_by) REFERENCES scms_users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB
  `);

  await connection.query('ALTER TABLE Parent_Beneficiary MODIFY COLUMN Service_Status VARCHAR(50) NULL');
  await connection.query('ALTER TABLE Dependent_Children MODIFY COLUMN Disability_Category VARCHAR(20) NULL');
  await connection.query('ALTER TABLE Dependent_Children MODIFY COLUMN Category VARCHAR(20) NULL');
  await connection.query('ALTER TABLE Monthly_Grants MODIFY COLUMN Category VARCHAR(20) NULL');

  await seedItems(connection, 'authority', [
    ...legacyAuthorities,
    ...(await distinctValues(connection, 'Parent_Beneficiary', 'Admin_Authority')),
    ...(await distinctValues(connection, 'Dependent_Children', 'Authority')),
    ...(await distinctValues(connection, 'authority_passwords', 'authority'))
  ]);
  await seedItems(connection, 'school', await distinctValues(connection, 'Dependent_Children', 'School'));
  await seedItems(connection, 'rank', await distinctValues(connection, 'Parent_Beneficiary', 'Rank_Rate'));
  await seedItems(connection, 'unit', await distinctValues(connection, 'Parent_Beneficiary', 'Unit'));
  await seedItems(connection, 'service_status', [
    'Serving', 'Retired', 'Expired',
    ...(await distinctValues(connection, 'Parent_Beneficiary', 'Service_Status'))
  ]);
  await seedItems(connection, 'category', ['A', 'B', 'C']);

  const defaultRates = { A: 25000, B: 20000, C: 15000 };
  for (const [category, amount] of Object.entries(defaultRates)) {
    await connection.query(
      `INSERT IGNORE INTO scms_category_rate_schedules
        (category_item_id, monthly_amount, effective_from, notes)
       SELECT id, ?, '2026-01-01', 'Initial approved default rate'
       FROM scms_reference_items
       WHERE item_type = 'category' AND code = ?`,
      [amount, category]
    );
  }
}
