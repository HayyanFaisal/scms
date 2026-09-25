import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { loadDataScope, scopeAllowsAuthority } from './data-scope.js';

const ENTITY_SCOPES = new Set(['parent', 'child', 'application', 'banking', 'gadget', 'school']);
const FULFILLMENT_MODES = new Set(['upload', 'form', 'either']);
const FIELD_TYPES = new Set(['text', 'long_text', 'number', 'date', 'checkbox', 'radio', 'select']);
const REVIEW_DECISIONS = new Set(['verified', 'changes_required', 'rejected']);
const defaultStorageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.scms-data', 'documents');
export const documentStorageRoot = path.resolve(process.env.SCMS_DOCUMENT_STORAGE_DIR || defaultStorageRoot);

function publicError(message, status = 400, publicCode = 'INVALID_REQUEST') {
  const error = new Error(message);
  error.status = status;
  error.publicCode = publicCode;
  return error;
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function stableCode(value) {
  const code = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!code || code.length > 80) throw publicError('A code containing letters or numbers is required.');
  return code;
}

function validDate(value, fallback = null) {
  if (!value) return fallback;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw publicError('Enter a valid effective date.');
  return String(value).slice(0, 10);
}

function normalizeDocumentDefinition(input = {}) {
  const allowedMimeTypes = Array.isArray(input.allowedMimeTypes)
    ? [...new Set(input.allowedMimeTypes.map(value => String(value).trim().toLowerCase()).filter(Boolean))]
    : ['image/jpeg', 'image/png', 'application/pdf'];
  if (allowedMimeTypes.length === 0 || allowedMimeTypes.length > 12) throw publicError('Choose between 1 and 12 allowed file types.');
  const maximumBytes = Number(input.maximumBytes || 5 * 1024 * 1024);
  const maximumFiles = Number(input.maximumFiles || 1);
  if (!Number.isInteger(maximumBytes) || maximumBytes < 1024 || maximumBytes > 50 * 1024 * 1024) throw publicError('Maximum file size must be between 1 KB and 50 MB.');
  if (!Number.isInteger(maximumFiles) || maximumFiles < 1 || maximumFiles > 20) throw publicError('Maximum file count must be between 1 and 20.');
  return {
    instructions: String(input.instructions || '').trim().slice(0, 2000),
    allowedMimeTypes,
    maximumBytes,
    maximumFiles,
    requiresExpiry: Boolean(input.requiresExpiry),
    requiresReupload: Boolean(input.requiresReupload),
    pageExpectation: String(input.pageExpectation || '').trim().slice(0, 200),
    applicability: input.applicability && typeof input.applicability === 'object' ? input.applicability : {}
  };
}

export function validateFormSchema(input = {}) {
  const sections = Array.isArray(input.sections) ? input.sections : [];
  if (sections.length === 0 || sections.length > 30) throw publicError('A form needs between 1 and 30 sections.');
  const seen = new Set();
  const seenSections = new Set();
  const normalizedSections = sections.map((section, sectionIndex) => {
    const fields = Array.isArray(section.fields) ? section.fields : [];
    if (fields.length === 0 || fields.length > 100) throw publicError('A section needs between 1 and 100 fields.');
    const sectionId = stableCode(section.id || `section_${sectionIndex + 1}`);
    if (seenSections.has(sectionId)) throw publicError(`Duplicate form section id: ${sectionId}`);
    seenSections.add(sectionId);
    return {
      id: sectionId,
      title: String(section.title || `Section ${sectionIndex + 1}`).trim().slice(0, 160),
      instructions: String(section.instructions || '').trim().slice(0, 2000),
      fields: fields.map((field, fieldIndex) => {
        const key = stableCode(field.key || `field_${fieldIndex + 1}`);
        if (seen.has(key)) throw publicError(`Duplicate form field key: ${key}`);
        seen.add(key);
        const type = String(field.type || 'text');
        if (!FIELD_TYPES.has(type)) throw publicError(`Unsupported form field type: ${type}`);
        const options = Array.isArray(field.options) ? [...new Set(field.options.map(value => String(value).trim()).filter(Boolean))].slice(0, 100) : [];
        if (['radio', 'select'].includes(type) && options.length === 0) throw publicError(`${key} needs at least one option.`);
        const rawValidation = field.validation && typeof field.validation === 'object' && !Array.isArray(field.validation) ? field.validation : {};
        const validation = {};
        for (const setting of ['minimumLength', 'maximumLength', 'minimum', 'maximum']) {
          if (rawValidation[setting] === null || rawValidation[setting] === undefined || rawValidation[setting] === '') continue;
          const value = Number(rawValidation[setting]);
          if (!Number.isFinite(value) || value < 0 || value > 1000000) throw publicError(`${key} has an invalid ${setting} rule.`);
          validation[setting] = value;
        }
        if (validation.minimumLength > validation.maximumLength) throw publicError(`${key} has a minimum length greater than its maximum length.`);
        if (validation.minimum > validation.maximum) throw publicError(`${key} has a minimum value greater than its maximum value.`);
        return {
          key,
          label: String(field.label || key).trim().slice(0, 160),
          type,
          required: Boolean(field.required),
          options,
          validation,
          visibility: field.visibility && typeof field.visibility === 'object' ? field.visibility : null,
          helpText: String(field.helpText || '').trim().slice(0, 500)
        };
      })
    };
  });
  return { title: String(input.title || '').trim().slice(0, 160), sections: normalizedSections };
}

