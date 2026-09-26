import crypto from 'crypto';
import { loadDataScope, scopeAllowsAuthority, scopePredicate } from './data-scope.js';

const NO_AUTHORITY = '__NONE__';
const PROGRAM_CODE = 'MONTHLY_GRANT';
const CONFIRMATION_OUTCOMES = new Set(['paid', 'failed', 'returned']);

function paymentError(message, status = 400, publicCode = 'PAYMENT_INVALID_REQUEST') {
  const error = new Error(message);
  error.status = status;
  error.publicCode = publicCode;
  return error;
}

function parseJson(value, fallback = {}) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function cleanText(value, maximum = 1000) {
  const text = String(value || '').trim();
  if (text.length > maximum) throw paymentError(`Text must not exceed ${maximum} characters.`);
  return text;
}

function paymentPeriod(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) throw paymentError('Choose a payment month in YYYY-MM format.');
  const [year, month] = raw.split('-').map(Number);
  if (month < 1 || month > 12) throw paymentError('Choose a valid payment month.');
  const start = `${raw}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const fiscalYear = month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
  return { key: raw, start, end, fiscalYear };
}

function maskAccount(value) {
  const text = String(value || '');
  return text.length <= 4 ? text : `${'*'.repeat(Math.min(8, text.length - 4))}${text.slice(-4)}`;
}

function dateOnly(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value || '').slice(0, 10);
}

function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function authoritySql(authorityCode, column = 'pb.Admin_Authority') {
  if (authorityCode === NO_AUTHORITY) return { sql: `(${column} IS NULL OR TRIM(${column}) = '')`, params: [] };
  return { sql: `${column} = ?`, params: [authorityCode] };
}

function assertAuthority(scope, authorityCode) {
  const allowed = authorityCode === NO_AUTHORITY
    ? scope.all || scope.allowNoAuthority
    : scopeAllowsAuthority(scope, authorityCode);
  if (!allowed) throw paymentError('That authority is outside your grants data scope.', 403, 'PAYMENT_OUTSIDE_SCOPE');
}

async function audit(connection, staffId, action, entityType, entityId, reason = null, details = {}) {
  await connection.query(
    `INSERT INTO scms_audit_events
      (actor_user_id, action, entity_type, entity_id, outcome, reason, correlation_id, details)
     VALUES (?, ?, ?, ?, 'success', ?, UUID(), ?)`,
    [staffId, action, entityType, String(entityId), reason || null, JSON.stringify(details)],
  );
}

async function budgetSummary(connection, fiscalYear, authorityCode, { lock = false } = {}) {
  const [[budget]] = await connection.query(
    `SELECT * FROM scms_fiscal_budgets
     WHERE fiscal_year = ? AND program_code = ? AND authority_code = ? LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [fiscalYear, PROGRAM_CODE, authorityCode],
  );
  const [[usage]] = await connection.query(
    `SELECT COALESCE(SUM(total_amount), 0) AS committed
     FROM scms_payment_batches
     WHERE fiscal_year = ? AND authority_code = ?
       AND status IN ('approved','exported','partially_confirmed','confirmed')`,
    [fiscalYear, authorityCode],
  );
  const approved = Number(budget?.approved_amount || 0);
  const committed = Number(usage?.committed || 0);
  return {
    id: budget?.id ? Number(budget.id) : null,
    fiscalYear,
    authorityCode,
    approvedAmount: approved,
    status: budget?.status || 'not_configured',
    committedAmount: committed,
    availableAmount: approved - committed,
    rowVersion: Number(budget?.row_version || 0),
    reason: budget?.reason || null,
  };
}

