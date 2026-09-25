function normalizeIdentifier(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function addColumnIfMissing(connection, tableName, columnName, definition) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  if (rows.length === 0) await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function missingParentFields(parent) {
  const fields = [
    ['Parent_Name', 'parentName'], ['Rank_Rate', 'rankRate'], ['Unit', 'unit'],
    ['Service_Status', 'serviceStatus'], ['Parent_CNIC', 'cnic']
  ];
  return fields.filter(([column]) => !String(parent[column] || '').trim()).map(([, code]) => code);
}

function missingChildFields(child) {
  const fields = [
    ['Child_Name', 'childName'], ['Age', 'age'], ['CNIC_BForm_No', 'cnicBformNo'],
    ['School', 'school'], ['Parent_Selected_Category', 'parentSelectedCategory']
  ];
  return fields.filter(([column]) => !String(child[column] || '').trim()).map(([, code]) => code);
}

export async function up(connection) {
  await connection.query("ALTER TABLE Parent_Beneficiary MODIFY COLUMN Status VARCHAR(40) NULL DEFAULT 'pending'");
  await connection.query("ALTER TABLE Parent_Beneficiary MODIFY COLUMN Origin VARCHAR(40) NULL DEFAULT 'admin_created'");
  await connection.query("ALTER TABLE Dependent_Children MODIFY COLUMN Status VARCHAR(40) NULL DEFAULT 'pending'");

  await addColumnIfMissing(connection, 'Parent_Beneficiary', 'Record_State', "VARCHAR(30) NOT NULL DEFAULT 'complete'");
  await addColumnIfMissing(connection, 'Parent_Beneficiary', 'Missing_Fields', 'JSON NULL');
  await addColumnIfMissing(connection, 'Parent_Beneficiary', 'Is_Provisional', 'BOOLEAN NOT NULL DEFAULT FALSE');
  await addColumnIfMissing(connection, 'Parent_Beneficiary', 'Claimed_At', 'DATETIME(3) NULL');
  await addColumnIfMissing(connection, 'Parent_Beneficiary', 'Block_Reason', 'VARCHAR(500) NULL');
  await addColumnIfMissing(connection, 'Parent_Beneficiary', 'Blocked_At', 'DATETIME(3) NULL');
  await addColumnIfMissing(connection, 'Dependent_Children', 'Record_State', "VARCHAR(30) NOT NULL DEFAULT 'complete'");
  await addColumnIfMissing(connection, 'Dependent_Children', 'Missing_Fields', 'JSON NULL');
  await addColumnIfMissing(connection, 'Dependent_Children', 'Is_Provisional', 'BOOLEAN NOT NULL DEFAULT FALSE');

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_parent_identifiers (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      parent_p_no_o_no VARCHAR(50) NOT NULL,
      identifier_type VARCHAR(30) NOT NULL,
      normalized_value VARCHAR(100) NOT NULL,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      is_verified BOOLEAN NOT NULL DEFAULT FALSE,
      source VARCHAR(40) NOT NULL DEFAULT 'migration',
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      verified_at DATETIME(3) NULL,
      UNIQUE KEY uq_parent_identifier_value (identifier_type, normalized_value),
      UNIQUE KEY uq_parent_identifier_owner (parent_p_no_o_no, identifier_type, normalized_value),
      CONSTRAINT fk_parent_identifier_parent FOREIGN KEY (parent_p_no_o_no)
        REFERENCES Parent_Beneficiary(P_No_O_No) ON DELETE CASCADE,
      INDEX idx_parent_identifier_owner (parent_p_no_o_no)
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_identity_conflicts (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      identifier_type VARCHAR(30) NOT NULL,
      normalized_value VARCHAR(100) NOT NULL,
      candidate_parent_ids JSON NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'open',
      resolution JSON NULL,
      resolved_by BIGINT UNSIGNED NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      resolved_at DATETIME(3) NULL,
      UNIQUE KEY uq_open_identity_conflict (identifier_type, normalized_value, status),
      CONSTRAINT fk_identity_conflict_resolver FOREIGN KEY (resolved_by)
        REFERENCES scms_users(id) ON DELETE SET NULL,
      INDEX idx_identity_conflict_status (status, created_at)
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_parent_field_policies (
      field_code VARCHAR(50) PRIMARY KEY,
      label VARCHAR(120) NOT NULL,
      update_mode VARCHAR(30) NOT NULL,
      reference_type VARCHAR(40) NULL,
      is_required BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INT NOT NULL DEFAULT 0,
      updated_by BIGINT UNSIGNED NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_parent_field_policy_actor FOREIGN KEY (updated_by)
        REFERENCES scms_users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB
  `);

  const policies = [
    ['parentName', 'Full name', 'approval', null, true, 10],
    ['cnic', 'CNIC', 'approval', null, true, 20],
    ['rankRate', 'Rank / rate', 'approval', 'rank', true, 30],
    ['unit', 'Unit', 'approval', 'unit', true, 40],
    ['adminAuthority', 'Administrative authority', 'approval', 'authority', false, 50],
    ['serviceStatus', 'Service status', 'approval', 'service_status', true, 60],
    ['email', 'Email', 'direct', null, false, 70],
    ['contactNo', 'Contact number', 'direct', null, false, 80],
    ['address', 'Residential address', 'direct', null, false, 90]
  ];
  for (const policy of policies) {
    await connection.query(
      `INSERT IGNORE INTO scms_parent_field_policies
        (field_code, label, update_mode, reference_type, is_required, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      policy
    );
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_parent_change_requests (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      parent_p_no_o_no VARCHAR(50) NOT NULL,
      current_values JSON NOT NULL,
      proposed_values JSON NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      parent_message VARCHAR(1000) NULL,
      review_reason VARCHAR(1000) NULL,
      reviewed_by BIGINT UNSIGNED NULL,
      submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      reviewed_at DATETIME(3) NULL,
      CONSTRAINT fk_parent_change_parent FOREIGN KEY (parent_p_no_o_no)
        REFERENCES Parent_Beneficiary(P_No_O_No) ON DELETE CASCADE,
      CONSTRAINT fk_parent_change_reviewer FOREIGN KEY (reviewed_by)
        REFERENCES scms_users(id) ON DELETE SET NULL,
      INDEX idx_parent_change_status_time (status, submitted_at),
      INDEX idx_parent_change_parent_time (parent_p_no_o_no, submitted_at)
    ) ENGINE=InnoDB
  `);

  const [parents] = await connection.query(
    `SELECT P_No_O_No, Parent_Name, Rank_Rate, Unit, Service_Status, Parent_CNIC
     FROM Parent_Beneficiary`
  );
  for (const parent of parents) {
    const missing = missingParentFields(parent);
    await connection.query(
      `UPDATE Parent_Beneficiary SET Record_State = ?, Missing_Fields = ? WHERE P_No_O_No = ?`,
      [missing.length ? 'incomplete' : 'complete', JSON.stringify(missing), parent.P_No_O_No]
    );
    for (const [type, rawValue] of [['pn', parent.P_No_O_No], ['cnic', parent.Parent_CNIC]]) {
      const normalized = normalizeIdentifier(rawValue);
      if (!normalized) continue;
      try {
        await connection.query(
          `INSERT INTO scms_parent_identifiers
            (parent_p_no_o_no, identifier_type, normalized_value, is_primary, is_verified, source, verified_at)
           VALUES (?, ?, ?, TRUE, TRUE, 'migration', CURRENT_TIMESTAMP(3))`,
          [parent.P_No_O_No, type, normalized]
        );
      } catch (error) {
        if (error?.code !== 'ER_DUP_ENTRY') throw error;
        const [owners] = await connection.query(
          `SELECT parent_p_no_o_no FROM scms_parent_identifiers
           WHERE identifier_type = ? AND normalized_value = ?`,
          [type, normalized]
        );
        const candidates = [...new Set([...owners.map(row => row.parent_p_no_o_no), parent.P_No_O_No])];
        await connection.query(
          `INSERT INTO scms_identity_conflicts
            (identifier_type, normalized_value, candidate_parent_ids)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE candidate_parent_ids = VALUES(candidate_parent_ids)`,
          [type, normalized, JSON.stringify(candidates)]
        );
        await connection.query(
          `UPDATE Parent_Beneficiary SET Record_State = 'conflict_review'
           WHERE P_No_O_No IN (?)`,
          [candidates]
        );
      }
    }
  }

  const [children] = await connection.query(
    `SELECT Child_ID, Child_Name, Age, CNIC_BForm_No, School, Parent_Selected_Category
     FROM Dependent_Children`
  );
  for (const child of children) {
    const missing = missingChildFields(child);
    await connection.query(
      `UPDATE Dependent_Children SET Record_State = ?, Missing_Fields = ? WHERE Child_ID = ?`,
      [missing.length ? 'incomplete' : 'complete', JSON.stringify(missing), child.Child_ID]
    );
  }
}