export function validateFormResponse(schema, response) {
  const values = response && typeof response === 'object' && !Array.isArray(response) ? response : {};
  const sanitized = {};
  const errors = [];
  for (const section of schema.sections || []) {
    for (const field of section.fields || []) {
      const value = values[field.key];
      const blank = value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
      if (field.required && blank) errors.push(`${field.label} is required.`);
      if (blank) continue;
      if (field.type === 'checkbox') {
        if (typeof value !== 'boolean') errors.push(`${field.label} must be yes or no.`);
        else sanitized[field.key] = value;
        continue;
      }
      if (typeof value === 'object') {
        errors.push(`${field.label} contains an invalid value.`);
        continue;
      }
      if (field.type === 'number') {
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue)) errors.push(`${field.label} must be a number.`);
        else {
          sanitized[field.key] = numberValue;
          if (field.validation?.minimum !== undefined && numberValue < field.validation.minimum) errors.push(`${field.label} is below the minimum value.`);
          if (field.validation?.maximum !== undefined && numberValue > field.validation.maximum) errors.push(`${field.label} is above the maximum value.`);
        }
        continue;
      }
      const stringValue = String(value);
      if (field.type === 'date') {
        const dateValue = new Date(`${stringValue}T00:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(stringValue) || Number.isNaN(dateValue.getTime()) || dateValue.toISOString().slice(0, 10) !== stringValue) {
          errors.push(`${field.label} must be a valid date.`);
        }
      }
      if (['radio', 'select'].includes(field.type) && !field.options.includes(stringValue)) errors.push(`${field.label} contains an invalid choice.`);
      sanitized[field.key] = stringValue;
      const minimumLength = Number(field.validation?.minimumLength || 0);
      const maximumLength = Number(field.validation?.maximumLength || 0);
      if (minimumLength && stringValue.length < minimumLength) errors.push(`${field.label} is too short.`);
      if (maximumLength && stringValue.length > maximumLength) errors.push(`${field.label} is too long.`);
    }
  }
  if (errors.length) throw publicError(errors.slice(0, 10).join(' '), 400, 'FORM_VALIDATION_FAILED');
  return sanitized;
}

export function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return { mime: 'application/pdf', extension: '.pdf' };
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', extension: '.jpg' };
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return { mime: 'image/png', extension: '.png' };
  if (buffer.subarray(0, 4).toString('ascii') === 'GIF8') return { mime: 'image/gif', extension: '.gif' };
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', extension: '.webp' };
  if (buffer.subarray(0, 4).equals(Buffer.from([0x49,0x49,0x2a,0x00])) || buffer.subarray(0, 4).equals(Buffer.from([0x4d,0x4d,0x00,0x2a]))) return { mime: 'image/tiff', extension: '.tiff' };
  return null;
}

export async function resolveDocumentOwner(connection, ownerType, ownerId) {
  const type = String(ownerType || '').toLowerCase();
  const id = String(ownerId || '').trim();
  if (!id) throw publicError('A record identifier is required.');
  if (type === 'parent') {
    const [[parent]] = await connection.query('SELECT P_No_O_No, Admin_Authority FROM Parent_Beneficiary WHERE P_No_O_No = ?', [id]);
    if (!parent) throw publicError('Parent record not found.', 404, 'RECORD_NOT_FOUND');
    return { ownerType: type, ownerId: id, parentPNo: parent.P_No_O_No, authority: parent.Admin_Authority };
  }
  if (type === 'child') {
    const [[child]] = await connection.query(
      `SELECT dc.Child_ID, dc.P_No_O_No, pb.Admin_Authority FROM Dependent_Children dc
       INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = dc.P_No_O_No WHERE dc.Child_ID = ?`, [id]
    );
    if (!child) throw publicError('Child record not found.', 404, 'RECORD_NOT_FOUND');
    return { ownerType: type, ownerId: String(child.Child_ID), parentPNo: child.P_No_O_No, authority: child.Admin_Authority };
  }
  if (type === 'application') {
    const [[application]] = await connection.query(
      `SELECT r.id, pb.P_No_O_No, pb.Admin_Authority FROM Approval_Requests r
       INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = r.user_id WHERE r.id = ?`, [id]
    );
    if (!application) throw publicError('Application record not found.', 404, 'RECORD_NOT_FOUND');
    return { ownerType: type, ownerId: String(application.id), parentPNo: application.P_No_O_No, authority: application.Admin_Authority };
  }
  if (type === 'banking') {
    const [[banking]] = await connection.query(
      `SELECT b.Account_ID, b.P_No_O_No, pb.Admin_Authority FROM Banking_Details b
       INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = b.P_No_O_No WHERE b.Account_ID = ?`, [id]
    );
    if (!banking) throw publicError('Banking record not found.', 404, 'RECORD_NOT_FOUND');
    return { ownerType: type, ownerId: String(banking.Account_ID), parentPNo: banking.P_No_O_No, authority: banking.Admin_Authority };
  }
  if (type === 'gadget') {
    const [[gadget]] = await connection.query(
      `SELECT g.Gadget_ID, dc.P_No_O_No, pb.Admin_Authority FROM Child_Gadgets g
       INNER JOIN Dependent_Children dc ON dc.Child_ID = g.Child_ID
       INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = dc.P_No_O_No WHERE g.Gadget_ID = ?`, [id]
    );
    if (!gadget) throw publicError('Gadget record not found.', 404, 'RECORD_NOT_FOUND');
    return { ownerType: type, ownerId: String(gadget.Gadget_ID), parentPNo: gadget.P_No_O_No, authority: gadget.Admin_Authority };
  }
  throw publicError('This record type is not enabled for document submission yet.');
}

export async function loadDocumentWorkspace(connection, ownerType, ownerId) {
  const owner = await resolveDocumentOwner(connection, ownerType, ownerId);
  const [requirements] = await connection.query(
    `SELECT r.id AS requirement_id, r.is_required, r.display_order,
            t.id AS document_type_id, t.code, t.name, t.description, t.entity_scope,
            t.fulfillment_mode, v.id AS document_type_version_id, v.version_number, v.definition
     FROM scms_document_requirements r
     INNER JOIN scms_document_types t ON t.id = r.document_type_id
     INNER JOIN scms_document_type_versions v ON v.id = r.document_type_version_id
     WHERE r.is_active = TRUE AND t.status = 'published' AND t.entity_scope = ?
       AND r.effective_from <= CURRENT_DATE()
       AND (r.effective_to IS NULL OR r.effective_to >= CURRENT_DATE())
     ORDER BY r.display_order, t.name`, [owner.ownerType]
  );
  const [files] = await connection.query(
    `SELECT id, document_type_id, document_type_version_id, requirement_id, owner_type, owner_id,
            version_number, original_file_name, verified_mime_type, file_size_bytes, checksum_sha256,
            status, expires_on, supersedes_file_id, uploaded_by_type, uploaded_at, reviewed_at, review_reason
     FROM scms_document_files WHERE owner_type = ? AND owner_id = ? ORDER BY uploaded_at DESC`,
    [owner.ownerType, owner.ownerId]
  );
  const [forms] = await connection.query(
    `SELECT t.id AS template_id, t.code, t.name, t.description, t.entity_scope,
            v.id AS template_version_id, v.version_number, v.schema_json,
            s.id AS submission_id, s.revision_number, s.status AS submission_status,
            s.response_json, s.submitted_at, s.review_reason
     FROM scms_form_templates t
     INNER JOIN scms_form_template_versions v ON v.form_template_id = t.id AND v.version_number = t.current_version_number
     LEFT JOIN scms_form_submissions s ON s.form_template_id = t.id AND s.owner_type = ? AND s.owner_id = ?
       AND s.revision_number = (SELECT MAX(s2.revision_number) FROM scms_form_submissions s2 WHERE s2.form_template_id = t.id AND s2.owner_type = ? AND s2.owner_id = ?)
     WHERE t.status = 'published' AND t.entity_scope = ?
       AND v.effective_from <= CURRENT_DATE() AND (v.effective_to IS NULL OR v.effective_to >= CURRENT_DATE())
     ORDER BY t.name`, [owner.ownerType, owner.ownerId, owner.ownerType, owner.ownerId, owner.ownerType]
  );
  return {
    owner,
    requirements: requirements.map(row => ({ ...row, is_required: Boolean(row.is_required), definition: parseJson(row.definition, {}) })),
    files,
    forms: forms.map(row => ({ ...row, schema_json: parseJson(row.schema_json, {}), response_json: parseJson(row.response_json, {}) }))
  };
}

export function missingRequiredUploads(workspace) {
  const currentTypeIds = new Set(
    (workspace?.files || []).filter(file => file.status !== 'superseded').map(file => Number(file.document_type_id))
  );
  return (workspace?.requirements || []).filter(requirement =>
    Boolean(requirement.is_required)
    && ['upload', 'either'].includes(requirement.fulfillment_mode)
    && !currentTypeIds.has(Number(requirement.document_type_id))
  );
}

export async function storeDocumentFile(connection, { file, documentTypeId, ownerType, ownerId, expiresOn, uploaderType, uploaderId }) {
  if (!file?.buffer) throw publicError('Choose a file to upload.');
  const owner = await resolveDocumentOwner(connection, ownerType, ownerId);
  const [[type]] = await connection.query(
    `SELECT t.*, v.id AS type_version_id, v.definition
     FROM scms_document_types t INNER JOIN scms_document_type_versions v
       ON v.document_type_id = t.id AND v.version_number = t.current_version_number
     WHERE t.id = ? AND t.status = 'published'`, [Number(documentTypeId)]
  );
  if (!type || type.entity_scope !== owner.ownerType) throw publicError('Document definition is not available for this record.', 404, 'DOCUMENT_TYPE_NOT_FOUND');
  if (!['upload', 'either'].includes(type.fulfillment_mode)) throw publicError('This requirement must be completed as a digital form.');
  const definition = parseJson(type.definition, {});
  const detected = detectFileType(file.buffer);
  if (!detected) throw publicError('The file signature is not a supported image or PDF.', 400, 'UNSUPPORTED_FILE_SIGNATURE');
  if (!(definition.allowedMimeTypes || []).includes(detected.mime)) throw publicError('This file type is not allowed for the selected requirement.', 400, 'FILE_TYPE_NOT_ALLOWED');
  if (file.size > Number(definition.maximumBytes || 0)) throw publicError('The file exceeds the configured size limit.', 413, 'FILE_TOO_LARGE');
  if (definition.requiresExpiry && !expiresOn) throw publicError('An expiry date is required for this document.');

  const [[count]] = await connection.query(
    `SELECT COUNT(*) AS total FROM scms_document_files
     WHERE document_type_id = ? AND owner_type = ? AND owner_id = ? AND status <> 'superseded'`,
    [type.id, owner.ownerType, owner.ownerId]
  );
  if (Number(count.total) >= Number(definition.maximumFiles || 1) && !definition.requiresReupload) {
    throw publicError('The configured file-count limit has been reached.', 409, 'FILE_COUNT_LIMIT');
  }
  const [[latest]] = await connection.query(
    `SELECT id, version_number FROM scms_document_files WHERE document_type_id = ? AND owner_type = ? AND owner_id = ?
     ORDER BY version_number DESC LIMIT 1 FOR UPDATE`, [type.id, owner.ownerType, owner.ownerId]
  );
  const storageKey = crypto.randomBytes(32).toString('hex');
  const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const storagePath = path.join(documentStorageRoot, storageKey.slice(0, 2), `${storageKey}${detected.extension}`);
  await fs.mkdir(path.dirname(storagePath), { recursive: true });
  await fs.writeFile(storagePath, file.buffer, { flag: 'wx' });
  try {
    if (latest) await connection.query("UPDATE scms_document_files SET status = 'superseded' WHERE id = ?", [latest.id]);
    const [requirements] = await connection.query(
      `SELECT id FROM scms_document_requirements WHERE document_type_id = ? AND is_active = TRUE
       AND effective_from <= CURRENT_DATE() AND (effective_to IS NULL OR effective_to >= CURRENT_DATE())
       ORDER BY effective_from DESC LIMIT 1`, [type.id]
    );
    const [result] = await connection.query(
      `INSERT INTO scms_document_files
        (document_type_id, document_type_version_id, requirement_id, owner_type, owner_id,
         parent_p_no_o_no, version_number, original_file_name, storage_key, verified_mime_type,
         file_size_bytes, checksum_sha256, expires_on, supersedes_file_id, uploaded_by_type, uploaded_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [type.id, type.type_version_id, requirements[0]?.id || null, owner.ownerType, owner.ownerId,
        owner.parentPNo, Number(latest?.version_number || 0) + 1, path.basename(file.originalname || 'document'),
        storageKey, detected.mime, file.size, checksum, validDate(expiresOn), latest?.id || null,
        uploaderType, String(uploaderId)]
    );
    return { id: Number(result.insertId), owner, storagePath };
  } catch (error) {
    await fs.unlink(storagePath).catch(() => undefined);
    throw error;
  }
}

export async function documentFilePath(connection, fileId) {
  const [[record]] = await connection.query('SELECT * FROM scms_document_files WHERE id = ?', [Number(fileId)]);
  if (!record) throw publicError('Document file not found.', 404, 'DOCUMENT_NOT_FOUND');
  const matches = await fs.readdir(path.join(documentStorageRoot, record.storage_key.slice(0, 2))).catch(() => []);
  const fileName = matches.find(name => name.startsWith(record.storage_key));
  if (!fileName) throw publicError('Stored document content is unavailable.', 404, 'DOCUMENT_CONTENT_MISSING');
  return { record, path: path.join(documentStorageRoot, record.storage_key.slice(0, 2), fileName) };
}

function formatDocumentType(row) {
  return { ...row, draft_definition: parseJson(row.draft_definition, {}) };
}

function formatFormTemplate(row) {
  return { ...row, draft_schema: parseJson(row.draft_schema, {}) };
}

const CONFIG_PACKAGE_FORMAT = 'scms-configuration';
const CONFIG_PACKAGE_VERSION = 1;

export function createConfigurationPackage(kind, source) {
  if (!source || typeof source !== 'object') throw publicError('Configuration source is required.');
  if (kind === 'document_type') {
    return {
      format: CONFIG_PACKAGE_FORMAT,
      formatVersion: CONFIG_PACKAGE_VERSION,
      kind,
      definition: {
        code: stableCode(source.code || source.name),
        name: String(source.name || '').trim().slice(0, 160),
        description: String(source.description || '').trim().slice(0, 1000),
        entityScope: String(source.entity_scope || source.entityScope || 'child'),
        fulfillmentMode: String(source.fulfillment_mode || source.fulfillmentMode || 'upload'),
        settings: normalizeDocumentDefinition(source.draft_definition || source.definition || source.settings)
      }
    };
  }
  if (kind === 'form_template') {
    return {
      format: CONFIG_PACKAGE_FORMAT,
      formatVersion: CONFIG_PACKAGE_VERSION,
      kind,
      definition: {
        code: stableCode(source.code || source.name),
        name: String(source.name || '').trim().slice(0, 160),
        description: String(source.description || '').trim().slice(0, 1000),
        entityScope: String(source.entity_scope || source.entityScope || 'child'),
        schema: validateFormSchema(source.draft_schema || source.schema)
      }
    };
  }
  throw publicError('Unsupported configuration package type.');
}

export function readConfigurationPackage(input, expectedKind) {
  const configurationPackage = input && typeof input === 'object' && !Array.isArray(input) ? input : null;
  if (!configurationPackage || configurationPackage.format !== CONFIG_PACKAGE_FORMAT || Number(configurationPackage.formatVersion) !== CONFIG_PACKAGE_VERSION) {
    throw publicError('This is not a supported SCMS configuration package.', 400, 'INVALID_CONFIGURATION_PACKAGE');
  }
  if (configurationPackage.kind !== expectedKind) {
    throw publicError('The configuration package is for a different definition type.', 400, 'CONFIGURATION_TYPE_MISMATCH');
  }
  const definition = configurationPackage.definition;
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    throw publicError('The configuration package does not contain a definition.', 400, 'INVALID_CONFIGURATION_PACKAGE');
  }
  const name = String(definition.name || '').trim();
  if (!name) throw publicError('The imported definition needs a name.');
  const entityScope = String(definition.entityScope || 'child');
  if (!ENTITY_SCOPES.has(entityScope)) throw publicError('The imported definition has an invalid record scope.');
  if (expectedKind === 'document_type') {
    const fulfillmentMode = String(definition.fulfillmentMode || 'upload');
    if (!FULFILLMENT_MODES.has(fulfillmentMode)) throw publicError('The imported definition has an invalid fulfillment mode.');
    return {
      code: stableCode(definition.code || name), name: name.slice(0, 160),
      description: String(definition.description || '').trim().slice(0, 1000) || null,
      entityScope, fulfillmentMode, settings: normalizeDocumentDefinition(definition.settings)
    };
  }
  return {
    code: stableCode(definition.code || name), name: name.slice(0, 160),
    description: String(definition.description || '').trim().slice(0, 1000) || null,
    entityScope, schema: validateFormSchema(definition.schema)
  };
}