async function buildPreview(connection, staff, monthValue, authorityCode, { lock = false } = {}) {
  const period = paymentPeriod(monthValue);
  const authority = cleanText(authorityCode, 160);
  if (!authority) throw paymentError('Choose one authority for this payment batch.');
  const scope = await loadDataScope(connection, staff, 'grants');
  assertAuthority(scope, authority);
  const filter = authoritySql(authority);
  const [rows] = await connection.query(
    `SELECT mg.*, dc.Child_Name, dc.CNIC_BForm_No, dc.Status AS Child_Status,
            pb.P_No_O_No, pb.Parent_Name, pb.Admin_Authority, pb.Status AS Parent_Status,
            b.Account_ID, b.Bank_Name, b.Account_Title, b.Account_Number, b.IBAN,
            b.Verification_Status AS Banking_Status, b.Row_Version AS Banking_Version,
            existing.id AS Existing_Payment_Line
     FROM Monthly_Grants mg
     INNER JOIN Dependent_Children dc ON dc.Child_ID = mg.Child_ID
     INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = dc.P_No_O_No
     LEFT JOIN Banking_Details b ON b.P_No_O_No = pb.P_No_O_No AND b.Is_Archived = FALSE
     LEFT JOIN scms_payment_lines existing
       ON existing.duplicate_guard = CONCAT('grant:', mg.Grant_ID, ':', ?)
     WHERE mg.Status = 'approved'
       AND mg.Approved_From <= ? AND mg.Approved_To >= ?
       AND ${filter.sql}
     ORDER BY pb.Parent_Name, dc.Child_Name${lock ? ' FOR UPDATE' : ''}`,
    [period.key, period.end, period.start, ...filter.params],
  );

  const eligible = [];
  const excluded = [];
  for (const row of rows) {
    let code = null;
    if (dateOnly(row.Approved_From) > period.start || dateOnly(row.Approved_To) < period.end) code = 'partial_grant_period';
    else if (row.Child_Status !== 'approved') code = 'child_not_approved';
    else if (row.Parent_Status !== 'approved') code = 'parent_not_approved';
    else if (!row.Account_ID) code = 'banking_missing';
    else if (row.Banking_Status !== 'verified') code = 'banking_not_verified';
    else if (row.Existing_Payment_Line) code = 'already_scheduled';
    else if (Number(row.Monthly_Amount || 0) <= 0) code = 'invalid_amount';
    if (code) {
      excluded.push({ grantId: Number(row.Grant_ID), childId: Number(row.Child_ID), childName: row.Child_Name, parentName: row.Parent_Name, code });
      continue;
    }
    eligible.push({
      grantId: Number(row.Grant_ID), childId: Number(row.Child_ID), childName: row.Child_Name,
      childIdentifier: row.CNIC_BForm_No, parentPNo: row.P_No_O_No, parentName: row.Parent_Name,
      category: row.Category, amount: Number(row.Monthly_Amount), rateScheduleId: row.Rate_Schedule_ID ? Number(row.Rate_Schedule_ID) : null,
      bankingAccountId: Number(row.Account_ID), bankingVersion: Number(row.Banking_Version), bankName: row.Bank_Name,
      accountTitle: row.Account_Title, accountNumber: row.Account_Number, iban: row.IBAN,
      approvedFrom: dateOnly(row.Approved_From), approvedTo: dateOnly(row.Approved_To),
    });
  }
  const exclusionSummary = Object.fromEntries([...new Set(excluded.map(item => item.code))].map(code => [code, excluded.filter(item => item.code === code).length]));
  const budget = await budgetSummary(connection, period.fiscalYear, authority);
  return {
    paymentMonth: period.key,
    periodStart: period.start,
    periodEnd: period.end,
    fiscalYear: period.fiscalYear,
    authorityCode: authority,
    eligible: eligible.map(item => ({ ...item, accountNumber: maskAccount(item.accountNumber), iban: maskAccount(item.iban) })),
    _eligibleRaw: eligible,
    excluded,
    exclusionSummary,
    totalAmount: eligible.reduce((sum, item) => sum + item.amount, 0),
    budget,
  };
}

