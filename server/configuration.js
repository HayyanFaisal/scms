import crypto from 'crypto';
import { refreshParentCompleteness } from './profile-lifecycle.js';

const REFERENCE_TYPES = {
  authority: { label: 'Authorities', valueColumn: 'Admin_Authority' },
  school: { label: 'Schools', valueColumn: 'School' },
  rank: { label: 'Ranks / Rates', valueColumn: 'Rank_Rate' },
  unit: { label: 'Units', valueColumn: 'Unit' },
  service_status: { label: 'Service Statuses', valueColumn: 'Service_Status' },
  category: { label: 'Categories', valueColumn: 'Disability_Category' }
};

export const REFERENCE_TYPE_CODES = Object.keys(REFERENCE_TYPES);

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.publicCode = code;
  return error;
}

function requiredString(value, label, maximum) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw httpError(400, 'VALIDATION_ERROR', `${label} is required.`);
  if (normalized.length > maximum) throw httpError(400, 'VALIDATION_ERROR', `${label} is too long.`);
  return normalized;
}

function optionalString(value, maximum) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).trim();
  if (normalized.length > maximum) throw httpError(400, 'VALIDATION_ERROR', 'A supplied value is too long.');
  return normalized || null;
}

export function referenceCode(value) {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .slice(0, 80);
  return normalized || 'ITEM';
}

function serializeItem(row) {
  let metadata = {};
  try {
    metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {};
  } catch {
    metadata = {};
  }
  return {
    id: Number(row.id),
    type: row.item_type,
    code: row.code,
    name: row.name,
    description: row.description || '',
    sortOrder: Number(row.sort_order || 0),
    metadata,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function loadReferenceData(pool, { includeInactive = false } = {}) {
  const [rows] = await pool.query(
    `SELECT id, item_type, code, name, description, sort_order, metadata,
            is_active, created_at, updated_at
     FROM scms_reference_items
     ${includeInactive ? '' : 'WHERE is_active = TRUE'}
     ORDER BY item_type, sort_order, name`
  );
  const grouped = Object.fromEntries(REFERENCE_TYPE_CODES.map(type => [type, []]));
  for (const row of rows) {
    if (!grouped[row.item_type]) grouped[row.item_type] = [];
    grouped[row.item_type].push(serializeItem(row));
  }
  return {
    types: Object.entries(REFERENCE_TYPES).map(([code, definition]) => ({ code, label: definition.label })),
    items: grouped
  };
}

export async function assertReferenceValue(pool, itemType, value, { allowInactiveValue = null, optional = false } = {}) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized && optional) return null;
  if (!REFERENCE_TYPES[itemType]) throw new Error(`Unknown reference type ${itemType}`);
  const [rows] = await pool.query(
    `SELECT id, name, is_active FROM scms_reference_items
     WHERE item_type = ? AND name = ?`,
    [itemType, normalized]
  );
  if (!rows[0]) throw httpError(400, 'INVALID_REFERENCE_VALUE', `${normalized || 'The supplied value'} is not a configured ${REFERENCE_TYPES[itemType].label.toLowerCase()} value.`);
  if (!rows[0].is_active && normalized !== allowInactiveValue) {
    throw httpError(400, 'INACTIVE_REFERENCE_VALUE', `${normalized} is archived and cannot be selected for new changes.`);
  }
  return serializeItem({ ...rows[0], item_type: itemType, code: '', description: '', sort_order: 0, metadata: null });
}