export function registerDocumentManagementRoutes(app, pool, transaction) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 1 } });

  app.get('/api/config/document-types', async (_req, res, next) => {
    try {
      const [rows] = await pool.query('SELECT * FROM scms_document_types ORDER BY entity_scope, name');
      res.json(rows.map(formatDocumentType));
    } catch (error) { next(error); }
  });

  app.get('/api/config/document-types/:id/export', async (req, res, next) => {
    try {
      const [[row]] = await pool.query('SELECT * FROM scms_document_types WHERE id = ?', [Number(req.params.id)]);
      if (!row) throw publicError('Document definition not found.', 404, 'DOCUMENT_TYPE_NOT_FOUND');
      const configurationPackage = createConfigurationPackage('document_type', formatDocumentType(row));
      res.setHeader('Content-Disposition', `attachment; filename="${configurationPackage.definition.code}.document.json"`);
      res.json(configurationPackage);
    } catch (error) { next(error); }
  });

  app.post('/api/config/document-types/import', async (req, res, next) => {
    try {
      const imported = readConfigurationPackage(req.body?.package ?? req.body, 'document_type');
      const id = await transaction(async connection => {
        const [[duplicate]] = await connection.query('SELECT id FROM scms_document_types WHERE code = ?', [imported.code]);
        if (duplicate) throw publicError('A document definition with this code already exists. Change the code before importing.', 409, 'CONFIGURATION_CODE_EXISTS');
        const [result] = await connection.query(
          `INSERT INTO scms_document_types
            (code, name, description, entity_scope, fulfillment_mode, draft_definition, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [imported.code, imported.name, imported.description, imported.entityScope, imported.fulfillmentMode,
            JSON.stringify(imported.settings), req.staff.id]
        );
        await connection.query(
          `INSERT INTO scms_audit_events (actor_user_id, action, entity_type, entity_id, reason, correlation_id, details)
           VALUES (?, 'document_type.imported', 'document_type', ?, 'Imported configuration package', UUID(), JSON_OBJECT('code', ?))`,
          [req.staff.id, String(result.insertId), imported.code]
        );
        return Number(result.insertId);
      });
      res.status(201).json({ id, status: 'draft' });
    } catch (error) { next(error); }
  });

  app.post('/api/config/document-types', async (req, res, next) => {
    try {
      const entityScope = String(req.body?.entityScope || 'child');
      const fulfillmentMode = String(req.body?.fulfillmentMode || 'upload');
      if (!ENTITY_SCOPES.has(entityScope) || !FULFILLMENT_MODES.has(fulfillmentMode)) throw publicError('Invalid document scope or fulfillment mode.');
      const name = String(req.body?.name || '').trim();
      if (!name) throw publicError('Document name is required.');
      const definition = normalizeDocumentDefinition(req.body?.definition);
      const [result] = await pool.query(
        `INSERT INTO scms_document_types
          (code, name, description, entity_scope, fulfillment_mode, draft_definition, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [stableCode(req.body?.code || name), name.slice(0,160), String(req.body?.description || '').trim().slice(0,1000) || null,
          entityScope, fulfillmentMode, JSON.stringify(definition), req.staff.id]
      );
      res.status(201).json({ id: Number(result.insertId) });
    } catch (error) { next(error); }
  });

  app.patch('/api/config/document-types/:id', async (req, res, next) => {
    try {
      const [[current]] = await pool.query('SELECT * FROM scms_document_types WHERE id = ?', [Number(req.params.id)]);
      if (!current) throw publicError('Document definition not found.', 404, 'DOCUMENT_TYPE_NOT_FOUND');
      const expectedVersion = Number(req.body?.rowVersion);
      if (expectedVersion !== Number(current.row_version)) throw publicError('This definition changed in another session. Reload and try again.', 409, 'VERSION_CONFLICT');
      const entityScope = String(req.body?.entityScope || current.entity_scope);
      const fulfillmentMode = String(req.body?.fulfillmentMode || current.fulfillment_mode);
      if (!ENTITY_SCOPES.has(entityScope) || !FULFILLMENT_MODES.has(fulfillmentMode)) throw publicError('Invalid document scope or fulfillment mode.');
      const [result] = await pool.query(
        `UPDATE scms_document_types SET name = ?, description = ?, entity_scope = ?, fulfillment_mode = ?,
         draft_definition = ?, row_version = row_version + 1 WHERE id = ? AND row_version = ?`,
        [String(req.body?.name || current.name).trim().slice(0,160), String(req.body?.description ?? current.description ?? '').trim().slice(0,1000) || null,
          entityScope, fulfillmentMode, JSON.stringify(normalizeDocumentDefinition(req.body?.definition || parseJson(current.draft_definition, {}))), current.id, expectedVersion]
      );
      if (!result.affectedRows) throw publicError('This definition changed in another session. Reload and try again.', 409, 'VERSION_CONFLICT');
      res.status(204).send();
    } catch (error) { next(error); }
  });

  app.post('/api/config/document-types/:id/publish', async (req, res, next) => {
    try {
      const reason = String(req.body?.reason || '').trim();
      if (reason.length < 5) throw publicError('A publication reason of at least 5 characters is required.');
      const id = Number(req.params.id);
      const published = await transaction(async connection => {
        const [[type]] = await connection.query('SELECT * FROM scms_document_types WHERE id = ? FOR UPDATE', [id]);
        if (!type) throw publicError('Document definition not found.', 404, 'DOCUMENT_TYPE_NOT_FOUND');
        const definition = parseJson(type.draft_definition, {});
        const versionNumber = Number(type.current_version_number) + 1;
        const checksum = crypto.createHash('sha256').update(JSON.stringify(definition)).digest('hex');
        const [versionResult] = await connection.query(
          `INSERT INTO scms_document_type_versions
            (document_type_id, version_number, definition, definition_checksum, published_by)
           VALUES (?, ?, ?, ?, ?)`, [id, versionNumber, JSON.stringify(definition), checksum, req.staff.id]
        );
        const effectiveFrom = validDate(req.body?.effectiveFrom, new Date().toISOString().slice(0,10));
        await connection.query(
          `UPDATE scms_document_requirements SET effective_to = DATE_SUB(?, INTERVAL 1 DAY)
           WHERE document_type_id = ? AND is_active = TRUE AND effective_to IS NULL AND effective_from < ?`,
          [effectiveFrom, id, effectiveFrom]
        );
        await connection.query(
          `INSERT INTO scms_document_requirements
            (document_type_id, document_type_version_id, is_required, applicability, effective_from, display_order, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, versionResult.insertId, Boolean(req.body?.isRequired), JSON.stringify(definition.applicability || {}), effectiveFrom, Number(req.body?.displayOrder || 0), req.staff.id]
        );
        await connection.query("UPDATE scms_document_types SET status = 'published', current_version_number = ?, row_version = row_version + 1 WHERE id = ?", [versionNumber, id]);
        await connection.query(
          `INSERT INTO scms_audit_events (actor_user_id, action, entity_type, entity_id, reason, correlation_id, details)
           VALUES (?, 'document_type.published', 'document_type', ?, ?, UUID(), JSON_OBJECT('version', ?))`,
          [req.staff.id, String(id), reason, versionNumber]
        );
        return versionNumber;
      });
      res.json({ versionNumber: published });
    } catch (error) { next(error); }
  });

  app.get('/api/config/form-templates', async (_req, res, next) => {
    try { const [rows] = await pool.query('SELECT * FROM scms_form_templates ORDER BY entity_scope, name'); res.json(rows.map(formatFormTemplate)); }
    catch (error) { next(error); }
  });

  app.get('/api/config/form-templates/:id/export', async (req, res, next) => {
    try {
      const [[row]] = await pool.query('SELECT * FROM scms_form_templates WHERE id = ?', [Number(req.params.id)]);
      if (!row) throw publicError('Form template not found.', 404, 'FORM_TEMPLATE_NOT_FOUND');
      const configurationPackage = createConfigurationPackage('form_template', formatFormTemplate(row));
      res.setHeader('Content-Disposition', `attachment; filename="${configurationPackage.definition.code}.form.json"`);
      res.json(configurationPackage);
    } catch (error) { next(error); }
  });

  app.post('/api/config/form-templates/import', async (req, res, next) => {
    try {
      const imported = readConfigurationPackage(req.body?.package ?? req.body, 'form_template');
      const id = await transaction(async connection => {
        const [[duplicate]] = await connection.query('SELECT id FROM scms_form_templates WHERE code = ?', [imported.code]);
        if (duplicate) throw publicError('A form template with this code already exists. Change the code before importing.', 409, 'CONFIGURATION_CODE_EXISTS');
        const [result] = await connection.query(
          `INSERT INTO scms_form_templates (code, name, description, entity_scope, draft_schema, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [imported.code, imported.name, imported.description, imported.entityScope, JSON.stringify(imported.schema), req.staff.id]
        );
        await connection.query(
          `INSERT INTO scms_audit_events (actor_user_id, action, entity_type, entity_id, reason, correlation_id, details)
           VALUES (?, 'form_template.imported', 'form_template', ?, 'Imported configuration package', UUID(), JSON_OBJECT('code', ?))`,
          [req.staff.id, String(result.insertId), imported.code]
        );
        return Number(result.insertId);
      });
      res.status(201).json({ id, status: 'draft' });
    } catch (error) { next(error); }
  });

  app.post('/api/config/form-templates', async (req, res, next) => {
    try {
      const entityScope = String(req.body?.entityScope || 'child');
      if (!ENTITY_SCOPES.has(entityScope)) throw publicError('Invalid form scope.');
      const name = String(req.body?.name || '').trim();
      if (!name) throw publicError('Form name is required.');
      const schema = validateFormSchema(req.body?.schema);
      const [result] = await pool.query(
        `INSERT INTO scms_form_templates (code, name, description, entity_scope, draft_schema, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [stableCode(req.body?.code || name), name.slice(0,160), String(req.body?.description || '').trim().slice(0,1000) || null,
          entityScope, JSON.stringify(schema), req.staff.id]
      );
      res.status(201).json({ id: Number(result.insertId) });
    } catch (error) { next(error); }
  });

  app.patch('/api/config/form-templates/:id', async (req, res, next) => {
    try {
      const [[current]] = await pool.query('SELECT * FROM scms_form_templates WHERE id = ?', [Number(req.params.id)]);
      if (!current) throw publicError('Form template not found.', 404, 'FORM_TEMPLATE_NOT_FOUND');
      if (Number(req.body?.rowVersion) !== Number(current.row_version)) throw publicError('This template changed in another session.', 409, 'VERSION_CONFLICT');
      const entityScope = String(req.body?.entityScope || current.entity_scope);
      if (!ENTITY_SCOPES.has(entityScope)) throw publicError('Invalid form scope.');
      const schema = validateFormSchema(req.body?.schema || parseJson(current.draft_schema, {}));
      const [result] = await pool.query(
        `UPDATE scms_form_templates SET name = ?, description = ?, entity_scope = ?, draft_schema = ?, row_version = row_version + 1
         WHERE id = ? AND row_version = ?`,
        [String(req.body?.name || current.name).trim().slice(0,160), String(req.body?.description ?? current.description ?? '').trim().slice(0,1000) || null,
          entityScope, JSON.stringify(schema), current.id, Number(req.body.rowVersion)]
      );
      if (!result.affectedRows) throw publicError('This template changed in another session.', 409, 'VERSION_CONFLICT');
      res.status(204).send();
    } catch (error) { next(error); }
  });

  app.post('/api/config/form-templates/:id/publish', async (req, res, next) => {
    try {
      const reason = String(req.body?.reason || '').trim();
      if (reason.length < 5) throw publicError('A publication reason of at least 5 characters is required.');
      const version = await transaction(async connection => {
        const [[template]] = await connection.query('SELECT * FROM scms_form_templates WHERE id = ? FOR UPDATE', [Number(req.params.id)]);
        if (!template) throw publicError('Form template not found.', 404, 'FORM_TEMPLATE_NOT_FOUND');
        const schema = validateFormSchema(parseJson(template.draft_schema, {}));
        const versionNumber = Number(template.current_version_number) + 1;
        const checksum = crypto.createHash('sha256').update(JSON.stringify(schema)).digest('hex');
        await connection.query(
          `INSERT INTO scms_form_template_versions
            (form_template_id, version_number, schema_json, schema_checksum, effective_from, published_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [template.id, versionNumber, JSON.stringify(schema), checksum, validDate(req.body?.effectiveFrom, new Date().toISOString().slice(0,10)), req.staff.id]
        );
        await connection.query("UPDATE scms_form_templates SET status = 'published', current_version_number = ?, row_version = row_version + 1 WHERE id = ?", [versionNumber, template.id]);
        await connection.query(
          `INSERT INTO scms_audit_events (actor_user_id, action, entity_type, entity_id, reason, correlation_id, details)
           VALUES (?, 'form_template.published', 'form_template', ?, ?, UUID(), JSON_OBJECT('version', ?))`,
          [req.staff.id, String(template.id), reason, versionNumber]
        );
        return versionNumber;
      });
      res.json({ versionNumber: version });
    } catch (error) { next(error); }
  });

  app.get('/api/document-workspace', async (req, res, next) => {
    try {
      const workspace = await loadDocumentWorkspace(pool, req.query.ownerType, req.query.ownerId);
      const scope = await loadDataScope(pool, req.staff, 'documents');
      if (!scopeAllowsAuthority(scope, workspace.owner.authority)) throw publicError('Record not found in your data scope.', 404, 'NOT_FOUND');
      res.json(workspace);
    } catch (error) { next(error); }
  });

  app.post('/api/document-files', upload.single('file'), async (req, res, next) => {
    try {
      const stored = await transaction(async connection => {
        const owner = await resolveDocumentOwner(connection, req.body.ownerType, req.body.ownerId);
        const scope = await loadDataScope(connection, req.staff, 'documents');
        if (!scopeAllowsAuthority(scope, owner.authority)) throw publicError('Record not found in your data scope.', 404, 'NOT_FOUND');
        const result = await storeDocumentFile(connection, {
          file: req.file, documentTypeId: req.body.documentTypeId, ownerType: req.body.ownerType,
          ownerId: req.body.ownerId, expiresOn: req.body.expiresOn, uploaderType: 'staff', uploaderId: req.staff.id
        });
        return result;
      });
      res.status(201).json({ id: stored.id });
    } catch (error) { next(error); }
  });

  app.get('/api/document-files/:id/content', async (req, res, next) => {
    try {
      const content = await documentFilePath(pool, req.params.id);
      const owner = await resolveDocumentOwner(pool, content.record.owner_type, content.record.owner_id);
      const scope = await loadDataScope(pool, req.staff, 'documents');
      if (!scopeAllowsAuthority(scope, owner.authority)) throw publicError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
      res.type(content.record.verified_mime_type);
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(content.record.original_file_name)}`);
      res.sendFile(content.path);
    } catch (error) { next(error); }
  });

  app.post('/api/document-files/:id/review', async (req, res, next) => {
    try {
      const decision = String(req.body?.decision || '');
      const reason = String(req.body?.reason || '').trim();
      if (!REVIEW_DECISIONS.has(decision)) throw publicError('Invalid document decision.');
      if (decision !== 'verified' && reason.length < 5) throw publicError('A parent-facing reason is required.');
      await transaction(async connection => {
        const [[file]] = await connection.query('SELECT * FROM scms_document_files WHERE id = ? FOR UPDATE', [Number(req.params.id)]);
        if (!file || !['pending_review', 'changes_required'].includes(file.status)) throw publicError('Document is no longer reviewable.', 409, 'DOCUMENT_NOT_REVIEWABLE');
        const owner = await resolveDocumentOwner(connection, file.owner_type, file.owner_id);
        const scope = await loadDataScope(connection, req.staff, 'documents');
        if (!scopeAllowsAuthority(scope, owner.authority)) throw publicError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
        await connection.query(
          `UPDATE scms_document_files SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP(3), review_reason = ? WHERE id = ?`,
          [decision, req.staff.id, reason || null, file.id]
        );
        await connection.query('INSERT INTO scms_document_reviews (document_file_id, decision, reason, reviewer_id) VALUES (?, ?, ?, ?)', [file.id, decision, reason || null, req.staff.id]);
      });
      res.status(204).send();
    } catch (error) { next(error); }
  });

  app.get('/api/document-review', async (req, res, next) => {
    try {
      const scope = await loadDataScope(pool, req.staff, 'documents');
      const authorityFilter = scope.all ? { sql: '1=1', params: [] } : {
        sql: `${scope.authorities.length ? `pb.Admin_Authority IN (${scope.authorities.map(() => '?').join(',')})` : '1=0'}${scope.allowNoAuthority ? " OR pb.Admin_Authority IS NULL OR TRIM(pb.Admin_Authority) = ''" : ''}`,
        params: scope.authorities
      };
      const [rows] = await pool.query(
        `SELECT f.*, t.name AS document_name, pb.Parent_Name, pb.Admin_Authority
         FROM scms_document_files f INNER JOIN scms_document_types t ON t.id = f.document_type_id
         INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = f.parent_p_no_o_no
         WHERE (${authorityFilter.sql}) ORDER BY FIELD(f.status,'pending_review','changes_required','verified','rejected','superseded'), f.uploaded_at DESC`,
        authorityFilter.params
      );
      res.json(rows);
    } catch (error) { next(error); }
  });

  app.post('/api/form-submissions', async (req, res, next) => {
    try {
      const result = await transaction(async connection => {
        const owner = await resolveDocumentOwner(connection, req.body?.ownerType, req.body?.ownerId);
        const scope = await loadDataScope(connection, req.staff, 'documents');
        if (!scopeAllowsAuthority(scope, owner.authority)) throw publicError('Record not found.', 404, 'NOT_FOUND');
        const [[version]] = await connection.query(
          `SELECT v.*, t.entity_scope FROM scms_form_template_versions v INNER JOIN scms_form_templates t ON t.id = v.form_template_id
           WHERE v.id = ? AND t.status = 'published'`, [Number(req.body?.templateVersionId)]
        );
        if (!version || version.entity_scope !== owner.ownerType) throw publicError('Form template not found.', 404, 'FORM_TEMPLATE_NOT_FOUND');
        const response = validateFormResponse(parseJson(version.schema_json, {}), req.body?.response);
        const [[latest]] = await connection.query(
          `SELECT revision_number AS revision FROM scms_form_submissions WHERE form_template_id = ? AND owner_type = ? AND owner_id = ?
           ORDER BY revision_number DESC LIMIT 1 FOR UPDATE`,
          [version.form_template_id, owner.ownerType, owner.ownerId]
        );
        const [insert] = await connection.query(
          `INSERT INTO scms_form_submissions
            (form_template_id, form_template_version_id, owner_type, owner_id, parent_p_no_o_no,
             revision_number, status, response_json, submitted_by_type, submitted_by_id, submitted_at)
           VALUES (?, ?, ?, ?, ?, ?, 'submitted', ?, 'staff', ?, CURRENT_TIMESTAMP(3))`,
          [version.form_template_id, version.id, owner.ownerType, owner.ownerId, owner.parentPNo,
            Number(latest?.revision || 0) + 1, JSON.stringify(response), String(req.staff.id)]
        );
        return Number(insert.insertId);
      });
      res.status(201).json({ id: result });
    } catch (error) { next(error); }
  });

  app.get('/api/form-review', async (req, res, next) => {
    try {
      const scope = await loadDataScope(pool, req.staff, 'documents');
      const authorityFilter = scope.all ? { sql: '1=1', params: [] } : {
        sql: `${scope.authorities.length ? `pb.Admin_Authority IN (${scope.authorities.map(() => '?').join(',')})` : '1=0'}${scope.allowNoAuthority ? " OR pb.Admin_Authority IS NULL OR TRIM(pb.Admin_Authority) = ''" : ''}`,
        params: scope.authorities
      };
      const [rows] = await pool.query(
        `SELECT s.*, t.name AS form_name, v.version_number, v.schema_json,
                pb.Parent_Name, pb.Admin_Authority
         FROM scms_form_submissions s
         INNER JOIN scms_form_templates t ON t.id = s.form_template_id
         INNER JOIN scms_form_template_versions v ON v.id = s.form_template_version_id
         INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = s.parent_p_no_o_no
         WHERE (${authorityFilter.sql})
         ORDER BY FIELD(s.status,'submitted','changes_required','verified','rejected'), s.submitted_at DESC`,
        authorityFilter.params
      );
      res.json(rows.map(row => ({ ...row, schema_json: parseJson(row.schema_json, {}), response_json: parseJson(row.response_json, {}) })));
    } catch (error) { next(error); }
  });

  app.post('/api/form-submissions/:id/review', async (req, res, next) => {
    try {
      const decision = String(req.body?.decision || '');
      const reason = String(req.body?.reason || '').trim();
      if (!REVIEW_DECISIONS.has(decision)) throw publicError('Invalid form decision.');
      if (decision !== 'verified' && reason.length < 5) throw publicError('A parent-facing reason is required.');
      await transaction(async connection => {
        const [[submission]] = await connection.query('SELECT * FROM scms_form_submissions WHERE id = ? FOR UPDATE', [Number(req.params.id)]);
        if (!submission || !['submitted', 'changes_required'].includes(submission.status)) throw publicError('Form submission is no longer reviewable.', 409, 'FORM_NOT_REVIEWABLE');
        const owner = await resolveDocumentOwner(connection, submission.owner_type, submission.owner_id);
        const scope = await loadDataScope(connection, req.staff, 'documents');
        if (!scopeAllowsAuthority(scope, owner.authority)) throw publicError('Form submission not found.', 404, 'FORM_NOT_FOUND');
        await connection.query(
          `UPDATE scms_form_submissions SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP(3), review_reason = ? WHERE id = ?`,
          [decision, req.staff.id, reason || null, submission.id]
        );
        await connection.query(
          `INSERT INTO scms_audit_events (actor_user_id, action, entity_type, entity_id, reason, correlation_id, details)
           VALUES (?, ?, 'form_submission', ?, ?, UUID(), JSON_OBJECT('decision', ?))`,
          [req.staff.id, `form_submission.${decision}`, String(submission.id), reason || null, decision]
        );
      });
      res.status(204).send();
    } catch (error) { next(error); }
  });

  app.get('/api/message-threads', async (req, res, next) => {
    try {
      const owner = await resolveDocumentOwner(pool, req.query.ownerType, req.query.ownerId);
      const scope = await loadDataScope(pool, req.staff, 'documents');
      if (!scopeAllowsAuthority(scope, owner.authority)) throw publicError('Record not found.', 404, 'NOT_FOUND');
      const [threads] = await pool.query(
        `SELECT * FROM scms_message_threads WHERE owner_type = ? AND owner_id = ? ORDER BY updated_at DESC`,
        [owner.ownerType, owner.ownerId]
      );
      for (const thread of threads) {
        const [messages] = await pool.query('SELECT * FROM scms_messages WHERE thread_id = ? ORDER BY created_at', [thread.id]);
        thread.messages = messages;
      }
      res.json(threads);
    } catch (error) { next(error); }
  });

  app.post('/api/message-threads', async (req, res, next) => {
    try {
      const subject = String(req.body?.subject || '').trim();
      const body = String(req.body?.body || '').trim();
      if (!subject || !body) throw publicError('Subject and first message are required.');
      const id = await transaction(async connection => {
        const owner = await resolveDocumentOwner(connection, req.body?.ownerType, req.body?.ownerId);
        const scope = await loadDataScope(connection, req.staff, 'documents');
        if (!scopeAllowsAuthority(scope, owner.authority)) throw publicError('Record not found.', 404, 'NOT_FOUND');
        const [thread] = await connection.query(
          `INSERT INTO scms_message_threads
            (owner_type, owner_id, parent_p_no_o_no, subject, created_by_type, created_by_id)
           VALUES (?, ?, ?, ?, 'staff', ?)`,
          [owner.ownerType, owner.ownerId, owner.parentPNo, subject.slice(0,200), String(req.staff.id)]
        );
        await connection.query(
          `INSERT INTO scms_messages (thread_id, sender_type, sender_id, body, is_internal)
            VALUES (?, 'staff', ?, ?, ?)`,
          [thread.insertId, String(req.staff.id), body.slice(0,4000), Boolean(req.body?.isInternal)]
        );
        await connection.query(
          `INSERT INTO scms_audit_events (actor_user_id, action, entity_type, entity_id, reason, correlation_id, details)
           VALUES (?, 'message_thread.created', 'message_thread', ?, NULL, UUID(), JSON_OBJECT('ownerType', ?, 'ownerId', ?, 'internal', ?))`,
          [req.staff.id, String(thread.insertId), owner.ownerType, owner.ownerId, Boolean(req.body?.isInternal)]
        );
        return Number(thread.insertId);
      });
      res.status(201).json({ id });
    } catch (error) { next(error); }
  });

  app.post('/api/message-threads/:id/messages', async (req, res, next) => {
    try {
      const body = String(req.body?.body || '').trim();
      if (!body) throw publicError('Message text is required.');
      await transaction(async connection => {
        const [[thread]] = await connection.query('SELECT * FROM scms_message_threads WHERE id = ? FOR UPDATE', [Number(req.params.id)]);
        if (!thread || thread.status !== 'open') throw publicError('Message thread is not available.', 404, 'THREAD_NOT_FOUND');
        const owner = await resolveDocumentOwner(connection, thread.owner_type, thread.owner_id);
        const scope = await loadDataScope(connection, req.staff, 'documents');
        if (!scopeAllowsAuthority(scope, owner.authority)) throw publicError('Message thread not found.', 404, 'THREAD_NOT_FOUND');
        await connection.query(
          `INSERT INTO scms_messages (thread_id, sender_type, sender_id, body, is_internal)
            VALUES (?, 'staff', ?, ?, ?)`,
          [thread.id, String(req.staff.id), body.slice(0,4000), Boolean(req.body?.isInternal)]
        );
        await connection.query('UPDATE scms_message_threads SET updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [thread.id]);
        await connection.query(
          `INSERT INTO scms_audit_events (actor_user_id, action, entity_type, entity_id, reason, correlation_id, details)
           VALUES (?, 'message.sent', 'message_thread', ?, NULL, UUID(), JSON_OBJECT('internal', ?))`,
          [req.staff.id, String(thread.id), Boolean(req.body?.isInternal)]
        );
      });
      res.status(204).send();
    } catch (error) { next(error); }
  });
}
