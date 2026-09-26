const paymentPermissions = [
  ['payments.read', 'View payment batches and confirmations'],
  ['payments.manage', 'Prepare and cancel payment batches'],
  ['payments.approve', 'Approve prepared payment batches'],
  ['payments.export', 'Export approved payment instructions with banking fields'],
  ['payments.confirm', 'Record bank payment outcomes and references'],
  ['budgets.read', 'View fiscal program budgets and utilization'],
  ['budgets.manage', 'Create and confirm fiscal program budgets'],
];

async function assign(connection, roleName, codes) {
  const [[role]] = await connection.query('SELECT id FROM scms_roles WHERE name = ?', [roleName]);
  if (!role) return;
  for (const code of codes) {
    await connection.query(
      `INSERT IGNORE INTO scms_role_permissions (role_id, permission_id)
       SELECT ?, id FROM scms_permissions WHERE code = ?`,
      [role.id, code],
    );
  }
}

export async function up(connection) {
  for (const [code, description] of paymentPermissions) {
    await connection.query(
      `INSERT INTO scms_permissions (code, description) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE description = VALUES(description)`,
      [code, description],
    );
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_fiscal_budgets (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      fiscal_year VARCHAR(9) NOT NULL,
      program_code VARCHAR(50) NOT NULL DEFAULT 'MONTHLY_GRANT',
      authority_code VARCHAR(160) NOT NULL,
      approved_amount DECIMAL(15,2) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      reason VARCHAR(1000) NOT NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      confirmed_by BIGINT UNSIGNED NULL,
      confirmed_at DATETIME(3) NULL,
      row_version INT UNSIGNED NOT NULL DEFAULT 1,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_fiscal_budget (fiscal_year, program_code, authority_code),
      INDEX idx_fiscal_budget_status (status, fiscal_year),
      CONSTRAINT fk_fiscal_budget_creator FOREIGN KEY (created_by) REFERENCES scms_users(id),
      CONSTRAINT fk_fiscal_budget_confirmer FOREIGN KEY (confirmed_by) REFERENCES scms_users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_payment_batches (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      batch_number VARCHAR(50) NOT NULL,
      payment_month DATE NOT NULL,
      fiscal_year VARCHAR(9) NOT NULL,
      authority_code VARCHAR(160) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      line_count INT UNSIGNED NOT NULL DEFAULT 0,
      total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      exclusion_summary JSON NOT NULL,
      preparation_reason VARCHAR(1000) NOT NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      approved_by BIGINT UNSIGNED NULL,
      approved_at DATETIME(3) NULL,
      exported_by BIGINT UNSIGNED NULL,
      exported_at DATETIME(3) NULL,
      export_sha256 CHAR(64) NULL,
      confirmed_by BIGINT UNSIGNED NULL,
      confirmed_at DATETIME(3) NULL,
      cancelled_by BIGINT UNSIGNED NULL,
      cancelled_at DATETIME(3) NULL,
      cancellation_reason VARCHAR(1000) NULL,
      row_version INT UNSIGNED NOT NULL DEFAULT 1,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_payment_batch_number (batch_number),
      INDEX idx_payment_batch_period (payment_month, authority_code, status),
      CONSTRAINT fk_payment_batch_creator FOREIGN KEY (created_by) REFERENCES scms_users(id),
      CONSTRAINT fk_payment_batch_approver FOREIGN KEY (approved_by) REFERENCES scms_users(id) ON DELETE SET NULL,
      CONSTRAINT fk_payment_batch_exporter FOREIGN KEY (exported_by) REFERENCES scms_users(id) ON DELETE SET NULL,
      CONSTRAINT fk_payment_batch_confirmer FOREIGN KEY (confirmed_by) REFERENCES scms_users(id) ON DELETE SET NULL,
      CONSTRAINT fk_payment_batch_canceller FOREIGN KEY (cancelled_by) REFERENCES scms_users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_payment_lines (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      batch_id BIGINT UNSIGNED NOT NULL,
      grant_id INT NOT NULL,
      child_id INT NOT NULL,
      parent_p_no_o_no VARCHAR(50) NOT NULL,
      banking_account_id INT NOT NULL,
      payment_month DATE NOT NULL,
      category VARCHAR(100) NOT NULL,
      rate_schedule_id BIGINT UNSIGNED NULL,
      amount DECIMAL(15,2) NOT NULL,
      grant_snapshot JSON NOT NULL,
      banking_snapshot JSON NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      duplicate_guard VARCHAR(100) NULL,
      latest_reference VARCHAR(200) NULL,
      latest_reason VARCHAR(1000) NULL,
      confirmed_at DATETIME(3) NULL,
      row_version INT UNSIGNED NOT NULL DEFAULT 1,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_payment_duplicate_guard (duplicate_guard),
      INDEX idx_payment_line_batch_status (batch_id, status),
      INDEX idx_payment_line_parent_period (parent_p_no_o_no, payment_month),
      CONSTRAINT fk_payment_line_batch FOREIGN KEY (batch_id) REFERENCES scms_payment_batches(id),
      CONSTRAINT fk_payment_line_grant FOREIGN KEY (grant_id) REFERENCES Monthly_Grants(Grant_ID),
      CONSTRAINT fk_payment_line_child FOREIGN KEY (child_id) REFERENCES Dependent_Children(Child_ID),
      CONSTRAINT fk_payment_line_parent FOREIGN KEY (parent_p_no_o_no) REFERENCES Parent_Beneficiary(P_No_O_No),
      CONSTRAINT fk_payment_line_banking FOREIGN KEY (banking_account_id) REFERENCES Banking_Details(Account_ID),
      CONSTRAINT fk_payment_line_rate FOREIGN KEY (rate_schedule_id) REFERENCES scms_category_rate_schedules(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_payment_confirmations (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      payment_line_id BIGINT UNSIGNED NOT NULL,
      attempt_number INT UNSIGNED NOT NULL,
      outcome VARCHAR(30) NOT NULL,
      bank_reference VARCHAR(200) NULL,
      reason VARCHAR(1000) NULL,
      confirmed_by BIGINT UNSIGNED NOT NULL,
      confirmed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_payment_confirmation_attempt (payment_line_id, attempt_number),
      INDEX idx_payment_confirmation_outcome (outcome, confirmed_at),
      CONSTRAINT fk_payment_confirmation_line FOREIGN KEY (payment_line_id) REFERENCES scms_payment_lines(id),
      CONSTRAINT fk_payment_confirmation_user FOREIGN KEY (confirmed_by) REFERENCES scms_users(id)
    ) ENGINE=InnoDB
  `);

  const directorCodes = paymentPermissions.map(([code]) => code);
  const adminCodes = ['payments.read', 'payments.manage', 'payments.approve', 'payments.export', 'payments.confirm', 'budgets.read'];
  await assign(connection, 'Director', directorCodes);
  await assign(connection, 'Admin', adminCodes);
}
