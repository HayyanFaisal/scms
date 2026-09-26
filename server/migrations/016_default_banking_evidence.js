import crypto from 'crypto';

export async function up(connection) {
  const [[existingRequirement]] = await connection.query(
    `SELECT r.id FROM scms_document_requirements r
     INNER JOIN scms_document_types t ON t.id = r.document_type_id
     WHERE t.entity_scope = 'banking' AND t.status = 'published'
       AND r.is_active = TRUE AND r.is_required = TRUE
       AND (r.effective_to IS NULL OR r.effective_to >= CURRENT_DATE())
     LIMIT 1`,
  );
  if (existingRequirement) return;

  const [[existingType]] = await connection.query(
    `SELECT id FROM scms_document_types WHERE code = 'BANK_ACCOUNT_EVIDENCE' LIMIT 1`,
  );
  if (existingType) return;

  const [[director]] = await connection.query(
    `SELECT u.id FROM scms_users u
     INNER JOIN scms_user_roles ur ON ur.user_id = u.id
     INNER JOIN scms_roles r ON r.id = ur.role_id
     WHERE r.name = 'Director' AND u.is_active = TRUE ORDER BY u.id LIMIT 1`,
  );
  const definition = {
    instructions: 'Upload a clear bank certificate, cancelled cheque, or account-maintenance certificate showing the account title and number.',
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    maximumBytes: 5 * 1024 * 1024,
    maximumFiles: 1,
    requiresExpiry: false,
    requiresReupload: true,
  };
  const serialized = JSON.stringify(definition);
  const checksum = crypto.createHash('sha256').update(serialized).digest('hex');
  const [type] = await connection.query(
    `INSERT INTO scms_document_types
      (code, name, description, entity_scope, fulfillment_mode, status, draft_definition,
       current_version_number, row_version, created_by)
     VALUES ('BANK_ACCOUNT_EVIDENCE', 'Bank Account Evidence',
       'Proof that the configured account belongs to the beneficiary or authorized account holder.',
       'banking', 'upload', 'published', ?, 1, 1, ?)`,
    [serialized, director?.id || null],
  );
  const [version] = await connection.query(
    `INSERT INTO scms_document_type_versions
      (document_type_id, version_number, definition, definition_checksum, published_by)
     VALUES (?, 1, ?, ?, ?)`,
    [type.insertId, serialized, checksum, director?.id || null],
  );
  await connection.query(
    `INSERT INTO scms_document_requirements
      (document_type_id, document_type_version_id, is_required, applicability,
       effective_from, display_order, is_active, created_by)
     VALUES (?, ?, TRUE, JSON_OBJECT(), CURRENT_DATE(), 10, TRUE, ?)`,
    [type.insertId, version.insertId, director?.id || null],
  );
}