async function scopedBatch(connection, staff, batchId, { lock = false } = {}) {
  const [[batch]] = await connection.query(
    `SELECT b.*, creator.display_name AS Created_By_Name, approver.display_name AS Approved_By_Name
     FROM scms_payment_batches b
     LEFT JOIN scms_users creator ON creator.id = b.created_by
     LEFT JOIN scms_users approver ON approver.id = b.approved_by
     WHERE b.id = ?${lock ? ' FOR UPDATE' : ''}`,
    [Number(batchId)],
  );
  if (!batch) throw paymentError('Payment batch not found.', 404, 'PAYMENT_BATCH_NOT_FOUND');
  const scope = await loadDataScope(connection, staff, 'grants');
  assertAuthority(scope, batch.authority_code);
  return batch;
}

async function batchDetail(connection, staff, batchId) {
  const batch = await scopedBatch(connection, staff, batchId);
  const [lines] = await connection.query(
    `SELECT l.id, l.grant_id, l.child_id, l.parent_p_no_o_no, l.payment_month,
            l.category, l.amount, l.status, l.latest_reference, l.latest_reason,
            l.confirmed_at, l.banking_snapshot, dc.Child_Name, dc.CNIC_BForm_No,
            pb.Parent_Name
     FROM scms_payment_lines l
     INNER JOIN Dependent_Children dc ON dc.Child_ID = l.child_id
     INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = l.parent_p_no_o_no
     WHERE l.batch_id = ? ORDER BY pb.Parent_Name, dc.Child_Name`,
    [batch.id],
  );
  const canExport = staff.permissions?.includes('payments.export');
  return {
    ...batch,
    exclusion_summary: parseJson(batch.exclusion_summary, {}),
    lines: lines.map(row => {
      const banking = parseJson(row.banking_snapshot, {});
      return {
        ...row,
        bank_name: banking.bankName,
        account_title: banking.accountTitle,
        account_number: canExport ? banking.accountNumber : maskAccount(banking.accountNumber),
        iban: canExport ? banking.iban : maskAccount(banking.iban),
        banking_snapshot: undefined,
      };
    }),
  };
}

