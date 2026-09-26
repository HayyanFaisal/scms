import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import path from 'path';
import multer from 'multer';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { pool, query, transaction, ensureSchema } from './database.js';
import { runMigrations } from './migrations.js';
import { createStaffAuth } from './staff-auth.js';
import { permissionForRequest } from './route-policy.js';
import { registerAccessControlRoutes } from './access-control.js';
import { createDataScopeMiddleware, loadDataScope, scopeAllowsAuthority, scopePredicate } from './data-scope.js';
import { hashPassword, verifyPassword } from './security.js';
import { assertReferenceValue, registerConfigurationRoutes } from './configuration.js';
import { PARENT_FIELD_COLUMNS, matchParentByIdentifiers, normalizeIdentifier, refreshChildCompleteness, refreshParentCompleteness, syncParentIdentifiers } from './profile-lifecycle.js';
import { registerDocumentManagementRoutes } from './document-management.js';
import { recoverImportWorkers, registerImportPlatformRoutes } from './import-platform.js';
import { registerAuditLogRoutes } from './audit-log.js';
import { appendBankingHistory, bankingError, normalizeBankingPayload } from './banking-workflow.js';
import { registerPaymentOperationsRoutes } from './payment-operations.js';

const app = express();
const port = Number(process.env.PORT || 3001);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.join(__dirname, 'uploads');
const parentDocUploadDir = path.join(uploadsRoot, 'parent-docs');
const staffAuth = createStaffAuth(pool);

// ===== ADD THESE IMPORTS AT THE TOP (after existing imports) =====
import axios from 'axios';

// Portal sync configuration
const PORTAL_API_URL = process.env.PORTAL_API_URL || 'http://127.0.0.1:4000';
const PORTAL_API_KEY = process.env.PORTAL_API_KEY;

// Temporary legacy authority JWT. Disabled by default while authority users move to named RBAC accounts.
const ENABLE_LEGACY_AUTHORITY_LOGIN = process.env.SCMS_ENABLE_LEGACY_AUTHORITY_LOGIN === 'true';
const JWT_SECRET = process.env.JWT_SECRET;

if (ENABLE_LEGACY_AUTHORITY_LOGIN && !JWT_SECRET) {
  throw new Error('JWT_SECRET is required when legacy authority authentication is enabled');
}

await fs.mkdir(parentDocUploadDir, { recursive: true });

const allowedImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff']);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, parentDocUploadDir);
    },
    filename: (_req, file, callback) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const safeExt = ext || '.jpg';
      const uniquePart = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      callback(null, `${uniquePart}${safeExt}`);
    }
  }),
  limits: {
    fileSize: 8 * 1024 * 1024
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedImageMimeTypes.has(file.mimetype)) {
      callback(new Error('Only image files are allowed (jpeg, png, webp, gif, tiff)'));
      return;
    }
    callback(null, true);
  }
});

const allowedOrigins = new Set(
  String(process.env.SCMS_ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

app.set('trust proxy', process.env.SCMS_TRUST_PROXY === 'true' ? 1 : false);
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin is not allowed'));
    }
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(
  '/uploads',
  staffAuth.authenticate,
  staffAuth.requirePermission('documents.read'),
  async (req, res, next) => {
    try {
      const storagePath = `/uploads${req.path}`;
      const [rows] = await pool.query(
        `SELECT pb.Admin_Authority
         FROM Parent_Document_Files f
         INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = f.P_No_O_No
         WHERE f.Storage_Path = ?`,
        [storagePath]
      );
      const scope = await loadDataScope(pool, req.staff, 'documents');
      if (!rows[0] || !scopeAllowsAuthority(scope, rows[0].Admin_Authority)) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Document was not found in your assigned data scope.'
          }
        });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  },
  express.static(uploadsRoot, { fallthrough: false, index: false })
);

function sendError(res, error, fallbackMessage = 'Request failed') {
  console.error(error);
  if (error?.status && error?.publicCode) {
    res.status(Number(error.status)).json({ error: { code: error.publicCode, message: error.message } });
    return;
  }
  const sqlCode = error && typeof error === 'object' ? error.code : undefined;

  if (sqlCode === 'ER_DUP_ENTRY') {
    res.status(409).json({
      message: 'Duplicate value violates a unique field'
    });
    return;
  }

  if (sqlCode === 'ER_NO_REFERENCED_ROW_2' || sqlCode === 'ER_ROW_IS_REFERENCED_2') {
    res.status(400).json({
      message: 'Request violates a relationship constraint'
    });
    return;
  }

  res.status(500).json({ message: fallbackMessage });
}

const parentSafeColumns = `
  P_No_O_No, Parent_Name, Rank_Rate, Unit, Admin_Authority, Service_Status,
  Parent_CNIC, No_of_Disabled_Children, Address, Email, Contact_No, Status, Origin,
  Default_Password_Changed, Created_At, Approved_At, Record_State, Missing_Fields,
  Is_Provisional, Claimed_At, Block_Reason, Blocked_At
`;

const qualifiedParentSafeColumns = (alias) =>
  parentSafeColumns
    .split(',')
    .map((column) => `${alias}.${column.trim()}`)
    .join(', ');

async function getBootstrap(staff) {
  const [parentScope, documentScope, bankingScope, childScope, grantScope, gadgetScope] = await Promise.all([loadDataScope(pool, staff, 'parents'), loadDataScope(pool, staff, 'documents'), loadDataScope(pool, staff, 'banking'), loadDataScope(pool, staff, 'children'), loadDataScope(pool, staff, 'grants'), loadDataScope(pool, staff, 'gadgets')]);
  const parentFilter = scopePredicate(parentScope, 'pb.Admin_Authority');
  const documentFilter = scopePredicate(documentScope, 'pb.Admin_Authority');
  const bankingFilter = scopePredicate(bankingScope, 'pb.Admin_Authority');
  const childFilter = scopePredicate(childScope, 'pb.Admin_Authority');
  const grantFilter = scopePredicate(grantScope, 'pb.Admin_Authority');
  const gadgetFilter = scopePredicate(gadgetScope, 'pb.Admin_Authority');
  const [parents, documents, banking, children, grants, gadgets] = await Promise.all([
    query(`SELECT ${qualifiedParentSafeColumns('pb')} FROM Parent_Beneficiary pb WHERE ${parentFilter.sql} ORDER BY pb.Parent_Name`, parentFilter.params),
    query(`SELECT d.* FROM Document_Tracking d INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = d.P_No_O_No WHERE ${documentFilter.sql} ORDER BY d.Doc_ID`, documentFilter.params),
    query(`SELECT b.* FROM Banking_Details b INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = b.P_No_O_No WHERE b.Is_Archived = FALSE AND ${bankingFilter.sql} ORDER BY b.Account_ID`, bankingFilter.params),
    query(`SELECT dc.* FROM Dependent_Children dc INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = dc.P_No_O_No WHERE ${childFilter.sql} ORDER BY dc.Child_ID`, childFilter.params),
    query(`SELECT mg.* FROM Monthly_Grants mg INNER JOIN Dependent_Children dc ON dc.Child_ID = mg.Child_ID INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = dc.P_No_O_No WHERE ${grantFilter.sql} ORDER BY mg.Grant_ID`, grantFilter.params),
    query(`SELECT cg.* FROM Child_Gadgets cg INNER JOIN Dependent_Children dc ON dc.Child_ID = cg.Child_ID INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = dc.P_No_O_No WHERE ${gadgetFilter.sql} ORDER BY cg.Gadget_ID`, gadgetFilter.params)
  ]);

  return { parents, documents, banking, children, grants, gadgets };
}

async function getParentRecord(pNo) {
  const rows = await query(`SELECT ${parentSafeColumns} FROM Parent_Beneficiary WHERE P_No_O_No = ?`, [pNo]);
  return rows[0] || null;
}

async function getDocumentRecord(docId) {
  const rows = await query('SELECT * FROM Document_Tracking WHERE Doc_ID = ?', [docId]);
  return rows[0] || null;
}

async function getScannedDocumentRecord(documentFileId) {
  const rows = await query('SELECT * FROM Parent_Document_Files WHERE Document_File_ID = ?', [documentFileId]);
  return rows[0] || null;
}

async function getBankingRecord(accountId) {
  const rows = await query('SELECT * FROM Banking_Details WHERE Account_ID = ?', [accountId]);
  return rows[0] || null;
}

async function getChildRecord(childId) {
  const rows = await query('SELECT * FROM Dependent_Children WHERE Child_ID = ?', [childId]);
  return rows[0] || null;
}

async function getGrantRecord(grantId) {
  const rows = await query('SELECT * FROM Monthly_Grants WHERE Grant_ID = ?', [grantId]);
  return rows[0] || null;
}

function grantValidationError(message, code = 'INVALID_GRANT') {
  const error = new Error(message);
  error.status = 400;
  error.publicCode = code;
  return error;
}

function inclusiveGrantMonths(from, to) {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    throw grantValidationError('Approved To must be on or after Approved From.');
  }
  return (end.getUTCFullYear() - start.getUTCFullYear()) * 12
    + end.getUTCMonth() - start.getUTCMonth() + 1;
}