async function updateStringReferences(connection, itemType, previousName, nextName) {
  const updates = {
    authority: [
      ['Parent_Beneficiary', 'Admin_Authority'],
      ['Dependent_Children', 'Authority'],
      ['authority_passwords', 'authority']
    ],
    school: [['Dependent_Children', 'School']],
    rank: [['Parent_Beneficiary', 'Rank_Rate']],
    unit: [['Parent_Beneficiary', 'Unit']],
    service_status: [['Parent_Beneficiary', 'Service_Status']],
    category: [
      ['Dependent_Children', 'Disability_Category'],
      ['Dependent_Children', 'Category'],
      ['Monthly_Grants', 'Category']
    ]
  };
  for (const [table, column] of updates[itemType] || []) {
    await connection.query(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`, [nextName, previousName]);
  }

  if (itemType === 'authority') {
    const [scopes] = await connection.query(
      `SELECT id, configuration FROM scms_data_scopes
       WHERE scope_type IN ('selected_authorities', 'assigned_authority')`
    );
    for (const scope of scopes) {
      let configuration;
      try {
        configuration = typeof scope.configuration === 'string' ? JSON.parse(scope.configuration) : scope.configuration || {};
      } catch {
        configuration = {};
      }
      if (!Array.isArray(configuration.authorities) || !configuration.authorities.includes(previousName)) continue;
      configuration.authorities = [...new Set(configuration.authorities.map(value => value === previousName ? nextName : value))];
      await connection.query('UPDATE scms_data_scopes SET configuration = ? WHERE id = ?', [JSON.stringify(configuration), scope.id]);
    }
  }
}

async function appendHistory(connection, itemId, action, previousValues, newValues, actorId) {
  await connection.query(
    `INSERT INTO scms_reference_item_history
      (reference_item_id, action, previous_values, new_values, changed_by)
     VALUES (?, ?, ?, ?, ?)`,
    [itemId, action, previousValues ? JSON.stringify(previousValues) : null, JSON.stringify(newValues), actorId]
  );
}

async function appendAudit(connection, req, { action, entityType, entityId, reason = null, details = null }) {
  await connection.query(
    `INSERT INTO scms_audit_events
      (actor_user_id, action, entity_type, entity_id, reason, ip_address, correlation_id, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.staff.id, action, entityType, String(entityId), reason, String(req.ip || '').slice(0, 64) || null,
      String(req.headers['x-correlation-id'] || crypto.randomUUID()).slice(0, 36), details ? JSON.stringify(details) : null]
  );
}

async function listRates(pool) {
  const [rows] = await pool.query(
    `SELECT r.id, r.category_item_id, category.code AS category_code,
            category.name AS category_name, category.is_active AS category_active,
            r.monthly_amount, r.effective_from, r.effective_to, r.notes,
            r.published_at, publisher.display_name AS published_by_name,
            CASE WHEN r.effective_from <= CURDATE()
                       AND (r.effective_to IS NULL OR r.effective_to >= CURDATE())
                 THEN TRUE ELSE FALSE END AS is_current
     FROM scms_category_rate_schedules r
     INNER JOIN scms_reference_items category ON category.id = r.category_item_id
     LEFT JOIN scms_users publisher ON publisher.id = r.published_by
     ORDER BY category.sort_order, category.name, r.effective_from DESC`
  );
  return rows.map(row => ({
    id: Number(row.id),
    categoryItemId: Number(row.category_item_id),
    categoryCode: row.category_code,
    categoryName: row.category_name,
    categoryActive: Boolean(row.category_active),
    monthlyAmount: Number(row.monthly_amount),
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    notes: row.notes || '',
    publishedAt: row.published_at,
    publishedByName: row.published_by_name || '',
    isCurrent: Boolean(row.is_current)
  }));
}

export function registerConfigurationRoutes(app, pool) {
  app.get('/api/config/parent-field-policies', async (_req, res, next) => {
    try {
      const [rows] = await pool.query(
        `SELECT field_code, label, update_mode, reference_type, is_required, is_active, sort_order, updated_at
         FROM scms_parent_field_policies ORDER BY sort_order, label`
      );
      res.json(rows.map(row => ({
        fieldCode: row.field_code,
        label: row.label,
        updateMode: row.update_mode,
        referenceType: row.reference_type,
        isRequired: Boolean(row.is_required),
        isActive: Boolean(row.is_active),
        sortOrder: Number(row.sort_order),
        updatedAt: row.updated_at
      })));
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/config/parent-field-policies/:fieldCode', async (req, res, next) => {
    const connection = await pool.getConnection();
    try {
      const fieldCode = requiredString(req.params.fieldCode, 'Field code', 50);
      const updateMode = requiredString(req.body?.updateMode, 'Update mode', 30);
      const reason = requiredString(req.body?.reason, 'Reason', 500);
      if (!['direct', 'approval', 'locked'].includes(updateMode)) {
        throw httpError(400, 'INVALID_UPDATE_MODE', 'Update mode must be direct, approval, or locked.');
      }
      await connection.beginTransaction();
      const [rows] = await connection.query('SELECT * FROM scms_parent_field_policies WHERE field_code = ? FOR UPDATE', [fieldCode]);
      if (!rows[0]) throw httpError(404, 'FIELD_POLICY_NOT_FOUND', 'Parent field policy was not found.');
      const previous = {
        updateMode: rows[0].update_mode,
        isRequired: Boolean(rows[0].is_required),
        isActive: Boolean(rows[0].is_active)
      };
      const nextValues = {
        updateMode,
        isRequired: Boolean(req.body?.isRequired),
        isActive: Boolean(req.body?.isActive)
      };
      await connection.query(
        `UPDATE scms_parent_field_policies
         SET update_mode = ?, is_required = ?, is_active = ?, updated_by = ?
         WHERE field_code = ?`,
        [nextValues.updateMode, nextValues.isRequired, nextValues.isActive, req.staff.id, fieldCode]
      );
      if (previous.isRequired !== nextValues.isRequired || previous.isActive !== nextValues.isActive) {
        const [parents] = await connection.query('SELECT P_No_O_No FROM Parent_Beneficiary');
        for (const parent of parents) await refreshParentCompleteness(connection, parent.P_No_O_No);
      }
      await appendAudit(connection, req, {
        action: 'configuration.parent_field_policy.updated',
        entityType: 'parent_field_policy', entityId: fieldCode, reason,
        details: { previous, next: nextValues }
      });
      await connection.commit();
      res.status(204).send();
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally {
      connection.release();
    }
  });

  app.get('/api/config/reference-data', async (_req, res, next) => {
    try {
      res.json(await loadReferenceData(pool));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/config/master-data', async (req, res, next) => {
    try {
      res.json(await loadReferenceData(pool, { includeInactive: req.query.includeInactive === 'true' }));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/config/master-data', async (req, res, next) => {
    const connection = await pool.getConnection();
    try {
      const itemType = requiredString(req.body?.type, 'Reference type', 40);
      if (!REFERENCE_TYPES[itemType]) throw httpError(400, 'INVALID_REFERENCE_TYPE', 'Unsupported reference-data type.');
      const name = requiredString(req.body?.name, 'Name', 160);
      const code = referenceCode(req.body?.code || name);
      const description = optionalString(req.body?.description, 500);
      const sortOrder = Number.isSafeInteger(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : 0;
      const metadata = req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {};
      await connection.beginTransaction();
      const [result] = await connection.query(
        `INSERT INTO scms_reference_items
          (item_type, code, name, description, sort_order, metadata, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [itemType, code, name, description, sortOrder, JSON.stringify(metadata), req.staff.id, req.staff.id]
      );
      const newValues = { type: itemType, code, name, description, sortOrder, metadata, isActive: true };
      await appendHistory(connection, result.insertId, 'created', null, newValues, req.staff.id);
      await appendAudit(connection, req, { action: 'configuration.master_data.created', entityType: 'reference_item', entityId: result.insertId, details: newValues });
      await connection.commit();
      res.status(201).json({ id: Number(result.insertId) });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally {
      connection.release();
    }
  });

  app.patch('/api/config/master-data/:itemId', async (req, res, next) => {
    const itemId = Number(req.params.itemId);
    const connection = await pool.getConnection();
    try {
      if (!Number.isSafeInteger(itemId) || itemId <= 0) throw httpError(400, 'INVALID_REFERENCE_ITEM', 'Invalid reference-data item.');
      await connection.beginTransaction();
      const [rows] = await connection.query('SELECT * FROM scms_reference_items WHERE id = ? FOR UPDATE', [itemId]);
      const current = rows[0];
      if (!current) throw httpError(404, 'REFERENCE_ITEM_NOT_FOUND', 'Reference-data item was not found.');
      const name = requiredString(req.body?.name, 'Name', 160);
      const description = optionalString(req.body?.description, 500);
      const sortOrder = Number.isSafeInteger(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : Number(current.sort_order);
      const isActive = Boolean(req.body?.isActive);
      const metadata = req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {};
      if (name !== current.name) await updateStringReferences(connection, current.item_type, current.name, name);
      await connection.query(
        `UPDATE scms_reference_items
         SET name = ?, description = ?, sort_order = ?, metadata = ?, is_active = ?, updated_by = ?
         WHERE id = ?`,
        [name, description, sortOrder, JSON.stringify(metadata), isActive, req.staff.id, itemId]
      );
      const previousValues = serializeItem(current);
      const newValues = { ...previousValues, name, description: description || '', sortOrder, metadata, isActive };
      const action = name !== current.name ? 'renamed' : current.is_active && !isActive ? 'archived' : !current.is_active && isActive ? 'reactivated' : 'updated';
      await appendHistory(connection, itemId, action, previousValues, newValues, req.staff.id);
      await appendAudit(connection, req, { action: `configuration.master_data.${action}`, entityType: 'reference_item', entityId: itemId, details: { previous: previousValues, next: newValues } });
      await connection.commit();
      res.status(204).send();
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally {
      connection.release();
    }
  });

  app.get('/api/config/master-data/:itemId/history', async (req, res, next) => {
    try {
      const itemId = Number(req.params.itemId);
      const [rows] = await pool.query(
        `SELECT h.id, h.action, h.previous_values, h.new_values, h.changed_at,
                actor.display_name AS changed_by_name
         FROM scms_reference_item_history h
         LEFT JOIN scms_users actor ON actor.id = h.changed_by
         WHERE h.reference_item_id = ? ORDER BY h.changed_at DESC`,
        [itemId]
      );
      res.json(rows.map(row => ({
        id: Number(row.id), action: row.action,
        previousValues: row.previous_values, newValues: row.new_values,
        changedAt: row.changed_at, changedByName: row.changed_by_name || ''
      })));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/config/rates', async (_req, res, next) => {
    try {
      res.json(await listRates(pool));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/config/rates', async (req, res, next) => {
    const connection = await pool.getConnection();
    try {
      const categoryItemId = Number(req.body?.categoryItemId);
      const monthlyAmount = Number(req.body?.monthlyAmount);
      const effectiveFrom = requiredString(req.body?.effectiveFrom, 'Effective date', 10);
      const notes = requiredString(req.body?.notes, 'Reason', 500);
      if (!Number.isSafeInteger(categoryItemId) || categoryItemId <= 0) throw httpError(400, 'INVALID_CATEGORY', 'Choose a category.');
      if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0) throw httpError(400, 'INVALID_RATE', 'Monthly amount must be greater than zero.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) throw httpError(400, 'INVALID_EFFECTIVE_DATE', 'Use a valid effective date.');

      await connection.beginTransaction();
      const [[todayRow]] = await connection.query('SELECT DATE_FORMAT(CURDATE(), \'%Y-%m-%d\') AS today');
      if (effectiveFrom < todayRow.today) throw httpError(400, 'PAST_RATE_DATE', 'A new rate cannot begin in the past. Historical schedules are immutable.');
      const [categories] = await connection.query(
        `SELECT id FROM scms_reference_items
         WHERE id = ? AND item_type = 'category' AND is_active = TRUE FOR UPDATE`,
        [categoryItemId]
      );
      if (!categories[0]) throw httpError(400, 'INVALID_CATEGORY', 'Choose an active category.');
      const [result] = await connection.query(
        `INSERT INTO scms_category_rate_schedules
          (category_item_id, monthly_amount, effective_from, notes, published_by)
         VALUES (?, ?, ?, ?, ?)`,
        [categoryItemId, monthlyAmount, effectiveFrom, notes, req.staff.id]
      );
      const [schedules] = await connection.query(
        `SELECT id, effective_from FROM scms_category_rate_schedules
         WHERE category_item_id = ? ORDER BY effective_from`,
        [categoryItemId]
      );
      for (let index = 0; index < schedules.length; index += 1) {
        const nextDate = schedules[index + 1]?.effective_from || null;
        await connection.query(
          `UPDATE scms_category_rate_schedules
           SET effective_to = CASE WHEN ? IS NULL THEN NULL ELSE DATE_SUB(?, INTERVAL 1 DAY) END
           WHERE id = ?`,
          [nextDate, nextDate, schedules[index].id]
        );
      }
      await appendAudit(connection, req, {
        action: 'configuration.rate.published',
        entityType: 'category_rate_schedule',
        entityId: result.insertId,
        reason: notes,
        details: { categoryItemId, monthlyAmount, effectiveFrom }
      });
      await connection.commit();
      res.status(201).json({ id: Number(result.insertId) });
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally {
      connection.release();
    }
  });
}
