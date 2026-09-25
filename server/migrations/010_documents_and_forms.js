const newPermissions = [
  ['forms.read', 'View configured forms and permitted submissions'],
  ['forms.submit', 'Create and submit structured form responses'],
  ['forms.review', 'Review structured form submissions'],
  ['forms.manage', 'Create, publish, and retire form templates'],
  ['messages.read', 'View record-scoped correspondence'],
  ['messages.send', 'Send record-scoped correspondence']
];

export async function up(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_document_types (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(80) NOT NULL,
      name VARCHAR(160) NOT NULL,
      description VARCHAR(1000) NULL,
      entity_scope VARCHAR(30) NOT NULL,
      fulfillment_mode VARCHAR(20) NOT NULL DEFAULT 'upload',
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      draft_definition JSON NOT NULL,
      current_version_number INT UNSIGNED NOT NULL DEFAULT 0,
      row_version INT UNSIGNED NOT NULL DEFAULT 1,
      created_by BIGINT UNSIGNED NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_document_type_code (code),
      CONSTRAINT fk_document_type_creator FOREIGN KEY (created_by) REFERENCES scms_users(id) ON DELETE SET NULL,
      INDEX idx_document_type_scope_status (entity_scope, status)
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_document_type_versions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      document_type_id BIGINT UNSIGNED NOT NULL,
      version_number INT UNSIGNED NOT NULL,
      definition JSON NOT NULL,
      definition_checksum CHAR(64) NOT NULL,
      published_by BIGINT UNSIGNED NULL,
      published_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_document_type_version (document_type_id, version_number),
      CONSTRAINT fk_document_version_type FOREIGN KEY (document_type_id) REFERENCES scms_document_types(id),
      CONSTRAINT fk_document_version_publisher FOREIGN KEY (published_by) REFERENCES scms_users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_document_requirements (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      document_type_id BIGINT UNSIGNED NOT NULL,
      document_type_version_id BIGINT UNSIGNED NOT NULL,
      is_required BOOLEAN NOT NULL DEFAULT FALSE,
      applicability JSON NULL,
      effective_from DATE NOT NULL,
      effective_to DATE NULL,
      display_order INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by BIGINT UNSIGNED NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_document_requirement_type FOREIGN KEY (document_type_id) REFERENCES scms_document_types(id),
      CONSTRAINT fk_document_requirement_version FOREIGN KEY (document_type_version_id) REFERENCES scms_document_type_versions(id),
      CONSTRAINT fk_document_requirement_creator FOREIGN KEY (created_by) REFERENCES scms_users(id) ON DELETE SET NULL,
      INDEX idx_document_requirement_active (is_active, effective_from, effective_to, display_order)
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_document_files (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      document_type_id BIGINT UNSIGNED NOT NULL,
      document_type_version_id BIGINT UNSIGNED NOT NULL,
      requirement_id BIGINT UNSIGNED NULL,
      owner_type VARCHAR(30) NOT NULL,
      owner_id VARCHAR(100) NOT NULL,
      parent_p_no_o_no VARCHAR(50) NOT NULL,
      version_number INT UNSIGNED NOT NULL,
      original_file_name VARCHAR(255) NOT NULL,
      storage_key CHAR(64) NOT NULL,
      verified_mime_type VARCHAR(100) NOT NULL,
      file_size_bytes BIGINT UNSIGNED NOT NULL,
      checksum_sha256 CHAR(64) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending_review',
      expires_on DATE NULL,
      supersedes_file_id BIGINT UNSIGNED NULL,
      uploaded_by_type VARCHAR(20) NOT NULL,
      uploaded_by_id VARCHAR(100) NOT NULL,
      uploaded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      reviewed_by BIGINT UNSIGNED NULL,
      reviewed_at DATETIME(3) NULL,
      review_reason VARCHAR(1000) NULL,
      UNIQUE KEY uq_document_storage_key (storage_key),
      UNIQUE KEY uq_document_owner_version (document_type_id, owner_type, owner_id, version_number),
      CONSTRAINT fk_document_file_type FOREIGN KEY (document_type_id) REFERENCES scms_document_types(id),
      CONSTRAINT fk_document_file_type_version FOREIGN KEY (document_type_version_id) REFERENCES scms_document_type_versions(id),
      CONSTRAINT fk_document_file_requirement FOREIGN KEY (requirement_id) REFERENCES scms_document_requirements(id) ON DELETE SET NULL,
      CONSTRAINT fk_document_file_parent FOREIGN KEY (parent_p_no_o_no) REFERENCES Parent_Beneficiary(P_No_O_No) ON DELETE CASCADE,
      CONSTRAINT fk_document_file_supersedes FOREIGN KEY (supersedes_file_id) REFERENCES scms_document_files(id) ON DELETE SET NULL,
      CONSTRAINT fk_document_file_reviewer FOREIGN KEY (reviewed_by) REFERENCES scms_users(id) ON DELETE SET NULL,
      INDEX idx_document_owner (owner_type, owner_id, status),
      INDEX idx_document_parent (parent_p_no_o_no, uploaded_at),
      INDEX idx_document_review_queue (status, uploaded_at)
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_document_reviews (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      document_file_id BIGINT UNSIGNED NOT NULL,
      decision VARCHAR(30) NOT NULL,
      reason VARCHAR(1000) NULL,
      reviewer_id BIGINT UNSIGNED NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_document_review_file FOREIGN KEY (document_file_id) REFERENCES scms_document_files(id) ON DELETE CASCADE,
      CONSTRAINT fk_document_review_user FOREIGN KEY (reviewer_id) REFERENCES scms_users(id),
      INDEX idx_document_review_history (document_file_id, created_at)
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_form_templates (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(80) NOT NULL,
      name VARCHAR(160) NOT NULL,
      description VARCHAR(1000) NULL,
      entity_scope VARCHAR(30) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      draft_schema JSON NOT NULL,
      current_version_number INT UNSIGNED NOT NULL DEFAULT 0,
      row_version INT UNSIGNED NOT NULL DEFAULT 1,
      created_by BIGINT UNSIGNED NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_form_template_code (code),
      CONSTRAINT fk_form_template_creator FOREIGN KEY (created_by) REFERENCES scms_users(id) ON DELETE SET NULL,
      INDEX idx_form_template_scope_status (entity_scope, status)
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_form_template_versions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      form_template_id BIGINT UNSIGNED NOT NULL,
      version_number INT UNSIGNED NOT NULL,
      schema_json JSON NOT NULL,
      schema_checksum CHAR(64) NOT NULL,
      effective_from DATE NOT NULL,
      effective_to DATE NULL,
      published_by BIGINT UNSIGNED NULL,
      published_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_form_template_version (form_template_id, version_number),
      CONSTRAINT fk_form_version_template FOREIGN KEY (form_template_id) REFERENCES scms_form_templates(id),
      CONSTRAINT fk_form_version_publisher FOREIGN KEY (published_by) REFERENCES scms_users(id) ON DELETE SET NULL,
      INDEX idx_form_version_effective (effective_from, effective_to)
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_form_submissions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      form_template_id BIGINT UNSIGNED NOT NULL,
      form_template_version_id BIGINT UNSIGNED NOT NULL,
      owner_type VARCHAR(30) NOT NULL,
      owner_id VARCHAR(100) NOT NULL,
      parent_p_no_o_no VARCHAR(50) NOT NULL,
      revision_number INT UNSIGNED NOT NULL DEFAULT 1,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      response_json JSON NOT NULL,
      submitted_by_type VARCHAR(20) NOT NULL,
      submitted_by_id VARCHAR(100) NOT NULL,
      submitted_at DATETIME(3) NULL,
      reviewed_by BIGINT UNSIGNED NULL,
      reviewed_at DATETIME(3) NULL,
      review_reason VARCHAR(1000) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_form_owner_revision (form_template_id, owner_type, owner_id, revision_number),
      CONSTRAINT fk_form_submission_template FOREIGN KEY (form_template_id) REFERENCES scms_form_templates(id),
      CONSTRAINT fk_form_submission_version FOREIGN KEY (form_template_version_id) REFERENCES scms_form_template_versions(id),
      CONSTRAINT fk_form_submission_parent FOREIGN KEY (parent_p_no_o_no) REFERENCES Parent_Beneficiary(P_No_O_No) ON DELETE CASCADE,
      CONSTRAINT fk_form_submission_reviewer FOREIGN KEY (reviewed_by) REFERENCES scms_users(id) ON DELETE SET NULL,
      INDEX idx_form_submission_owner (owner_type, owner_id, status),
      INDEX idx_form_submission_review (status, submitted_at)
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_message_threads (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      owner_type VARCHAR(30) NOT NULL,
      owner_id VARCHAR(100) NOT NULL,
      parent_p_no_o_no VARCHAR(50) NOT NULL,
      subject VARCHAR(200) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'open',
      created_by_type VARCHAR(20) NOT NULL,
      created_by_id VARCHAR(100) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_message_thread_parent FOREIGN KEY (parent_p_no_o_no) REFERENCES Parent_Beneficiary(P_No_O_No) ON DELETE CASCADE,
      INDEX idx_message_thread_owner (owner_type, owner_id, status),
      INDEX idx_message_thread_parent (parent_p_no_o_no, updated_at)
    ) ENGINE=InnoDB
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS scms_messages (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      thread_id BIGINT UNSIGNED NOT NULL,
      sender_type VARCHAR(20) NOT NULL,
      sender_id VARCHAR(100) NOT NULL,
      body VARCHAR(4000) NOT NULL,
      is_internal BOOLEAN NOT NULL DEFAULT FALSE,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_message_thread FOREIGN KEY (thread_id) REFERENCES scms_message_threads(id) ON DELETE CASCADE,
      INDEX idx_message_thread_time (thread_id, created_at)
    ) ENGINE=InnoDB
  `);

  for (const [code, description] of newPermissions) {
    await connection.query(
      'INSERT IGNORE INTO scms_permissions (code, description) VALUES (?, ?)',
      [code, description]
    );
  }
  await connection.query(`
    INSERT IGNORE INTO scms_role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM scms_roles r CROSS JOIN scms_permissions p
    WHERE r.is_protected = TRUE AND p.code IN ('forms.read','forms.submit','forms.review','forms.manage','messages.read','messages.send')
  `);
  await connection.query(`
    INSERT IGNORE INTO scms_role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM scms_roles r CROSS JOIN scms_permissions p
    WHERE r.name = 'Admin' AND p.code IN ('forms.read','forms.submit','forms.review','forms.manage','messages.read','messages.send')
  `);
  await connection.query(`
    INSERT IGNORE INTO scms_role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM scms_roles r CROSS JOIN scms_permissions p
    WHERE r.name = 'Support' AND p.code IN ('forms.read','messages.read','messages.send')
  `);
}