async function resolveGrantTerms(connection, childId, approvedFrom, approvedTo, excludeGrantId = null) {
  const months = inclusiveGrantMonths(approvedFrom, approvedTo);
  const [children] = await connection.query(
    `SELECT dc.Child_ID, dc.Approved_Category AS approved_category
     FROM Dependent_Children dc WHERE dc.Child_ID = ? FOR UPDATE`,
    [childId],
  );
  const child = children[0];
  if (!child) throw grantValidationError('The selected child does not exist.', 'CHILD_NOT_FOUND');
  if (!child.approved_category) {
    throw grantValidationError('Approve the child category before creating a grant.', 'CATEGORY_NOT_APPROVED');
  }

  const [rates] = await connection.query(
    `SELECT r.id, r.monthly_amount, r.effective_from, category.name AS category_name
     FROM scms_category_rate_schedules r
     INNER JOIN scms_reference_items category ON category.id = r.category_item_id
     WHERE category.item_type = 'category' AND category.name = ?
       AND r.effective_from <= ?
       AND (r.effective_to IS NULL OR r.effective_to >= ?)
     ORDER BY r.effective_from DESC LIMIT 1`,
    [child.approved_category, approvedFrom, approvedFrom],
  );
  if (!rates[0]) {
    throw grantValidationError(`No published rate covers ${child.approved_category} on ${approvedFrom}.`, 'RATE_NOT_FOUND');
  }

  const overlapParams = [childId, approvedTo, approvedFrom];
  let overlapSql = `SELECT Grant_ID FROM Monthly_Grants
    WHERE Child_ID = ? AND Status <> 'cancelled' AND Approved_From <= ? AND Approved_To >= ?`;
  if (excludeGrantId) {
    overlapSql += ' AND Grant_ID <> ?';
    overlapParams.push(excludeGrantId);
  }
  overlapSql += ' FOR UPDATE';
  const [overlaps] = await connection.query(overlapSql, overlapParams);
  if (overlaps.length > 0) {
    throw grantValidationError('This child already has a grant covering part of that period.', 'GRANT_PERIOD_OVERLAP');
  }
  const monthlyAmount = Number(rates[0].monthly_amount);
  return {
    category: rates[0].category_name,
    rateScheduleId: Number(rates[0].id),
    rateEffectiveFrom: rates[0].effective_from,
    monthlyAmount,
    totalAmount: monthlyAmount * months,
  };
}

async function getGadgetRecord(gadgetId) {
  const rows = await query('SELECT * FROM Child_Gadgets WHERE Gadget_ID = ?', [gadgetId]);
  return rows[0] || null;
}

async function validateParentReferences(payload, existing = null) {
  await Promise.all([
    assertReferenceValue(pool, 'rank', payload.Rank_Rate, {
      allowInactiveValue: existing?.Rank_Rate
    }),
    assertReferenceValue(pool, 'unit', payload.Unit, {
      allowInactiveValue: existing?.Unit
    }),
    assertReferenceValue(pool, 'authority', payload.Admin_Authority, {
      allowInactiveValue: existing?.Admin_Authority,
      optional: true
    }),
    assertReferenceValue(pool, 'service_status', payload.Service_Status, {
      allowInactiveValue: existing?.Service_Status
    })
  ]);
}

async function validateChildReferences(payload, existing = null) {
  await Promise.all([
    assertReferenceValue(pool, 'category', payload.Disability_Category, {
      allowInactiveValue: existing?.Disability_Category
    }),
    assertReferenceValue(pool, 'school', payload.School, {
      allowInactiveValue: existing?.School
    })
  ]);
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, 'Database connection failed');
  }
});

app.post('/api/auth/login', (req, res, next) => staffAuth.login(req, res).catch(next));
app.get('/api/auth/session', (req, res, next) => staffAuth.session(req, res).catch(next));
app.post('/api/auth/logout', (req, res, next) => staffAuth.logout(req, res, next));
app.get('/api/auth/authority-options', async (_req, res, next) => {
  if (!ENABLE_LEGACY_AUTHORITY_LOGIN) {
    res.status(410).json({
      message: 'Legacy authority sign-in is disabled. Use a named staff account.'
    });
    return;
  }
  try {
    res.json(
      (await getAuthorityNames()).map((authority) => ({
        value: authority,
        label: authority
      }))
    );
  } catch (error) {
    next(error);
  }
});
app.post('/api/auth/change-password', staffAuth.authenticate, staffAuth.requireCsrf, (req, res, next) => staffAuth.changePassword(req, res, next));

app.use('/api', (req, res, next) => {
  if (req.path === '/auth/authority-login' || req.path.startsWith('/authority/')) {
    next();
    return;
  }
  staffAuth.authenticate(req, res, next);
});

app.use('/api', (req, res, next) => {
  if (req.path === '/auth/authority-login' || req.path.startsWith('/authority/')) {
    next();
    return;
  }
  staffAuth.requireCsrf(req, res, next);
});

app.use('/api', (req, res, next) => {
  if (req.path === '/auth/authority-login' || req.path.startsWith('/authority/')) {
    next();
    return;
  }
  const permission = permissionForRequest({
    path: req.path,
    method: req.method
  });
  if (!permission) {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'No authorization policy is registered for this endpoint.'
      }
    });
    return;
  }
  staffAuth.requirePermission(permission)(req, res, next);
});

app.use('/api', createDataScopeMiddleware(pool));