export function registerPaymentOperationsRoutes(app, pool, transaction) {
  app.get('/api/payment-batches/authorities', async (req, res, next) => {
    try {
      const scope = await loadDataScope(pool, req.staff, 'grants');
      const filter = scopePredicate(scope, 'pb.Admin_Authority');
      const [rows] = await pool.query(
        `SELECT DISTINCT pb.Admin_Authority AS authority
         FROM Parent_Beneficiary pb WHERE ${filter.sql} ORDER BY pb.Admin_Authority`,
        filter.params,
      );
      const values = rows.map(row => row.authority || NO_AUTHORITY);
      if (scope.allowNoAuthority && !values.includes(NO_AUTHORITY)) values.push(NO_AUTHORITY);
      res.json(values);
    } catch (error) { next(error); }
  });

  app.get('/api/payment-batches/preview', async (req, res, next) => {
    try {
      const preview = await buildPreview(pool, req.staff, req.query.month, req.query.authority);
      delete preview._eligibleRaw;
      res.json(preview);
    } catch (error) { next(error); }
  });

  app.get('/api/payment-batches', async (req, res, next) => {
    try {
      const scope = await loadDataScope(pool, req.staff, 'grants');
      const clauses = [];
      const params = [];
      if (!scope.all) {
        if (scope.authorities.length) {
          clauses.push(`b.authority_code IN (${scope.authorities.map(() => '?').join(',')})`);
          params.push(...scope.authorities);
        }
        if (scope.allowNoAuthority) clauses.push(`b.authority_code = '${NO_AUTHORITY}'`);
      }
      const where = scope.all ? '1=1' : clauses.length ? `(${clauses.join(' OR ')})` : '1=0';
      const [rows] = await pool.query(
        `SELECT b.*, creator.display_name AS Created_By_Name, approver.display_name AS Approved_By_Name,
                budget.approved_amount AS Budget_Amount, budget.status AS Budget_Status
         FROM scms_payment_batches b
         LEFT JOIN scms_users creator ON creator.id = b.created_by
         LEFT JOIN scms_users approver ON approver.id = b.approved_by
         LEFT JOIN scms_fiscal_budgets budget ON budget.fiscal_year = b.fiscal_year
           AND budget.program_code = '${PROGRAM_CODE}' AND budget.authority_code = b.authority_code
         WHERE ${where} ORDER BY b.payment_month DESC, b.created_at DESC`,
        params,
      );
      res.json(rows.map(row => ({ ...row, exclusion_summary: parseJson(row.exclusion_summary, {}) })));
    } catch (error) { next(error); }
  });

  app.get('/api/payment-batches/:batchId', async (req, res, next) => {
    try { res.json(await batchDetail(pool, req.staff, req.params.batchId)); }
    catch (error) { next(error); }
  });

  app.post('/api/payment-batches', async (req, res, next) => {
    try {
      const reason = cleanText(req.body?.reason);
      if (reason.length < 5) throw paymentError('A preparation reason of at least 5 characters is required.');
      const id = await transaction(async connection => {
        const preview = await buildPreview(connection, req.staff, req.body?.month, req.body?.authority, { lock: true });
        if (preview._eligibleRaw.length === 0) throw paymentError('No eligible grants are available. Review the exclusion summary first.', 409, 'PAYMENT_NO_ELIGIBLE_GRANTS');
        const batchNumber = `PB-${preview.paymentMonth.replace('-', '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const [result] = await connection.query(
          `INSERT INTO scms_payment_batches
            (batch_number, payment_month, fiscal_year, authority_code, line_count, total_amount,
             exclusion_summary, preparation_reason, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [batchNumber, preview.periodStart, preview.fiscalYear, preview.authorityCode,
            preview._eligibleRaw.length, preview.totalAmount, JSON.stringify(preview.exclusionSummary), reason, req.staff.id],
        );
        for (const item of preview._eligibleRaw) {
          await connection.query(
            `INSERT INTO scms_payment_lines
              (batch_id, grant_id, child_id, parent_p_no_o_no, banking_account_id,
               payment_month, category, rate_schedule_id, amount, grant_snapshot,
               banking_snapshot, duplicate_guard)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [result.insertId, item.grantId, item.childId, item.parentPNo, item.bankingAccountId,
              preview.periodStart, item.category, item.rateScheduleId, item.amount,
              JSON.stringify({ approvedFrom: item.approvedFrom, approvedTo: item.approvedTo, category: item.category, rateScheduleId: item.rateScheduleId, amount: item.amount }),
              JSON.stringify({ version: item.bankingVersion, bankName: item.bankName, accountTitle: item.accountTitle, accountNumber: item.accountNumber, iban: item.iban }),
              `grant:${item.grantId}:${preview.paymentMonth}`],
          );
        }
        await audit(connection, req.staff.id, 'payment_batch.created', 'payment_batch', result.insertId, reason, { batchNumber, month: preview.paymentMonth, authority: preview.authorityCode, lineCount: preview._eligibleRaw.length, totalAmount: preview.totalAmount });
        return Number(result.insertId);
      });
      res.status(201).json(await batchDetail(pool, req.staff, id));
    } catch (error) { next(error); }
  });

  app.post('/api/payment-batches/:batchId/approve', async (req, res, next) => {
    try {
      const reason = cleanText(req.body?.reason);
      if (reason.length < 5) throw paymentError('An approval reason of at least 5 characters is required.');
      await transaction(async connection => {
        const batch = await scopedBatch(connection, req.staff, req.params.batchId, { lock: true });
        if (batch.status !== 'draft') throw paymentError('Only a draft batch can be approved.', 409, 'PAYMENT_BATCH_NOT_DRAFT');
        if (Number(batch.created_by) === Number(req.staff.id)) throw paymentError('The person who prepared this batch cannot approve it. A second authorized account is required.', 409, 'PAYMENT_SEPARATION_REQUIRED');
        // Serialize approvals for this authority/fiscal-year budget. Without
        // locking the budget row, two different batches could both observe the
        // same available amount and oversubscribe it concurrently.
        const budget = await budgetSummary(connection, batch.fiscal_year, batch.authority_code, { lock: true });
        if (budget.status !== 'confirmed') throw paymentError('A confirmed fiscal budget is required before payment approval.', 409, 'PAYMENT_BUDGET_NOT_CONFIRMED');
        if (Number(batch.total_amount) > budget.availableAmount) throw paymentError('This batch exceeds the remaining confirmed budget.', 409, 'PAYMENT_BUDGET_EXCEEDED');
        await connection.query(
          `UPDATE scms_payment_batches SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP(3),
           row_version = row_version + 1 WHERE id = ?`,
          [req.staff.id, batch.id],
        );
        await audit(connection, req.staff.id, 'payment_batch.approved', 'payment_batch', batch.id, reason, { totalAmount: Number(batch.total_amount), budgetAvailableBefore: budget.availableAmount });
      });
      res.status(204).send();
    } catch (error) { next(error); }
  });

  app.post('/api/payment-batches/:batchId/export.csv', async (req, res, next) => {
    try {
      const detail = await batchDetail(pool, req.staff, req.params.batchId);
      if (!['approved', 'exported', 'partially_confirmed', 'confirmed'].includes(detail.status)) throw paymentError('Approve the batch before exporting payment instructions.', 409, 'PAYMENT_BATCH_NOT_APPROVED');
      const header = ['Batch Number','Payment Month','Authority','Parent PN/O','Parent Name','Child','B-Form/CNIC','Grant ID','Category','Amount PKR','Bank','Account Title','Account Number','IBAN'];
      const lines = [header, ...detail.lines.map(line => [detail.batch_number, dateOnly(detail.payment_month).slice(0,7), detail.authority_code, line.parent_p_no_o_no, line.Parent_Name, line.Child_Name, line.CNIC_BForm_No, line.grant_id, line.category, Number(line.amount).toFixed(2), line.bank_name, line.account_title, line.account_number, line.iban])];
      const csv = `\uFEFF${lines.map(row => row.map(csvCell).join(',')).join('\r\n')}`;
      const checksum = crypto.createHash('sha256').update(csv).digest('hex');
      await transaction(async connection => {
        const batch = await scopedBatch(connection, req.staff, detail.id, { lock: true });
        if (batch.status === 'approved') {
          await connection.query(
            `UPDATE scms_payment_batches SET status = 'exported', exported_by = ?, exported_at = CURRENT_TIMESTAMP(3),
             export_sha256 = ?, row_version = row_version + 1 WHERE id = ?`,
            [req.staff.id, checksum, batch.id],
          );
          await audit(connection, req.staff.id, 'payment_batch.exported', 'payment_batch', batch.id, null, { checksum, format: 'csv' });
        }
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${detail.batch_number}.csv"`);
      res.send(csv);
    } catch (error) { next(error); }
  });

  app.post('/api/payment-lines/:lineId/confirm', async (req, res, next) => {
    try {
      const outcome = String(req.body?.outcome || '').toLowerCase();
      const reference = cleanText(req.body?.reference, 200);
      const reason = cleanText(req.body?.reason);
      if (!CONFIRMATION_OUTCOMES.has(outcome)) throw paymentError('Choose paid, failed, or returned.');
      if (outcome === 'paid' && reference.length < 3) throw paymentError('A bank reference is required for a paid line.');
      if (outcome !== 'paid' && reason.length < 5) throw paymentError('A reason is required for failed or returned payments.');
      await transaction(async connection => {
        const [[line]] = await connection.query('SELECT * FROM scms_payment_lines WHERE id = ? FOR UPDATE', [Number(req.params.lineId)]);
        if (!line) throw paymentError('Payment line not found.', 404, 'PAYMENT_LINE_NOT_FOUND');
        const batch = await scopedBatch(connection, req.staff, line.batch_id, { lock: true });
        if (!['exported', 'partially_confirmed'].includes(batch.status)) throw paymentError('Payment outcomes can be recorded only after export.', 409, 'PAYMENT_BATCH_NOT_EXPORTED');
        const [[latest]] = await connection.query('SELECT COALESCE(MAX(attempt_number), 0) AS attempt FROM scms_payment_confirmations WHERE payment_line_id = ?', [line.id]);
        await connection.query(
          `INSERT INTO scms_payment_confirmations
            (payment_line_id, attempt_number, outcome, bank_reference, reason, confirmed_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [line.id, Number(latest.attempt) + 1, outcome, reference || null, reason || null, req.staff.id],
        );
        await connection.query(
          `UPDATE scms_payment_lines SET status = ?, latest_reference = ?, latest_reason = ?,
           confirmed_at = CURRENT_TIMESTAMP(3), row_version = row_version + 1 WHERE id = ?`,
          [outcome, reference || null, reason || null, line.id],
        );
        const [[counts]] = await connection.query(
          `SELECT COUNT(*) AS total, SUM(status = 'paid') AS paid FROM scms_payment_lines WHERE batch_id = ?`,
          [batch.id],
        );
        const complete = Number(counts.total) > 0 && Number(counts.total) === Number(counts.paid);
        await connection.query(
          `UPDATE scms_payment_batches SET status = ?, confirmed_by = ?, confirmed_at = ?, row_version = row_version + 1 WHERE id = ?`,
          [complete ? 'confirmed' : 'partially_confirmed', complete ? req.staff.id : null, complete ? new Date() : null, batch.id],
        );
        await audit(connection, req.staff.id, 'payment_line.confirmed', 'payment_line', line.id, reason || null, { outcome, reference: reference || null, batchId: Number(batch.id) });
      });
      res.status(204).send();
    } catch (error) { next(error); }
  });

  app.post('/api/payment-batches/:batchId/cancel', async (req, res, next) => {
    try {
      const reason = cleanText(req.body?.reason);
      if (reason.length < 5) throw paymentError('A cancellation reason of at least 5 characters is required.');
      await transaction(async connection => {
        const batch = await scopedBatch(connection, req.staff, req.params.batchId, { lock: true });
        if (!['draft', 'approved'].includes(batch.status)) throw paymentError('An exported or confirmed batch cannot be cancelled online.', 409, 'PAYMENT_BATCH_PROTECTED');
        await connection.query(`UPDATE scms_payment_lines SET status = 'cancelled', duplicate_guard = NULL, row_version = row_version + 1 WHERE batch_id = ?`, [batch.id]);
        await connection.query(
          `UPDATE scms_payment_batches SET status = 'cancelled', cancelled_by = ?, cancelled_at = CURRENT_TIMESTAMP(3),
           cancellation_reason = ?, row_version = row_version + 1 WHERE id = ?`,
          [req.staff.id, reason, batch.id],
        );
        await audit(connection, req.staff.id, 'payment_batch.cancelled', 'payment_batch', batch.id, reason);
      });
      res.status(204).send();
    } catch (error) { next(error); }
  });

  app.get('/api/fiscal-budgets', async (req, res, next) => {
    try {
      const scope = await loadDataScope(pool, req.staff, 'grants');
      const clauses = [];
      const params = [];
      if (!scope.all) {
        if (scope.authorities.length) { clauses.push(`authority_code IN (${scope.authorities.map(() => '?').join(',')})`); params.push(...scope.authorities); }
        if (scope.allowNoAuthority) clauses.push(`authority_code = '${NO_AUTHORITY}'`);
      }
      const [rows] = await pool.query(
        `SELECT * FROM scms_fiscal_budgets WHERE program_code = ? AND ${scope.all ? '1=1' : clauses.length ? `(${clauses.join(' OR ')})` : '1=0'} ORDER BY fiscal_year DESC, authority_code`,
        [PROGRAM_CODE, ...params],
      );
      const enriched = [];
      for (const row of rows) enriched.push({ ...row, ...(await budgetSummary(pool, row.fiscal_year, row.authority_code)) });
      res.json(enriched);
    } catch (error) { next(error); }
  });

  app.post('/api/fiscal-budgets', async (req, res, next) => {
    try {
      const fiscalYear = cleanText(req.body?.fiscalYear, 9);
      const authorityCode = cleanText(req.body?.authority, 160);
      const amount = Number(req.body?.approvedAmount);
      const reason = cleanText(req.body?.reason);
      if (!/^\d{4}-\d{4}$/.test(fiscalYear)) throw paymentError('Fiscal year must use YYYY-YYYY.');
      if (!authorityCode) throw paymentError('Choose an authority.');
      if (!Number.isFinite(amount) || amount <= 0) throw paymentError('Budget amount must be greater than zero.');
      if (reason.length < 5) throw paymentError('A budget reason of at least 5 characters is required.');
      const scope = await loadDataScope(pool, req.staff, 'grants');
      assertAuthority(scope, authorityCode);
      const id = await transaction(async connection => {
        const [[existing]] = await connection.query(
          'SELECT * FROM scms_fiscal_budgets WHERE fiscal_year = ? AND program_code = ? AND authority_code = ? FOR UPDATE',
          [fiscalYear, PROGRAM_CODE, authorityCode],
        );
        if (existing?.status === 'confirmed') throw paymentError('A confirmed budget cannot be overwritten. Create an adjustment workflow instead.', 409, 'BUDGET_CONFIRMED');
        if (existing) {
          await connection.query(
            `UPDATE scms_fiscal_budgets SET approved_amount = ?, reason = ?, created_by = ?,
             row_version = row_version + 1 WHERE id = ?`,
            [amount, reason, req.staff.id, existing.id],
          );
          await audit(connection, req.staff.id, 'budget.updated', 'fiscal_budget', existing.id, reason, { amount, fiscalYear, authorityCode });
          return Number(existing.id);
        }
        const [result] = await connection.query(
          `INSERT INTO scms_fiscal_budgets
            (fiscal_year, program_code, authority_code, approved_amount, reason, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [fiscalYear, PROGRAM_CODE, authorityCode, amount, reason, req.staff.id],
        );
        await audit(connection, req.staff.id, 'budget.created', 'fiscal_budget', result.insertId, reason, { amount, fiscalYear, authorityCode });
        return Number(result.insertId);
      });
      res.status(201).json({ id });
    } catch (error) { next(error); }
  });

  app.post('/api/fiscal-budgets/:budgetId/confirm', async (req, res, next) => {
    try {
      const reason = cleanText(req.body?.reason);
      if (reason.length < 5) throw paymentError('A confirmation reason of at least 5 characters is required.');
      await transaction(async connection => {
        const [[budget]] = await connection.query('SELECT * FROM scms_fiscal_budgets WHERE id = ? FOR UPDATE', [Number(req.params.budgetId)]);
        if (!budget) throw paymentError('Budget not found.', 404, 'BUDGET_NOT_FOUND');
        const scope = await loadDataScope(connection, req.staff, 'grants');
        assertAuthority(scope, budget.authority_code);
        if (budget.status !== 'draft') throw paymentError('Only a draft budget can be confirmed.', 409, 'BUDGET_NOT_DRAFT');
        await connection.query(
          `UPDATE scms_fiscal_budgets SET status = 'confirmed', confirmed_by = ?, confirmed_at = CURRENT_TIMESTAMP(3),
           reason = CONCAT(reason, '\nConfirmation: ', ?), row_version = row_version + 1 WHERE id = ?`,
          [req.staff.id, reason, budget.id],
        );
        await audit(connection, req.staff.id, 'budget.confirmed', 'fiscal_budget', budget.id, reason, { amount: Number(budget.approved_amount), fiscalYear: budget.fiscal_year, authorityCode: budget.authority_code });
      });
      res.status(204).send();
    } catch (error) { next(error); }
  });
}

export const paymentInternals = { paymentPeriod, maskAccount, csvCell, dateOnly };