app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.staff) {
    next();
    return;
  }

  const requestCorrelationId = crypto.randomUUID();
  res.setHeader('X-Correlation-ID', requestCorrelationId);
  res.on('finish', () => {
    const segments = req.path.split('/').filter(Boolean);
    const outcome = res.statusCode >= 200 && res.statusCode < 400 ? 'success' : 'failure';
    void pool
      .query(
        `INSERT INTO scms_audit_events
        (actor_user_id, action, entity_type, entity_id, outcome, ip_address, correlation_id, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.staff.id, `http.${req.method.toLowerCase()}`, segments[0] || 'api', segments[1] || null, outcome, String(req.ip || '').slice(0, 64) || null, requestCorrelationId, JSON.stringify({ path: req.path, statusCode: res.statusCode })]
      )
      .catch((error) => console.error('[Audit] Failed to append mutation event:', error.message));
  });
  next();
});

registerAccessControlRoutes(app, pool);
registerConfigurationRoutes(app, pool);
registerDocumentManagementRoutes(app, pool, transaction);
registerImportPlatformRoutes(app, pool, transaction);
registerAuditLogRoutes(app, pool);
registerPaymentOperationsRoutes(app, pool, transaction);

app.post('/api/imports/provisional-record', async (req, res, next) => {
  try {
    const parentInput = req.body?.parent && typeof req.body.parent === 'object' ? req.body.parent : {};
    const childInput = req.body?.child && typeof req.body.child === 'object' ? req.body.child : null;
    const pNoONo = typeof parentInput.pNoONo === 'string' ? parentInput.pNoONo.trim().toUpperCase() : '';
    const cnic = typeof parentInput.cnic === 'string' ? parentInput.cnic.trim() : '';
    if (!normalizeIdentifier(pNoONo) && !normalizeIdentifier(cnic)) {
      res.status(400).json({
        error: {
          code: 'IDENTIFIER_REQUIRED',
          message: 'A parent PN/O number or CNIC is required.'
        }
      });
      return;
    }

    const result = await transaction(async (connection) => {
      const match = await matchParentByIdentifiers(connection, {
        pNoONo,
        cnic
      });
      if (match.status === 'conflict') {
        const error = new Error('The supplied identifiers point to different parent records and require conflict review.');
        error.status = 409;
        error.publicCode = 'IDENTIFIER_CONFLICT';
        throw error;
      }

      let parentId = match.status === 'matched' ? match.parentPNo : null;
      let parentCreated = false;
      if (!parentId) {
        parentId = pNoONo || `PROV-${crypto.randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`;
        await connection.query(
          `INSERT INTO Parent_Beneficiary
            (P_No_O_No, Parent_Name, Rank_Rate, Unit, Admin_Authority, Service_Status,
             Parent_CNIC, Status, Origin, Record_State, Is_Provisional)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'activation_required', 'imported', 'incomplete', TRUE)`,
          [parentId, String(parentInput.parentName || '').trim(), parentInput.rankRate || null, parentInput.unit || null, parentInput.adminAuthority || null, parentInput.serviceStatus || null, cnic || null]
        );
        await syncParentIdentifiers(connection, parentId, cnic, {
          source: 'import',
          verified: false
        });
        await refreshParentCompleteness(connection, parentId);
        parentCreated = true;
      }

      let childId = null;
      if (childInput) {
        const selectedCategory = String(childInput.parentSelectedCategory || '').trim();
        const school = String(childInput.school || '').trim();
        if (selectedCategory) await assertReferenceValue(connection, 'category', selectedCategory);
        if (school) await assertReferenceValue(connection, 'school', school);
        const [childResult] = await connection.query(
          `INSERT INTO Dependent_Children
            (P_No_O_No, Child_Name, Age, CNIC_BForm_No, School, Parent_Selected_Category,
             Status, Record_State, Is_Provisional)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', 'incomplete', TRUE)`,
          [parentId, String(childInput.childName || '').trim(), childInput.age || null, String(childInput.cnicBformNo || '').trim() || null, school || null, selectedCategory || null]
        );
        childId = Number(childResult.insertId);
        await refreshChildCompleteness(connection, childId);
      }

      await connection.query(
        `INSERT INTO scms_audit_events
          (actor_user_id, action, entity_type, entity_id, correlation_id, details)
         VALUES (?, 'import.provisional_record.created', 'parent', ?, UUID(),
                 JSON_OBJECT('parentCreated', ?, 'childId', ?))`,
        [req.staff.id, parentId, parentCreated, childId]
      );
      return {
        parentPNoONo: parentId,
        parentCreated,
        childId,
        matchStatus: match.status
      };
    });
    res.status(result.parentCreated || result.childId ? 201 : 200).json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/bootstrap', async (req, res) => {
  try {
    res.json(await getBootstrap(req.staff));
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/parents', async (req, res) => {
  try {
    const filter = scopePredicate(req.dataScope, 'pb.Admin_Authority');
    res.json(await query(`SELECT ${qualifiedParentSafeColumns('pb')} FROM Parent_Beneficiary pb WHERE ${filter.sql} ORDER BY pb.Parent_Name`, filter.params));
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/parents/:pNo', async (req, res) => {
  try {
    const parent = await getParentRecord(req.params.pNo);
    if (!parent) {
      res.status(404).json({ message: 'Parent not found' });
      return;
    }
    res.json(parent);
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/parents', async (req, res) => {
  try {
    const { P_No_O_No, Parent_Name, Rank_Rate, Unit, Admin_Authority, Service_Status, Parent_CNIC, Address, Email, Contact_No, No_of_Disabled_Children } = req.body;
    await validateParentReferences(req.body);
    await transaction(async (connection) => {
      await connection.query(
        `INSERT INTO Parent_Beneficiary
          (P_No_O_No, Parent_Name, Rank_Rate, Unit, Admin_Authority, Service_Status,
           Parent_CNIC, Address, Email, Contact_No, No_of_Disabled_Children)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [P_No_O_No, Parent_Name, Rank_Rate, Unit, Admin_Authority || null, Service_Status, Parent_CNIC, Address || null, Email || null, Contact_No || null, Number(No_of_Disabled_Children) || 0]
      );
      await syncParentIdentifiers(connection, P_No_O_No, Parent_CNIC, {
        source: 'staff_entry',
        verified: true
      });
      await refreshParentCompleteness(connection, P_No_O_No);
    });
    res.status(201).json(await getParentRecord(P_No_O_No));
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/parents/:pNo', async (req, res) => {
  try {
    const pNo = req.params.pNo;
    const { Parent_Name, Rank_Rate, Unit, Admin_Authority, Service_Status, Parent_CNIC, Address, Email, Contact_No, No_of_Disabled_Children } = req.body;
    const existing = await getParentRecord(pNo);
    if (!existing) {
      res.status(404).json({ message: 'Parent not found' });
      return;
    }
    await validateParentReferences(req.body, existing);
    await transaction(async (connection) => {
      await syncParentIdentifiers(connection, pNo, Parent_CNIC, {
        source: 'staff_update',
        verified: true
      });
      await connection.query(
        `UPDATE Parent_Beneficiary
         SET Parent_Name = ?, Rank_Rate = ?, Unit = ?, Admin_Authority = ?, Service_Status = ?,
             Parent_CNIC = ?, Address = ?, Email = ?, Contact_No = ?, No_of_Disabled_Children = ?
         WHERE P_No_O_No = ?`,
        [Parent_Name, Rank_Rate, Unit, Admin_Authority || null, Service_Status, Parent_CNIC, Address || null, Email || null, Contact_No || null, Number(No_of_Disabled_Children) || 0, pNo]
      );
      await refreshParentCompleteness(connection, pNo);
    });
    res.json(await getParentRecord(pNo));
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/parents/:pNo', async (req, res) => {
  try {
    const pNo = req.params.pNo;

    const scannedDocs = await query('SELECT Storage_Path FROM Parent_Document_Files WHERE P_No_O_No = ?', [pNo]);

    await transaction(async (connection) => {
      const [childRows] = await connection.query('SELECT Child_ID FROM Dependent_Children WHERE P_No_O_No = ?', [pNo]);
      const childIds = childRows.map((row) => row.Child_ID);

      if (childIds.length > 0) {
        await connection.query('DELETE FROM Child_Gadgets WHERE Child_ID IN (?)', [childIds]);
        await connection.query('DELETE FROM Monthly_Grants WHERE Child_ID IN (?)', [childIds]);
      }

      await connection.query('DELETE FROM Document_Tracking WHERE P_No_O_No = ?', [pNo]);
      await connection.query('DELETE FROM Banking_Details WHERE P_No_O_No = ?', [pNo]);
      await connection.query('DELETE FROM Dependent_Children WHERE P_No_O_No = ?', [pNo]);
      await connection.query('DELETE FROM Parent_Beneficiary WHERE P_No_O_No = ?', [pNo]);
    });

    for (const record of scannedDocs) {
      const relativePath = String(record.Storage_Path || '').replace(/^\/uploads\//, '');
      if (!relativePath) continue;
      const filePath = path.join(uploadsRoot, relativePath);
      await fs.unlink(filePath).catch(() => undefined);
    }

    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/documents', async (req, res) => {
  try {
    const filter = scopePredicate(req.dataScope, 'pb.Admin_Authority');
    res.json(await query(`SELECT d.* FROM Document_Tracking d INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = d.P_No_O_No WHERE ${filter.sql} ORDER BY d.Doc_ID`, filter.params));
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/documents', async (req, res) => {
  try {
    const { P_No_O_No, Letter_Reference, Contact_No, Almirah_No, File_No } = req.body;
    const result = await query(
      `INSERT INTO Document_Tracking
        (P_No_O_No, Letter_Reference, Contact_No, Almirah_No, File_No)
       VALUES (?, ?, ?, ?, ?)`,
      [P_No_O_No, Letter_Reference, Contact_No, Almirah_No, File_No]
    );
    res.status(201).json(await getDocumentRecord(result.insertId));
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/documents/:docId', async (req, res) => {
  try {
    const docId = Number(req.params.docId);
    const { P_No_O_No, Letter_Reference, Contact_No, Almirah_No, File_No } = req.body;
    await query(
      `UPDATE Document_Tracking
       SET P_No_O_No = ?, Letter_Reference = ?, Contact_No = ?, Almirah_No = ?, File_No = ?
       WHERE Doc_ID = ?`,
      [P_No_O_No, Letter_Reference, Contact_No, Almirah_No, File_No, docId]
    );
    res.json(await getDocumentRecord(docId));
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/documents/:docId', async (req, res) => {
  try {
    await query('DELETE FROM Document_Tracking WHERE Doc_ID = ?', [Number(req.params.docId)]);
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/parents/:pNo/scanned-documents', async (req, res) => {
  try {
    const pNo = req.params.pNo;
    res.json(
      await query(
        `SELECT *
         FROM Parent_Document_Files
         WHERE P_No_O_No = ?
         ORDER BY Uploaded_At DESC, Document_File_ID DESC`,
        [pNo]
      )
    );
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/parents/:pNo/scanned-documents', (req, res) => {
  upload.single('file')(req, res, async (uploadError) => {
    if (uploadError) {
      res.status(400).json({
        message: 'Upload failed',
        error: uploadError instanceof Error ? uploadError.message : 'Invalid upload request'
      });
      return;
    }

    try {
      const pNo = req.params.pNo;
      const parent = await getParentRecord(pNo);
      if (!parent) {
        res.status(404).json({ message: 'Parent not found' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ message: 'No file received' });
        return;
      }

      const docType = typeof req.body.docType === 'string' ? req.body.docType.trim() : '';
      const storagePath = `/uploads/parent-docs/${req.file.filename}`;

      const result = await query(
        `INSERT INTO Parent_Document_Files
          (P_No_O_No, Doc_Type, Original_File_Name, Stored_File_Name, Mime_Type, File_Size_Bytes, Storage_Path)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [pNo, docType || null, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, storagePath]
      );

      res.status(201).json(await getScannedDocumentRecord(result.insertId));
    } catch (error) {
      if (req.file?.path) {
        await fs.unlink(req.file.path).catch(() => undefined);
      }
      sendError(res, error);
    }
  });
});

app.delete('/api/scanned-documents/:documentFileId', async (req, res) => {
  try {
    const documentFileId = Number(req.params.documentFileId);
    const existing = await getScannedDocumentRecord(documentFileId);

    if (!existing) {
      res.status(404).json({ message: 'Document file not found' });
      return;
    }

    await query('DELETE FROM Parent_Document_Files WHERE Document_File_ID = ?', [documentFileId]);

    const relativePath = String(existing.Storage_Path || '').replace(/^\/uploads\//, '');
    if (relativePath) {
      const filePath = path.join(uploadsRoot, relativePath);
      await fs.unlink(filePath).catch(() => undefined);
    }

    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/banking', async (req, res) => {
  try {
    const filter = scopePredicate(req.dataScope, 'pb.Admin_Authority');
    res.json(await query(`SELECT b.* FROM Banking_Details b INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = b.P_No_O_No WHERE b.Is_Archived = FALSE AND ${filter.sql} ORDER BY b.Account_ID`, filter.params));
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/banking-workspace', async (req, res) => {
  try {
    const filter = scopePredicate(req.dataScope, 'pb.Admin_Authority');
    const rows = await query(
      `SELECT b.*, pb.Parent_Name, pb.Parent_CNIC, pb.Admin_Authority,
              verifier.display_name AS Verified_By_Name,
              (SELECT COUNT(*) FROM scms_document_files f
               WHERE f.owner_type = 'banking' AND CAST(f.owner_id AS UNSIGNED) = b.Account_ID
                 AND f.status <> 'superseded' AND f.uploaded_at >= COALESCE(b.Evidence_Required_From, '1970-01-01')) AS Evidence_Count,
              (SELECT COUNT(*) FROM scms_document_files f
               WHERE f.owner_type = 'banking' AND CAST(f.owner_id AS UNSIGNED) = b.Account_ID
                 AND f.status = 'verified' AND f.uploaded_at >= COALESCE(b.Evidence_Required_From, '1970-01-01')) AS Verified_Evidence_Count
       FROM Banking_Details b
       INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = b.P_No_O_No
       LEFT JOIN scms_users verifier ON verifier.id = b.Verified_By
       WHERE b.Is_Archived = FALSE AND ${filter.sql}
       ORDER BY FIELD(b.Verification_Status, 'pending_review', 'changes_required', 'pending_evidence', 'verified', 'rejected'),
                b.Updated_At DESC`,
      filter.params,
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/banking/:accountId/history', async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, version_number, action, verification_status, snapshot,
              reason, actor_type, actor_id, created_at
       FROM scms_banking_history
       WHERE account_id = ? ORDER BY version_number DESC, created_at DESC`,
      [Number(req.params.accountId)],
    );
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/banking', async (req, res) => {
  try {
    const values = normalizeBankingPayload(req.body);
    if (!values.P_No_O_No) throw bankingError('Choose a parent record.');
    const accountId = await transaction(async connection => {
      const [[duplicate]] = await connection.query(
        'SELECT Account_ID FROM Banking_Details WHERE P_No_O_No = ? AND Is_Archived = FALSE FOR UPDATE',
        [values.P_No_O_No],
      );
      if (duplicate) throw bankingError('This parent already has an active banking record.', 409, 'BANKING_RECORD_EXISTS');
      const [result] = await connection.query(
        `INSERT INTO Banking_Details
          (P_No_O_No, Bank_Name, Account_Title, Account_Number, Branch_Code, Branch_Address,
           IBAN, Routing_Number, CNIC_of_Account_Holder, Bank_Name_Branch, Verification_Status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_evidence')`,
        [values.P_No_O_No, values.Bank_Name, values.Account_Title, values.Account_Number,
          values.Branch_Code, values.Branch_Address, values.IBAN, values.Routing_Number,
          values.CNIC_of_Account_Holder, values.Bank_Name_Branch],
      );
      const [[created]] = await connection.query('SELECT * FROM Banking_Details WHERE Account_ID = ?', [result.insertId]);
      await appendBankingHistory(connection, created, { action: 'created', actorType: 'staff', actorId: req.staff.id });
      await connection.query(
        `INSERT INTO scms_audit_events
          (actor_user_id, action, entity_type, entity_id, outcome, correlation_id, details)
         VALUES (?, 'banking.created', 'banking', ?, 'success', UUID(), JSON_OBJECT('parent', ?))`,
        [req.staff.id, String(result.insertId), values.P_No_O_No],
      );
      return Number(result.insertId);
    });
    res.status(201).json(await getBankingRecord(accountId));
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/banking/:accountId', async (req, res) => {
  try {
    const accountId = Number(req.params.accountId);
    const values = normalizeBankingPayload(req.body);
    await transaction(async connection => {
      const [[existing]] = await connection.query(
        'SELECT * FROM Banking_Details WHERE Account_ID = ? AND Is_Archived = FALSE FOR UPDATE',
        [accountId],
      );
      if (!existing) throw bankingError('Banking record not found.', 404, 'BANKING_NOT_FOUND');
      if (Number(req.body?.Row_Version || existing.Row_Version) !== Number(existing.Row_Version)) {
        throw bankingError('This banking record changed in another session. Refresh and try again.', 409, 'VERSION_CONFLICT');
      }
      await connection.query(
        `UPDATE Banking_Details SET P_No_O_No = ?, Bank_Name = ?, Account_Title = ?,
         Account_Number = ?, Branch_Code = ?, Branch_Address = ?, IBAN = ?, Routing_Number = ?,
         CNIC_of_Account_Holder = ?, Bank_Name_Branch = ?, Verification_Status = 'pending_evidence',
         Review_Reason = NULL, Verified_By = NULL, Verified_At = NULL, Submitted_At = NULL,
         Evidence_Required_From = CURRENT_TIMESTAMP(3),
         Row_Version = Row_Version + 1 WHERE Account_ID = ?`,
        [values.P_No_O_No || existing.P_No_O_No, values.Bank_Name, values.Account_Title,
          values.Account_Number, values.Branch_Code, values.Branch_Address, values.IBAN,
          values.Routing_Number, values.CNIC_of_Account_Holder, values.Bank_Name_Branch, accountId],
      );
      const [[updated]] = await connection.query('SELECT * FROM Banking_Details WHERE Account_ID = ?', [accountId]);
      await appendBankingHistory(connection, updated, { action: 'details_updated', actorType: 'staff', actorId: req.staff.id });
      await connection.query(
        `INSERT INTO scms_audit_events
          (actor_user_id, action, entity_type, entity_id, outcome, correlation_id, details)
         VALUES (?, 'banking.details_updated', 'banking', ?, 'success', UUID(), JSON_OBJECT('parent', ?))`,
        [req.staff.id, String(accountId), updated.P_No_O_No],
      );
    });
    res.json(await getBankingRecord(accountId));
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/banking/:accountId/review', async (req, res) => {
  try {
    const accountId = Number(req.params.accountId);
    const decision = String(req.body?.decision || '');
    const reason = String(req.body?.reason || '').trim();
    if (!['verified', 'changes_required', 'rejected'].includes(decision)) throw bankingError('Choose a valid banking decision.');
    if (decision !== 'verified' && reason.length < 5) throw bankingError('A parent-facing reason of at least 5 characters is required.');
    await transaction(async connection => {
      const [[record]] = await connection.query(
        'SELECT * FROM Banking_Details WHERE Account_ID = ? AND Is_Archived = FALSE FOR UPDATE',
        [accountId],
      );
      if (!record) throw bankingError('Banking record not found.', 404, 'BANKING_NOT_FOUND');
      if (record.Verification_Status !== 'pending_review') {
        throw bankingError('Only a submitted banking record can receive a review decision.', 409, 'BANKING_NOT_SUBMITTED');
      }
      if (decision === 'verified') {
        const [requirements] = await connection.query(
          `SELECT r.document_type_id
           FROM scms_document_requirements r
           INNER JOIN scms_document_types t ON t.id = r.document_type_id
           WHERE t.entity_scope = 'banking' AND t.status = 'published'
             AND r.is_active = TRUE AND r.is_required = TRUE
             AND r.effective_from <= CURDATE()
             AND (r.effective_to IS NULL OR r.effective_to >= CURDATE())`,
        );
        if (requirements.length === 0) {
          throw bankingError('Configure and publish at least one required banking evidence type before verification.', 409, 'BANKING_EVIDENCE_NOT_CONFIGURED');
        }
        for (const requirement of requirements) {
          const [[evidence]] = await connection.query(
            `SELECT id FROM scms_document_files
             WHERE document_type_id = ? AND owner_type = 'banking' AND owner_id = ?
               AND status = 'verified' AND uploaded_at >= COALESCE(?, '1970-01-01')
             ORDER BY version_number DESC LIMIT 1`,
            [requirement.document_type_id, String(accountId), record.Evidence_Required_From],
          );
          if (!evidence) throw bankingError('Every required banking evidence file must be verified before the account can be approved.', 409, 'BANKING_EVIDENCE_INCOMPLETE');
        }
      }
      await connection.query(
        `UPDATE Banking_Details SET Verification_Status = ?, Review_Reason = ?,
         Verified_By = ?, Verified_At = ?, Row_Version = Row_Version + 1 WHERE Account_ID = ?`,
        [decision, reason || null, decision === 'verified' ? req.staff.id : null,
          decision === 'verified' ? new Date() : null, accountId],
      );
      const [[updated]] = await connection.query('SELECT * FROM Banking_Details WHERE Account_ID = ?', [accountId]);
      await appendBankingHistory(connection, updated, {
        action: `review_${decision}`, reason, actorType: 'staff', actorId: req.staff.id,
      });
      await connection.query(
        `INSERT INTO scms_audit_events
          (actor_user_id, action, entity_type, entity_id, outcome, reason, correlation_id, details)
         VALUES (?, ?, 'banking', ?, 'success', ?, UUID(), JSON_OBJECT('decision', ?))`,
        [req.staff.id, `banking.${decision}`, String(accountId), reason || null, decision],
      );
    });
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/banking/:accountId', async (req, res) => {
  try {
    const accountId = Number(req.params.accountId);
    await transaction(async connection => {
      const [[record]] = await connection.query('SELECT * FROM Banking_Details WHERE Account_ID = ? AND Is_Archived = FALSE FOR UPDATE', [accountId]);
      if (!record) throw bankingError('Banking record not found.', 404, 'BANKING_NOT_FOUND');
      await connection.query(
        `UPDATE Banking_Details SET Is_Archived = TRUE, Verification_Status = 'archived',
         Row_Version = Row_Version + 1 WHERE Account_ID = ?`, [accountId],
      );
      const [[updated]] = await connection.query('SELECT * FROM Banking_Details WHERE Account_ID = ?', [accountId]);
      await appendBankingHistory(connection, updated, { action: 'archived', actorType: 'staff', actorId: req.staff.id });
      await connection.query(
        `INSERT INTO scms_audit_events
          (actor_user_id, action, entity_type, entity_id, outcome, correlation_id, details)
         VALUES (?, 'banking.archived', 'banking', ?, 'success', UUID(), JSON_OBJECT('parent', ?))`,
        [req.staff.id, String(accountId), updated.P_No_O_No],
      );
    });
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

// GET: Banking details by parent P_No_O_No
app.get('/api/banking/parent/:pNoONo', async (req, res) => {
  try {
    const pNoONo = req.params.pNoONo;
    const rows = await query('SELECT * FROM Banking_Details WHERE P_No_O_No = ? AND Is_Archived = FALSE', [pNoONo]);
    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      res.status(404).json({ error: 'No banking details found for this parent' });
    }
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/children', async (req, res) => {
  try {
    const filter = scopePredicate(req.dataScope, 'pb.Admin_Authority');
    res.json(await query(`SELECT dc.* FROM Dependent_Children dc INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = dc.P_No_O_No WHERE ${filter.sql} ORDER BY dc.Child_ID`, filter.params));
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/children/by-parent/:pNo', async (req, res) => {
  try {
    res.json(await query('SELECT * FROM Dependent_Children WHERE P_No_O_No = ? ORDER BY Child_Name', [req.params.pNo]));
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/children', async (req, res) => {
  try {
    const { P_No_O_No, Child_Name, Age, CNIC_BForm_No, Disease_Disability, Disability_Category, School } = req.body;
    await validateChildReferences(req.body);
    const result = await query(
      `INSERT INTO Dependent_Children
        (P_No_O_No, Child_Name, Age, CNIC_BForm_No, Disease_Disability,
         Parent_Selected_Category, Approved_Category, Disability_Category, Category, School)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [P_No_O_No, Child_Name, Age, CNIC_BForm_No, Disease_Disability, Disability_Category, Disability_Category, Disability_Category, Disability_Category, School]
    );
    await refreshChildCompleteness(pool, result.insertId);
    res.status(201).json(await getChildRecord(result.insertId));
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/children/:childId', async (req, res) => {
  try {
    const childId = Number(req.params.childId);
    const { P_No_O_No, Child_Name, Age, CNIC_BForm_No, Disease_Disability, Disability_Category, School } = req.body;
    const existing = await getChildRecord(childId);
    if (!existing) {
      res.status(404).json({ message: 'Child not found' });
      return;
    }
    await validateChildReferences(req.body, existing);
    await query(
      `UPDATE Dependent_Children
       SET P_No_O_No = ?, Child_Name = ?, Age = ?, CNIC_BForm_No = ?, Disease_Disability = ?,
           Approved_Category = ?, Disability_Category = ?, Category = ?, School = ?
       WHERE Child_ID = ?`,
      [P_No_O_No, Child_Name, Age, CNIC_BForm_No, Disease_Disability, Disability_Category, Disability_Category, Disability_Category, School, childId]
    );
    await refreshChildCompleteness(pool, childId);
    res.json(await getChildRecord(childId));
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/children/:childId', async (req, res) => {
  try {
    const childId = Number(req.params.childId);
    await transaction(async (connection) => {
      await connection.query('DELETE FROM Child_Gadgets WHERE Child_ID = ?', [childId]);
      await connection.query('DELETE FROM Monthly_Grants WHERE Child_ID = ?', [childId]);
      await connection.query('DELETE FROM Dependent_Children WHERE Child_ID = ?', [childId]);
    });
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/grants', async (req, res) => {
  try {
    const filter = scopePredicate(req.dataScope, 'pb.Admin_Authority');
    res.json(await query(`SELECT mg.* FROM Monthly_Grants mg INNER JOIN Dependent_Children dc ON dc.Child_ID = mg.Child_ID INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = dc.P_No_O_No WHERE ${filter.sql} ORDER BY mg.Grant_ID`, filter.params));
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/grants', async (req, res) => {
  try {
    const { Child_ID, Approved_From, Approved_To } = req.body;
    if (!Number.isInteger(Number(Child_ID)) || !Approved_From || !Approved_To) {
      throw grantValidationError('Child, Approved From, and Approved To are required.');
    }
    const grantId = await transaction(async (connection) => {
      const terms = await resolveGrantTerms(connection, Number(Child_ID), Approved_From, Approved_To);
      const [result] = await connection.query(
        `INSERT INTO Monthly_Grants
          (Child_ID, Category, Monthly_Amount, Monthly_Amount_Rs, Total_CFY_Amount,
           Approved_From, Approved_To, Rate_Schedule_ID, Rate_Effective_From, Created_By)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [Child_ID, terms.category, terms.monthlyAmount, terms.monthlyAmount,
          terms.totalAmount, Approved_From, Approved_To, terms.rateScheduleId,
          terms.rateEffectiveFrom, req.staff.id],
      );
      return result.insertId;
    });
    res.status(201).json(await getGrantRecord(grantId));
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/grants/:grantId', async (req, res) => {
  try {
    const grantId = Number(req.params.grantId);
    const { Child_ID, Approved_From, Approved_To } = req.body;
    await transaction(async (connection) => {
      const [existingRows] = await connection.query('SELECT Grant_ID FROM Monthly_Grants WHERE Grant_ID = ? FOR UPDATE', [grantId]);
      if (!existingRows[0]) throw grantValidationError('Grant not found.', 'GRANT_NOT_FOUND');
      const terms = await resolveGrantTerms(connection, Number(Child_ID), Approved_From, Approved_To, grantId);
      await connection.query(
        `UPDATE Monthly_Grants SET Child_ID = ?, Category = ?, Monthly_Amount = ?,
         Monthly_Amount_Rs = ?, Total_CFY_Amount = ?, Approved_From = ?, Approved_To = ?,
         Rate_Schedule_ID = ?, Rate_Effective_From = ?, Row_Version = Row_Version + 1
         WHERE Grant_ID = ?`,
        [Child_ID, terms.category, terms.monthlyAmount, terms.monthlyAmount,
          terms.totalAmount, Approved_From, Approved_To, terms.rateScheduleId,
          terms.rateEffectiveFrom, grantId],
      );
    });
    res.json(await getGrantRecord(grantId));
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/grants/:grantId', async (req, res) => {
  try {
    await query(
      `UPDATE Monthly_Grants SET Status = 'cancelled', Row_Version = Row_Version + 1
       WHERE Grant_ID = ?`,
      [Number(req.params.grantId)],
    );
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/gadgets', async (req, res) => {
  try {
    const filter = scopePredicate(req.dataScope, 'pb.Admin_Authority');
    res.json(await query(`SELECT cg.* FROM Child_Gadgets cg INNER JOIN Dependent_Children dc ON dc.Child_ID = cg.Child_ID INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = dc.P_No_O_No WHERE ${filter.sql} ORDER BY cg.Gadget_ID`, filter.params));
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/gadgets', async (req, res) => {
  try {
    const { Child_ID, Detail_of_Gadgets, Base_Cost, Acquisition_Type } = req.body;
    const result = await query(
      `INSERT INTO Child_Gadgets
        (Child_ID, Detail_of_Gadgets, Base_Cost, Acquisition_Type)
       VALUES (?, ?, ?, ?)`,
      [Child_ID, Detail_of_Gadgets, Base_Cost, Acquisition_Type]
    );
    res.status(201).json(await getGadgetRecord(result.insertId));
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/gadgets/:gadgetId', async (req, res) => {
  try {
    const gadgetId = Number(req.params.gadgetId);
    const { Child_ID, Detail_of_Gadgets, Base_Cost, Acquisition_Type } = req.body;
    await query(
      `UPDATE Child_Gadgets
       SET Child_ID = ?, Detail_of_Gadgets = ?, Base_Cost = ?, Acquisition_Type = ?
       WHERE Gadget_ID = ?`,
      [Child_ID, Detail_of_Gadgets, Base_Cost, Acquisition_Type, gadgetId]
    );
    res.json(await getGadgetRecord(gadgetId));
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/gadgets/:gadgetId', async (req, res) => {
  try {
    await query('DELETE FROM Child_Gadgets WHERE Gadget_ID = ?', [Number(req.params.gadgetId)]);
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/seed-sample', async (_req, res) => {
  try {
    const existingParents = await query('SELECT COUNT(*) AS count FROM Parent_Beneficiary');
    if (existingParents[0].count > 0) {
      res.json({ seeded: false, message: 'Sample data already exists' });
      return;
    }

    const today = new Date();
    const futureDate = new Date();
    futureDate.setFullYear(today.getFullYear() + 1);

    const expiringSoon = new Date();
    expiringSoon.setDate(today.getDate() + 15);

    const parents = [
      ['P-12345', 'Muhammad Ahmad Khan', 'Captain', '5th Infantry Battalion', 'GHQ Rawalpindi', 'Serving', '35201-1234567-1'],
      ['P-12346', 'Ali Hassan Shah', 'Major', '10th Artillery Regiment', 'GHQ Rawalpindi', 'Retired', '35201-2345678-2'],
      ['P-12347', 'Fatima Bibi', 'Lieutenant Colonel', 'Medical Corps', 'CMH Lahore', 'Serving', '35201-3456789-3'],
      ['P-12348', 'Imranullah Khan', 'Naib Subedar', 'Frontier Force Regiment', 'Peshawar Garrison', 'Expired', '35201-4567890-4']
    ];

    const documents = [
      ['P-12345', 'GHQ/2024/1234', '0300-1234567', 'A-01', 'F-1001'],
      ['P-12346', 'GHQ/2024/1235', '0300-2345678', 'A-02', 'F-1002'],
      ['P-12347', 'CMH/2024/567', '0300-3456789', 'B-01', 'F-2001'],
      ['P-12348', 'PG/2024/890', '0300-4567890', 'A-03', 'F-1003']
    ];

    const banking = [
      ['P-12345', 'Muhammad Ahmad Khan', 'PK36SCBL0000001123456701', 'Standard Chartered Bank, Lahore'],
      ['P-12346', 'Ali Hassan Shah', 'PK36SCBL0000001123456702', 'Standard Chartered Bank, Islamabad'],
      ['P-12347', 'Fatima Bibi', 'PK36SCBL0000001123456703', 'HBL Bank, Lahore'],
      ['P-12348', 'Imranullah Khan', 'PK36SCBL0000001123456704', 'UBL Bank, Peshawar']
    ];

    const children = [
      ['P-12345', 'Ahmad Khan Jr.', 8, '35201-1234567-0001', 'Autism Spectrum Disorder', 'A', 'Special Education School Lahore'],
      ['P-12345', 'Sara Khan', 12, '35201-1234567-0002', 'Cerebral Palsy', 'B', 'Rehabilitation Center Islamabad'],
      ['P-12346', 'Hassan Shah', 6, '35201-2345678-0001', 'Down Syndrome', 'A', 'Special Children Academy'],
      ['P-12347', 'Ayesha Bibi', 15, '35201-3456789-0001', 'Hearing Impairment', 'C', 'Deaf Reach School'],
      ['P-12348', 'Kamran Khan', 10, '35201-4567890-0001', 'Visual Impairment', 'B', 'Blind School Peshawar']
    ];

    await transaction(async (connection) => {
      for (const parent of parents) {
        await connection.query(
          `INSERT INTO Parent_Beneficiary
            (P_No_O_No, Parent_Name, Rank_Rate, Unit, Admin_Authority, Service_Status, Parent_CNIC)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          parent
        );
      }

      for (const document of documents) {
        await connection.query(
          `INSERT INTO Document_Tracking
            (P_No_O_No, Letter_Reference, Contact_No, Almirah_No, File_No)
           VALUES (?, ?, ?, ?, ?)`,
          document
        );
      }

      for (const record of banking) {
        await connection.query(
          `INSERT INTO Banking_Details
            (P_No_O_No, Account_Title, IBAN, Bank_Name_Branch)
           VALUES (?, ?, ?, ?)`,
          record
        );
      }

      for (const child of children) {
        await connection.query(
          `INSERT INTO Dependent_Children
            (P_No_O_No, Child_Name, Age, CNIC_BForm_No, Disease_Disability, Disability_Category, School)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          child
        );
      }

      const childRows = await connection.query('SELECT Child_ID, P_No_O_No FROM Dependent_Children ORDER BY Child_ID');
      const [rows] = childRows;
      const childIds = rows.map((row) => row.Child_ID);

      for (let index = 0; index < childIds.length; index += 1) {
        const childId = childIds[index];
        const approvedTo = index === 2 || index === 4 ? expiringSoon : futureDate;
        const amount = [25000, 35000, 28000, 15000, 22000][index];
        await connection.query(
          `INSERT INTO Monthly_Grants
            (Child_ID, Monthly_Amount, Total_CFY_Amount, Approved_From, Approved_To)
           VALUES (?, ?, ?, ?, ?)`,
          [childId, amount, amount * 12, today.toISOString().split('T')[0], approvedTo.toISOString().split('T')[0]]
        );
      }

      const gadgetRecords = [
        [1, 'Communication Tablet with AAC Software', 85000, 'Off the Shelf'],
        [2, 'Motorized Wheelchair', 150000, 'Customized'],
        [3, 'Educational Tablet', 45000, 'Reimbursed'],
        [4, 'Hearing Aids (Pair)', 120000, 'Off the Shelf'],
        [5, 'Braille Display Device', 95000, 'Reimbursed']
      ];

      for (const gadget of gadgetRecords) {
        const [childId, detail, cost, acquisition] = gadget;
        await connection.query(
          `INSERT INTO Child_Gadgets
            (Child_ID, Detail_of_Gadgets, Base_Cost, Acquisition_Type)
           VALUES (?, ?, ?, ?)`,
          [childId, detail, cost, acquisition]
        );
      }
    });

    res.json({ seeded: true });
  } catch (error) {
    sendError(res, error);
  }
});

await runMigrations();
await ensureSchema();
const recoveredImports = await recoverImportWorkers();
if (recoveredImports.resumedExecutions || recoveredImports.resumedRollbacks || recoveredImports.cleanedSources) {
  console.log(`[Imports] Resuming ${recoveredImports.resumedExecutions} execution(s), ${recoveredImports.resumedRollbacks} rollback(s), and cleaned ${recoveredImports.cleanedSources} expired source file(s).`);
}

// =============================================================================
// PARENT PORTAL SYNC - Admin Approval Bridge
// =============================================================================

// AllApproval:
const getAllApprovals = async () => {
  try {
    const response = await axios.get(`${PORTAL_API_URL}/api/sync/all-requests`, {
      headers: { 'x-api-key': PORTAL_API_KEY },
      timeout: 5000
    });
    return response.data;
  } catch (error) {
    console.error('[Portal Sync] Failed to fetch approvals:', error.message);
    return [];
  }
};

// getPendingApprovals for the approve action
const getPendingApprovals = async () => {
  try {
    // Fetch all pending requests (including children) from portal
    const response = await axios.get(`${PORTAL_API_URL}/api/sync/pending`, {
      headers: { 'x-api-key': PORTAL_API_KEY },
      timeout: 5000
    });

    return response.data;
  } catch (error) {
    console.error('[Portal Sync] Failed to fetch pending approvals:', error.message);
    return [];
  }
};

// Helper: sync admin-created parent TO portal
const syncParentToPortal = async (parentData, adminId) => {
  try {
    const response = await axios.post(
      `${PORTAL_API_URL}/api/sync/admin-created-parent`,
      {
        pNoONo: parentData.P_No_O_No,
        parentName: parentData.Parent_Name,
        rankRate: parentData.Rank_Rate,
        unit: parentData.Unit,
        contactNo: parentData.Contact_No || null,
        cnic: parentData.Parent_CNIC,
        serviceStatus: parentData.Service_Status,
        email: parentData.Email || `${parentData.P_No_O_No}@system.local`,
        adminId: adminId || 1
      },
      {
        headers: { 'x-api-key': PORTAL_API_KEY },
        timeout: 5000
      }
    );
    return response.data;
  } catch (error) {
    console.error('[Portal Sync] Failed to sync parent:', error.message);
    throw new Error('Portal sync failed');
  }
};

// GET: List pending approval requests from parent portal
app.get('/api/admin/pending-approvals', async (req, res) => {
  try {
    const approvals = await getPendingApprovals();
    res.json(approvals);
  } catch (error) {
    sendError(res, error, 'Failed to fetch approvals');
  }
});

// GET: List children with status from parent portal
app.get('/api/admin/children', async (req, res) => {
  try {
    const response = await axios.get(`${PORTAL_API_URL}/api/admin/children`, {
      headers: { 'x-api-key': PORTAL_API_KEY },
      timeout: 5000
    });
    res.json(response.data);
  } catch (error) {
    sendError(res, error, 'Failed to fetch children');
  }
});

// POST: Update child status
app.post('/api/admin/update-child-status/:childId', async (req, res) => {
  try {
    const { childId } = req.params;
    const { status } = req.body;

    const response = await axios.post(
      `${PORTAL_API_URL}/api/admin/update-child-status/${childId}`,
      { status },
      {
        headers: { 'x-api-key': PORTAL_API_KEY },
        timeout: 5000
      }
    );
    res.json(response.data);
  } catch (error) {
    sendError(res, error, 'Failed to update child status');
  }
});

// POST: Review a parent registration, child addition, or controlled parent field change.
app.post('/api/admin/approve-request', async (req, res) => {
  const { requestId, requestType, action, notes, approvedCategory } = req.body;
  const allowedActions = ['approve', 'changes_required', 'reject', 'block'];

  if (!requestId || !allowedActions.includes(action)) {
    res.status(400).json({ message: 'Invalid review request.' });
    return;
  }
  if (action === 'block' && !req.staff.permissions.includes('applications.block')) {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Blocking online access requires applications.block.'
      }
    });
    return;
  }
  if (['changes_required', 'reject', 'block'].includes(action) && !String(notes || '').trim()) {
    res.status(400).json({
      message: 'A parent-facing reason is required for this decision.'
    });
    return;
  }

  try {
    const approvals = await getPendingApprovals();
    const request = approvals.find((a) => (a.id || a.request_id) === Number(requestId) && (!requestType || a.request_type === requestType));

    if (!request) {
      res.status(404).json({ message: 'Request not found or already processed' });
      return;
    }

    if (request.request_type === 'parent_field_change') {
      await transaction(async (connection) => {
        const [[changeRequest]] = await connection.query(`SELECT * FROM scms_parent_change_requests WHERE id = ? FOR UPDATE`, [Number(requestId)]);
        if (!changeRequest || !['pending', 'changes_required'].includes(changeRequest.status)) {
          const error = new Error('This profile change request is no longer reviewable.');
          error.status = 409;
          error.publicCode = 'REQUEST_NOT_REVIEWABLE';
          throw error;
        }

        if (action === 'approve') {
          const proposed = typeof changeRequest.proposed_values === 'string' ? JSON.parse(changeRequest.proposed_values) : changeRequest.proposed_values || {};
          const [policies] = await connection.query(
            `SELECT field_code, update_mode, reference_type, is_required
                         FROM scms_parent_field_policies WHERE is_active = TRUE`
          );
          const allowedPolicies = new Map(policies.map((policy) => [policy.field_code, policy]));
          const updates = [];
          const values = [];
          for (const [fieldCode, rawValue] of Object.entries(proposed)) {
            const policy = allowedPolicies.get(fieldCode);
            const column = PARENT_FIELD_COLUMNS[fieldCode];
            if (!policy || policy.update_mode !== 'approval' || !column) continue;
            const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
            if (policy.is_required && !String(value || '').trim()) {
              const error = new Error(`${fieldCode} is required.`);
              error.status = 400;
              error.publicCode = 'REQUIRED_PROFILE_FIELD';
              throw error;
            }
            if (policy.reference_type) {
              await assertReferenceValue(connection, policy.reference_type, value, { optional: !policy.is_required });
            }
            updates.push(`${column} = ?`);
            values.push(value || null);
          }
          if (updates.length === 0) {
            const error = new Error('No currently permitted changes remain in this request.');
            error.status = 409;
            error.publicCode = 'NO_REVIEWABLE_CHANGES';
            throw error;
          }
          if (Object.prototype.hasOwnProperty.call(proposed, 'cnic')) {
            await connection.query(
              `UPDATE scms_parent_identifiers SET is_primary = FALSE
                             WHERE parent_p_no_o_no = ? AND identifier_type = 'cnic'`,
              [changeRequest.parent_p_no_o_no]
            );
            await syncParentIdentifiers(connection, changeRequest.parent_p_no_o_no, proposed.cnic, { source: 'approved_parent_change', verified: true });
          }
          await connection.query(
            `UPDATE Parent_Beneficiary SET ${updates.join(', ')},
                         Status = CASE WHEN Status IN ('pending', 'changes_required') THEN 'approved' ELSE Status END
                         WHERE P_No_O_No = ?`,
            [...values, changeRequest.parent_p_no_o_no]
          );
          const completeness = await refreshParentCompleteness(connection, changeRequest.parent_p_no_o_no);
          if (completeness?.recordState === 'complete') {
            await connection.query(
              `UPDATE Parent_Beneficiary SET Is_Provisional = FALSE,
                             Claimed_At = COALESCE(Claimed_At, CURRENT_TIMESTAMP(3)) WHERE P_No_O_No = ?`,
              [changeRequest.parent_p_no_o_no]
            );
          }
        } else {
          const parentStatus = action === 'block' ? 'blocked' : action === 'changes_required' ? 'changes_required' : null;
          if (parentStatus) {
            await connection.query(
              `UPDATE Parent_Beneficiary SET Status = ?,
                             Block_Reason = CASE WHEN ? = 'blocked' THEN ? ELSE Block_Reason END,
                             Blocked_At = CASE WHEN ? = 'blocked' THEN CURRENT_TIMESTAMP(3) ELSE Blocked_At END,
                             Credential_Version = CASE WHEN ? = 'blocked' THEN Credential_Version + 1 ELSE Credential_Version END
                             WHERE P_No_O_No = ?`,
              [parentStatus, parentStatus, String(notes).trim(), parentStatus, parentStatus, changeRequest.parent_p_no_o_no]
            );
          }
        }
        const requestStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : action;
        await connection.query(
          `UPDATE scms_parent_change_requests SET status = ?, review_reason = ?,
                     reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
          [requestStatus, String(notes || '').trim() || 'Approved after staff review', req.staff.id, Number(requestId)]
        );
        await connection.query(
          `INSERT INTO scms_audit_events
                      (actor_user_id, action, entity_type, entity_id, reason, correlation_id, details)
                     VALUES (?, ?, 'parent_change_request', ?, ?, UUID(), JSON_OBJECT('parent', ?, 'decision', ?))`,
          [req.staff.id, `parent_change_request.${requestStatus}`, String(requestId), String(notes || '').trim() || null, changeRequest.parent_p_no_o_no, requestStatus]
        );
      });
      res.json({
        success: true,
        message: `Profile change request ${action === 'approve' ? 'approved' : action.replace('_', ' ')}.`
      });
      return;
    }

    let mainDbChildId = null;

    if (action === 'approve') {
      // Insert into MAIN database (pnba) - this is the only write path
      if (request.request_type === 'parent_registration') {
        // Check if parent already exists in main DB
        const existing = await query('SELECT P_No_O_No FROM Parent_Beneficiary WHERE P_No_O_No = ?', [request.p_no_o_no]);

        if (existing.length === 0) {
          const payload = request.payload;
          await query(
            `INSERT INTO Parent_Beneficiary
                         (P_No_O_No, Parent_Name, Rank_Rate, Unit, Admin_Authority, Service_Status, Parent_CNIC)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              request.p_no_o_no,
              payload.parentName,
              payload.rankRate,
              payload.unit,
              payload.adminAuthority || null, // Admin_Authority not in portal payload
              payload.serviceStatus,
              payload.cnic
            ]
          );
        }
      } else if (request.request_type === 'child_addition') {
        const category = typeof approvedCategory === 'string' ? approvedCategory.trim() : '';
        if (!category) {
          res.status(400).json({ message: 'Choose an approved category.' });
          return;
        }
        await assertReferenceValue(pool, 'category', category);
        // For child additions, just update the status since child is already in database
        const newStatus = action === 'approve' ? 'approved' : 'rejected';

        // Get the actual Child_ID from the request
        const childIdToUpdate = request.id || requestId;
        try {
          await transaction(async (connection) => {
            const [[child]] = await connection.query('SELECT Parent_Selected_Category FROM dependent_children WHERE Child_ID = ? FOR UPDATE', [childIdToUpdate]);
            await connection.query(
              `UPDATE dependent_children SET Status = ?, Approved_Category = ?,
                             Disability_Category = ?, Category = ? WHERE Child_ID = ?`,
              [newStatus, category, category, category, childIdToUpdate]
            );
            await connection.query(
              `INSERT INTO scms_child_category_decisions
                              (child_id, claimed_category, approved_category, reason, decided_by)
                             VALUES (?, ?, ?, ?, ?)`,
              [childIdToUpdate, child?.Parent_Selected_Category || null, category, notes?.trim() || 'Approved after staff review', req.staff.id]
            );
          });
        } catch (updateError) {
          console.error('Admin: Failed to update child status:', updateError);
          throw updateError;
        }

        mainDbChildId = childIdToUpdate; // Child already exists, use existing ID
      }
    }

    // Notify portal system of the decision
    await axios.post(
      `${PORTAL_API_URL}/api/sync/approval`,
      {
        requestId: Number(requestId),
        requestType: request.request_type,
        action,
        adminNotes: notes || '',
        mainDbChildId,
        approvedCategory: action === 'approve' && request.request_type === 'child_addition' ? approvedCategory : null
      },
      {
        headers: { 'x-api-key': PORTAL_API_KEY },
        timeout: 5000
      }
    );

    res.json({ success: true, message: `Request ${action}d successfully` });
  } catch (error) {
    sendError(res, error, 'Approval processing failed');
  }
});

// POST: Create parent in main DB + sync to portal (admin action)
app.post('/api/admin/parents-with-portal', async (req, res) => {
  try {
    const { P_No_O_No, Parent_Name, Rank_Rate, Unit, Admin_Authority, Service_Status, Parent_CNIC, Email } = req.body;

    // Insert into main DB first
    await query(
      `INSERT INTO Parent_Beneficiary
             (P_No_O_No, Parent_Name, Rank_Rate, Unit, Admin_Authority, Service_Status, Parent_CNIC)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [P_No_O_No, Parent_Name, Rank_Rate, Unit, Admin_Authority || null, Service_Status, Parent_CNIC]
    );

    // Sync to portal (creates login credentials)
    let portalData = null;
    try {
      portalData = await syncParentToPortal(
        {
          P_No_O_No,
          Parent_Name,
          Rank_Rate,
          Unit,
          Contact_No: null,
          Parent_CNIC,
          Service_Status,
          Email
        },
        req.staff.id
      );
    } catch (syncErr) {
      console.error('[Portal Sync] Error:', syncErr.message);
    }

    const newParent = await getParentRecord(P_No_O_No);

    res.status(201).json({
      ...newParent,
      portalAccess: portalData
        ? {
            loginId: P_No_O_No,
            oneTimePassword: portalData.oneTimePassword,
            expiresAt: portalData.expiresAt,
            note: 'Shown once. Share securely; it expires in 24 hours and must be changed.'
          }
        : {
            note: 'Portal sync failed - retry from admin panel'
          }
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/admin/reset-parent-password', async (req, res, next) => {
  try {
    const pNoONo = typeof req.body?.pNoONo === 'string' ? req.body.pNoONo.trim() : '';
    if (!pNoONo) {
      res.status(400).json({
        error: { code: 'INVALID_PARENT', message: 'P.No/O.No is required.' }
      });
      return;
    }
    const response = await axios.post(`${PORTAL_API_URL}/api/sync/reset-parent-password`, { pNoONo, actorUserId: req.staff.id }, { headers: { 'x-api-key': PORTAL_API_KEY }, timeout: 5000 });
    await pool.query(
      `INSERT INTO scms_audit_events
              (actor_user_id, action, entity_type, entity_id, correlation_id, details)
             VALUES (?, 'parent.one_time_password.issued', 'parent', ?, UUID(), JSON_OBJECT('expiresAt', ?))`,
      [req.staff.id, pNoONo, response.data.expiresAt]
    );
    res.json(response.data);
  } catch (error) {
    if (error.response?.status === 404) {
      res.status(404).json({
        error: {
          code: 'PARENT_NOT_FOUND',
          message: 'Parent account was not found.'
        }
      });
      return;
    }
    next(error);
  }
});

app.post('/api/admin/parents/:pNo/restore-access', async (req, res, next) => {
  const pNo = String(req.params.pNo || '').trim();
  const reason = String(req.body?.reason || '').trim();
  if (!pNo || reason.length < 5) {
    res.status(400).json({
      error: {
        code: 'RESTORE_REASON_REQUIRED',
        message: 'A restore reason of at least 5 characters is required.'
      }
    });
    return;
  }

  try {
    const restoredStatus = await transaction(async (connection) => {
      const [[parent]] = await connection.query('SELECT Status, Record_State FROM Parent_Beneficiary WHERE P_No_O_No = ? FOR UPDATE', [pNo]);
      if (!parent) {
        const error = new Error('Parent account not found.');
        error.status = 404;
        error.publicCode = 'PARENT_NOT_FOUND';
        throw error;
      }
      if (!['blocked', 'rejected'].includes(parent.Status)) {
        const error = new Error('Only blocked or rejected parent access can be restored.');
        error.status = 409;
        error.publicCode = 'ACCOUNT_NOT_RESTRICTED';
        throw error;
      }
      const nextStatus = parent.Record_State === 'complete' ? 'approved' : 'changes_required';
      await connection.query(
        `UPDATE Parent_Beneficiary
                 SET Status = ?, Block_Reason = NULL, Blocked_At = NULL,
                     Credential_Version = Credential_Version + 1
                 WHERE P_No_O_No = ?`,
        [nextStatus, pNo]
      );
      await connection.query(
        `INSERT INTO scms_audit_events
                  (actor_user_id, action, entity_type, entity_id, reason, correlation_id, details)
                 VALUES (?, 'parent.portal_access_restored', 'parent', ?, ?, UUID(),
                         JSON_OBJECT('previousStatus', ?, 'restoredStatus', ?))`,
        [req.staff.id, pNo, reason, parent.Status, nextStatus]
      );
      return nextStatus;
    });
    res.json({
      message: 'Parent portal access restored. Existing sessions remain revoked.',
      status: restoredStatus
    });
  } catch (error) {
    next(error);
  }
});

// GET: Check portal connection health
app.get('/api/admin/portal-health', async (_req, res) => {
  try {
    const response = await axios.get(`${PORTAL_API_URL}/health`, {
      timeout: 3000
    });
    res.json({ connected: true, portal: response.data });
  } catch (error) {
    console.error('Parent portal health check failed:', error.message);
    res.status(503).json({ connected: false, error: 'Parent portal is unavailable' });
  }
});

// GET: Child documents from portal
app.get('/api/admin/child-documents', async (req, res) => {
  const { childId } = req.query;

  if (!childId) return res.status(400).json({ error: 'childId required' });

  try {
    const url = `${PORTAL_API_URL}/api/children/${childId}/documents`;

    const response = await axios.get(url, {
      headers: { 'x-api-key': PORTAL_API_KEY },
      timeout: 5000
    });

    res.json(response.data);
  } catch (error) {
    console.error('Admin: Failed to fetch documents:', error.message);
    if (error.response) console.error('Admin: Portal response status:', error.response.status);
    res.status(502).json({ error: 'Failed to fetch documents' });
  }
});

// GET: View document image (proxies to portal file system)
app.get('/api/admin/document-view', async (req, res) => {
  const { path: filePath } = req.query;

  if (!filePath) return res.status(400).json({ error: 'Path required' });

  try {
    // Forward to portal's document viewer
    const url = `${PORTAL_API_URL}/api/documents/view`;

    const response = await axios.get(url, {
      headers: { 'x-api-key': PORTAL_API_KEY },
      params: { path: filePath },
      responseType: 'stream',
      timeout: 10000
    });

    res.set('Content-Type', response.headers['content-type']);
    response.data.pipe(res);
  } catch (error) {
    console.error('Admin: Failed to fetch document:', error.message);
    if (error.response) console.error('Admin: Portal response status:', error.response.status);
    res.status(404).json({ error: 'Document not found' });
  }
});

async function getAuthorityNames() {
  const rows = await query(
    `SELECT name AS authority FROM scms_reference_items
       WHERE item_type = 'authority' AND is_active = TRUE
       ORDER BY sort_order, name`
  );
  return rows.map((row) => row.authority);
}

// Temporary shared-authority authentication. The long-term target remains named RBAC accounts.
app.post('/api/auth/authority-login', async (req, res) => {
  if (!ENABLE_LEGACY_AUTHORITY_LOGIN) {
    return res.status(410).json({
      message: 'Legacy shared authority login is disabled. Use an assigned staff account.'
    });
  }
  const authority = typeof req.body?.authority === 'string' ? req.body.authority.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!authority || !password) return res.status(400).json({ message: 'Authority and password are required' });

  try {
    const [authRows] = await pool.execute(
      `SELECT id, password_hash, must_change_password, temporary_password_expires_at, credential_version
             FROM authority_passwords WHERE authority = ?`,
      [authority]
    );
    const credential = authRows[0];
    if (!credential || !credential.password_hash || !(await verifyPassword(password, credential.password_hash))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    if (credential.must_change_password && credential.temporary_password_expires_at && new Date(credential.temporary_password_expires_at).getTime() <= Date.now()) {
      return res.status(403).json({
        message: 'The temporary password has expired. Contact an authorized administrator for a reset.'
      });
    }

    const token = jwt.sign(
      {
        type: 'authority',
        authority,
        credentialVersion: Number(credential.credential_version)
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({
      token,
      authority,
      mustChangePassword: Boolean(credential.must_change_password)
    });
  } catch (error) {
    console.error('Authority login error:', error instanceof Error ? error.message : error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Staff override: requires the dedicated authority_accounts.reset_password permission.
app.post('/api/auth/reset-authority-password', async (req, res, next) => {
  const authority = typeof req.body?.authority === 'string' ? req.body.authority.trim() : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  if (!authority || newPassword.length < 12) {
    return res.status(400).json({
      message: 'Select an authority and use a temporary password of at least 12 characters.'
    });
  }

  const connection = await pool.getConnection();
  try {
    const knownAuthorities = await getAuthorityNames();
    if (!knownAuthorities.includes(authority)) return res.status(404).json({ message: 'Authority not found' });
    const passwordHash = await hashPassword(newPassword);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO authority_passwords
              (authority, password, password_hash, must_change_password,
               temporary_password_expires_at, credential_version, reset_by)
             VALUES (?, NULL, ?, TRUE, ?, 1, ?)
             ON DUPLICATE KEY UPDATE
               password = NULL,
               password_hash = VALUES(password_hash),
               must_change_password = TRUE,
               temporary_password_expires_at = VALUES(temporary_password_expires_at),
               credential_version = credential_version + 1,
               reset_by = VALUES(reset_by)`,
      [authority, passwordHash, expiresAt, req.staff.id]
    );
    await connection.query(
      `INSERT INTO scms_audit_events
              (actor_user_id, action, entity_type, entity_id, correlation_id, details)
             VALUES (?, 'authority.password_reset', 'authority', ?, UUID(), JSON_OBJECT('expiresAt', ?))`,
      [req.staff.id, authority, expiresAt.toISOString()]
    );
    await connection.commit();
    res.json({
      message: 'Temporary authority password issued.',
      temporaryPasswordExpiresAt: expiresAt
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

// Get authority credential status for staff settings. No hashes or secrets leave the server.
app.get('/api/auth/authorities', async (_req, res) => {
  try {
    const authorities = await getAuthorityNames();
    const [passwordRows] = await pool.execute(
      `SELECT authority, password_hash, must_change_password,
                    temporary_password_expires_at, updated_at
             FROM authority_passwords`
    );
    const statusByAuthority = new Map(passwordRows.map((row) => [row.authority, row]));
    res.json(
      authorities.map((authority) => {
        const credential = statusByAuthority.get(authority);
        return {
          value: authority,
          label: authority,
          hasCredential: Boolean(credential?.password_hash),
          mustChangePassword: Boolean(credential?.must_change_password),
          temporaryPasswordExpiresAt: credential?.temporary_password_expires_at || null,
          lastUpdated: credential?.updated_at || null
        };
      })
    );
  } catch (error) {
    console.error('Get authorities error:', error instanceof Error ? error.message : error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Authority middleware verifies the credential version so a Director reset revokes old JWTs.
const authenticateAuthority = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || !JWT_SECRET) return res.status(401).json({ message: 'Authority sign-in is required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'authority' || typeof decoded.authority !== 'string') {
      return res.status(403).json({ message: 'Invalid token type' });
    }
    const [rows] = await pool.execute(
      `SELECT id, must_change_password, credential_version
             FROM authority_passwords WHERE authority = ?`,
      [decoded.authority]
    );
    const credential = rows[0];
    if (!credential || Number(credential.credential_version) !== Number(decoded.credentialVersion)) {
      return res.status(401).json({ message: 'Authority session is no longer valid' });
    }
    const isPasswordChange = String(req.originalUrl || '').startsWith('/api/authority/change-password');
    if (credential.must_change_password && !isPasswordChange) {
      return res.status(403).json({
        message: 'Replace the temporary password before accessing authority data.'
      });
    }
    req.authority = decoded.authority;
    req.authorityCredentialId = Number(credential.id);
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired authority session' });
  }
};

// Authority self-service: requires the current password and immediately revokes the old JWT.
app.post('/api/authority/change-password', authenticateAuthority, async (req, res, next) => {
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  if (!currentPassword || newPassword.length < 12) {
    return res.status(400).json({ message: 'The new password must be at least 12 characters.' });
  }
  if (currentPassword === newPassword)
    return res.status(400).json({
      message: 'Choose a password different from the current password.'
    });

  try {
    const [rows] = await pool.execute('SELECT password_hash FROM authority_passwords WHERE id = ?', [req.authorityCredentialId]);
    if (!rows[0] || !(await verifyPassword(currentPassword, rows[0].password_hash))) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }
    const passwordHash = await hashPassword(newPassword);
    await pool.execute(
      `UPDATE authority_passwords
             SET password = NULL, password_hash = ?, must_change_password = FALSE,
                 temporary_password_expires_at = NULL, credential_version = credential_version + 1
             WHERE id = ?`,
      [passwordHash, req.authorityCredentialId]
    );
    await pool.execute(
      `INSERT INTO scms_audit_events
              (action, entity_type, entity_id, correlation_id, details)
             VALUES ('authority.change_password', 'authority', ?, UUID(), JSON_OBJECT('selfService', TRUE))`,
      [req.authority]
    );
    res.json({
      message: 'Password changed. Sign in again with the new password.'
    });
  } catch (error) {
    next(error);
  }
});

// Authority-specific data endpoints
app.get('/api/authority/parents', authenticateAuthority, async (req, res) => {
  try {
    const [parents] = await pool.execute(`SELECT ${parentSafeColumns} FROM Parent_Beneficiary WHERE Admin_Authority = ? ORDER BY Parent_Name`, [req.authority]);
    res.json(parents);
  } catch (error) {
    console.error('Failed to fetch authority parents:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/authority/children', authenticateAuthority, async (req, res) => {
  try {
    const [children] = await pool.execute(
      `
            SELECT dc.* FROM Dependent_Children dc
            INNER JOIN Parent_Beneficiary pb ON dc.P_No_O_No = pb.P_No_O_No
            WHERE pb.Admin_Authority = ?
            ORDER BY dc.Child_Name
        `,
      [req.authority]
    );
    res.json(children);
  } catch (error) {
    console.error('Failed to fetch authority children:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/authority/grants', authenticateAuthority, async (req, res) => {
  try {
    const [grants] = await pool.execute(
      `
            SELECT mg.* FROM Monthly_Grants mg
            INNER JOIN Dependent_Children dc ON mg.Child_ID = dc.Child_ID
            INNER JOIN Parent_Beneficiary pb ON dc.P_No_O_No = pb.P_No_O_No
            WHERE pb.Admin_Authority = ?
            ORDER BY mg.Grant_ID DESC
        `,
      [req.authority]
    );
    res.json(grants);
  } catch (error) {
    console.error('Failed to fetch authority grants:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/authority/gadgets', authenticateAuthority, async (req, res) => {
  try {
    const [gadgets] = await pool.execute(
      `
            SELECT cg.* FROM Child_Gadgets cg
            INNER JOIN Dependent_Children dc ON cg.Child_ID = dc.Child_ID
            INNER JOIN Parent_Beneficiary pb ON dc.P_No_O_No = pb.P_No_O_No
            WHERE pb.Admin_Authority = ?
            ORDER BY cg.Gadget_ID DESC
        `,
      [req.authority]
    );
    res.json(gadgets);
  } catch (error) {
    console.error('Failed to fetch authority gadgets:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

//===============================================================================================================

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const correlationId = crypto.randomUUID();
  console.error(`[${correlationId}] Unhandled request error:`, error instanceof Error ? error.message : error);
  const duplicate = error?.code === 'ER_DUP_ENTRY';
  const status = Number(error?.status) || (duplicate ? 409 : 500);
  res.status(status).json({
    error: {
      code: error?.publicCode || (duplicate ? 'DUPLICATE_VALUE' : 'INTERNAL_ERROR'),
      message: error?.publicCode ? error.message : duplicate ? 'That username, email, role, or scope name is already in use.' : 'The request could not be completed.',
      correlationId
    }
  });
});

app.listen(port, () => {
  console.log(`API server running at http://localhost:${port}`);
  console.log(`[Portal Sync] Connected to: ${PORTAL_API_URL}`);
});
