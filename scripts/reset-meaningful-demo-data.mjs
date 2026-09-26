import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import mysql from 'mysql2/promise';
import 'dotenv/config';
import { runMigrations } from '../server/migrations.js';
import { pool as migrationPool } from '../server/database.js';

if (!process.argv.includes('--execute')) {
  console.error('Refusing to modify the database. Re-run with --execute after reviewing this script.');
  process.exit(2);
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');

await runMigrations();
const connection = await mysql.createConnection(process.env.DATABASE_URL);
const requireFromPortal = createRequire(new URL('../parent-portal/package.json', import.meta.url));
const bcrypt = requireFromPortal('bcrypt');
const demoPasswordHash = await bcrypt.hash('ParentDemo2026!', 12);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const backupDirectory = path.join(root, '.scms-data', 'backups');
await fs.mkdir(backupDirectory, { recursive: true });
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const backupPath = path.join(backupDirectory, `before-demo-reset-${stamp}.json`);

const [tableRows] = await connection.query(
  `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
);
const backup = { createdAt: new Date().toISOString(), database: connection.config.database, tables: {} };
for (const { TABLE_NAME } of tableRows) {
  const [rows] = await connection.query(`SELECT * FROM \`${TABLE_NAME}\``);
  backup.tables[TABLE_NAME] = rows;
}
await fs.writeFile(backupPath, JSON.stringify(backup, (_key, value) =>
  typeof value === 'bigint' ? value.toString() : Buffer.isBuffer(value) ? { type: 'Buffer', data: value.toString('base64') } : value,
2));

const clearTables = [
  'scms_messages', 'scms_message_threads', 'scms_document_reviews', 'scms_document_files',
  'scms_document_requirements', 'scms_document_type_versions', 'scms_document_types',
  'scms_form_submissions', 'scms_form_template_versions', 'scms_form_templates',
  'scms_import_conflicts', 'scms_import_logs', 'scms_import_rows', 'scms_import_jobs',
  'scms_import_mapping_templates', 'scms_import_heading_aliases', 'scms_identity_conflicts',
  'scms_parent_change_requests', 'scms_parent_credential_events', 'scms_child_category_decisions',
  'financial_approvals', 'child_gadgets', 'monthly_grants', 'dependent_children',
  'banking_details', 'document_tracking', 'parent_document_files', 'gadget_requests_summary',
  'approval_requests', 'portal_login_history', 'scms_parent_identifiers', 'parent_beneficiary',
  'authority_passwords', 'scms_reference_item_history', 'scms_category_rate_schedules',
  'scms_reference_items', 'scms_audit_events', 'scms_sessions',
];

try {
  await connection.beginTransaction();
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of clearTables) await connection.query(`DELETE FROM \`${table}\``);
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');

  const [[director]] = await connection.query(
    `SELECT u.id FROM scms_users u
     INNER JOIN scms_user_roles ur ON ur.user_id = u.id
     INNER JOIN scms_roles r ON r.id = ur.role_id
     WHERE r.name = 'Director' AND u.is_active = TRUE ORDER BY u.id LIMIT 1`,
  );
  if (!director) throw new Error('No active Director account exists; refusing to seed records.');

  const references = {
    authority: ['HQ COMNOR', 'HQ COMKAR', 'HQ COMLOG'],
    school: ['PN Special Education School Karachi', 'Bahria Special Education Centre', 'Rehabilitation Centre Islamabad', 'Home Education'],
    rank: ['Captain', 'Commander', 'Lieutenant Commander', 'Chief Petty Officer', 'Petty Officer', 'Civilian'],
    unit: ['PNS Jauhar', 'PNS Karsaz', 'PNS Bahadur', 'Naval Headquarters', 'Dockyard'],
    service_status: ['Serving', 'Retired', 'Expired'],
    category: ['A', 'B', 'C'],
  };
  const referenceIds = new Map();
  for (const [type, names] of Object.entries(references)) {
    for (let index = 0; index < names.length; index += 1) {
      const name = names[index];
      const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
      const [result] = await connection.query(
        `INSERT INTO scms_reference_items
          (item_type, code, name, description, sort_order, is_active, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, TRUE, ?, ?)`,
        [type, code, name, `Standard ${type.replace('_', ' ')} demo value`, (index + 1) * 10, director.id, director.id],
      );
      referenceIds.set(`${type}:${name}`, Number(result.insertId));
    }
  }
  for (const [category, amount] of [['A', 25000], ['B', 20000], ['C', 15000]]) {
    await connection.query(
      `INSERT INTO scms_category_rate_schedules
        (category_item_id, monthly_amount, effective_from, notes, published_by)
       VALUES (?, ?, '2026-01-01', 'Approved baseline demo schedule', ?)`,
      [referenceIds.get(`category:${category}`), amount, director.id],
    );
  }

  const parents = [
    ['PN-DEMO-1001', 'Ahmed Raza', 'Commander', 'Naval Headquarters', 'HQ COMNOR', 'Serving', '4210112345671', 'House 12, Naval Colony, Islamabad', 'ahmed.raza@example.test', '03001234001', 'approved'],
    ['PN-DEMO-1002', 'Bilal Khan', 'Chief Petty Officer', 'PNS Karsaz', 'HQ COMKAR', 'Serving', '4210112345672', 'Block 4, Karsaz, Karachi', 'bilal.khan@example.test', '03001234002', 'approved'],
    ['PN-DEMO-1003', 'Farah Iqbal', 'Civilian', 'Dockyard', 'HQ COMLOG', 'Serving', '4210112345673', 'Federal B Area, Karachi', 'farah.iqbal@example.test', '03001234003', 'approved'],
    ['PN-DEMO-1004', 'Hamza Siddiqui', 'Petty Officer', 'PNS Bahadur', 'HQ COMKAR', 'Serving', '4210112345674', 'Manora, Karachi', 'hamza.s@example.test', '03001234004', 'approved'],
    ['PN-DEMO-1005', 'Nadia Saleem', 'Lieutenant Commander', 'PNS Jauhar', 'HQ COMNOR', 'Serving', '4210112345675', 'E-8, Islamabad', 'nadia.saleem@example.test', '03001234005', 'approved'],
    ['PN-DEMO-1006', 'Omer Mahmood', 'Chief Petty Officer', 'PNS Karsaz', 'HQ COMKAR', 'Retired', '4210112345676', 'Gulshan-e-Iqbal, Karachi', 'omer.m@example.test', '03001234006', 'approved'],
    ['PN-DEMO-1007', 'Sana Tariq', 'Civilian', 'Dockyard', null, 'Serving', '4210112345677', 'North Nazimabad, Karachi', 'sana.tariq@example.test', '03001234007', 'approved'],
    ['PN-DEMO-1008', 'Usman Ali', 'Petty Officer', 'PNS Bahadur', 'HQ COMLOG', 'Serving', '4210112345678', 'Korangi, Karachi', 'usman.ali@example.test', '03001234008', 'pending'],
  ];
  for (const row of parents) {
    await connection.query(
      `INSERT INTO Parent_Beneficiary
        (P_No_O_No, Parent_Name, Rank_Rate, Unit, Admin_Authority, Service_Status,
         Parent_CNIC, Address, Email, Contact_No, Password_Hash, Status, Origin,
         Default_Password_Changed, Record_State, Missing_Fields, Is_Provisional, Approved_At)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo_seed', TRUE, 'complete', JSON_ARRAY(), FALSE,
               CASE WHEN ? = 'approved' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
      [...row.slice(0, 10), demoPasswordHash, row[10], row[10]],
    );
    for (const [type, value] of [['pn', row[0]], ['cnic', row[6]]]) {
      await connection.query(
        `INSERT INTO scms_parent_identifiers
          (parent_p_no_o_no, identifier_type, normalized_value, is_primary, is_verified, source, verified_at)
         VALUES (?, ?, ?, TRUE, TRUE, 'demo_seed', CURRENT_TIMESTAMP(3))`,
        [row[0], type, String(value).replace(/[^A-Za-z0-9]/g, '').toUpperCase()],
      );
    }
  }

  const children = [
    ['PN-DEMO-1001', 'Ayesha Raza', 10, '6110110000012', 'PN Special Education School Karachi', 'A', 'approved'],
    ['PN-DEMO-1001', 'Hassan Raza', 7, '6110110000023', 'Bahria Special Education Centre', 'B', 'approved'],
    ['PN-DEMO-1002', 'Zain Khan', 12, '6110110000034', 'PN Special Education School Karachi', 'B', 'approved'],
    ['PN-DEMO-1003', 'Mariam Iqbal', 9, '6110110000045', 'Rehabilitation Centre Islamabad', 'C', 'approved'],
    ['PN-DEMO-1004', 'Saad Siddiqui', 14, '6110110000056', 'Bahria Special Education Centre', 'A', 'approved'],
    ['PN-DEMO-1005', 'Hiba Saleem', 6, '6110110000067', 'Home Education', 'C', 'approved'],
    ['PN-DEMO-1005', 'Rayyan Saleem', 11, '6110110000078', 'Rehabilitation Centre Islamabad', 'B', 'pending'],
    ['PN-DEMO-1006', 'Noor Mahmood', 8, '6110110000089', 'PN Special Education School Karachi', 'A', 'approved'],
    ['PN-DEMO-1007', 'Dua Tariq', 13, '6110110000090', 'Bahria Special Education Centre', 'B', 'changes_required'],
    ['PN-DEMO-1008', 'Ali Usman', 5, '6110110000101', 'Home Education', 'C', 'draft'],
    ['PN-DEMO-1002', 'Mehak Khan', 15, '6110110000112', 'Rehabilitation Centre Islamabad', 'A', 'approved'],
    ['PN-DEMO-1003', 'Ibrahim Iqbal', 7, '6110110000123', 'Home Education', 'C', 'pending'],
  ];
  const childIds = new Map();
  for (const [pno, name, age, bform, school, category, status] of children) {
    const approved = status === 'approved' ? category : null;
    const [result] = await connection.query(
      `INSERT INTO Dependent_Children
        (P_No_O_No, Child_Name, Age, CNIC_BForm_No, School, Status,
         Parent_Selected_Category, Approved_Category, Disability_Category, Category,
         Record_State, Missing_Fields, Is_Provisional)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'complete', JSON_ARRAY(), FALSE)`,
      [pno, name, age, bform, school, status, category, approved, approved, approved],
    );
    childIds.set(bform, Number(result.insertId));
    if (approved) {
      await connection.query(
        `INSERT INTO scms_child_category_decisions
          (child_id, claimed_category, approved_category, reason, decided_by)
         VALUES (?, ?, ?, 'Demo approval based on completed review', ?)`,
        [result.insertId, category, category, director.id],
      );
    }
  }
  await connection.query(
    `UPDATE Parent_Beneficiary pb SET No_of_Disabled_Children =
       (SELECT COUNT(*) FROM Dependent_Children dc WHERE dc.P_No_O_No = pb.P_No_O_No)`,
  );

  for (const [index, pno] of ['PN-DEMO-1001', 'PN-DEMO-1002', 'PN-DEMO-1003', 'PN-DEMO-1004', 'PN-DEMO-1005', 'PN-DEMO-1006'].entries()) {
    await connection.query(
      `INSERT INTO Banking_Details
        (P_No_O_No, Bank_Name, Account_Title, Account_Number, Branch_Code, Branch_Address, IBAN, CNIC_of_Account_Holder, Bank_Name_Branch)
       SELECT P_No_O_No, 'Meezan Bank', Parent_Name, ?, '0101', 'Karachi Main Branch', ?, Parent_CNIC, 'Meezan Bank, Karachi Main Branch'
       FROM Parent_Beneficiary WHERE P_No_O_No = ?`,
      [`001000000${index + 1}`, `PK36MEZN000000001000000${index + 1}`, pno],
    );
  }

  const rateIds = {};
  const [rateRows] = await connection.query(
    `SELECT r.id, i.name category, r.monthly_amount FROM scms_category_rate_schedules r
     JOIN scms_reference_items i ON i.id = r.category_item_id`,
  );
  for (const rate of rateRows) rateIds[rate.category] = rate;
  for (const [bform, category, from, to] of [
    ['6110110000012', 'A', '2026-01-01', '2026-12-31'],
    ['6110110000034', 'B', '2026-04-01', '2027-03-31'],
    ['6110110000045', 'C', '2026-07-01', '2027-06-30'],
    ['6110110000056', 'A', '2026-01-01', '2026-12-31'],
  ]) {
    const rate = rateIds[category];
    await connection.query(
      `INSERT INTO Monthly_Grants
        (Child_ID, Category, Monthly_Amount_Rs, Monthly_Amount, Total_CFY_Amount,
         Approved_From, Approved_To, Rate_Schedule_ID, Rate_Effective_From, Created_By, Status)
       VALUES (?, ?, ?, ?, ? * 12, ?, ?, ?, '2026-01-01', ?, 'approved')`,
      [childIds.get(bform), category, rate.monthly_amount, rate.monthly_amount,
        rate.monthly_amount, from, to, rate.id, director.id],
    );
  }

  for (const [bform, detail, cost, type] of [
    ['6110110000012', 'Hearing assistance device', 85000, 'Off the Shelf'],
    ['6110110000034', 'Customized mobility chair', 175000, 'Customized'],
    ['6110110000045', 'Communication tablet', 95000, 'Reimbursed'],
    ['6110110000089', 'Walking frame', 28000, 'Off the Shelf'],
  ]) {
    await connection.query(
      `INSERT INTO Child_Gadgets (Child_ID, Detail_of_Gadgets, Base_Cost, Acquisition_Type, Status)
       VALUES (?, ?, ?, ?, 'Approved')`,
      [childIds.get(bform), detail, cost, type],
    );
  }
  for (const [index, pno] of parents.slice(0, 6).map(row => row[0]).entries()) {
    await connection.query(
      `INSERT INTO Document_Tracking (P_No_O_No, Letter_Reference, Contact_No, Almirah_No, File_No, Total_No_of_Children)
       SELECT P_No_O_No, ?, Contact_No, ?, ?, No_of_Disabled_Children FROM Parent_Beneficiary WHERE P_No_O_No = ?`,
      [`SCMS/DEMO/${String(index + 1).padStart(3, '0')}`, `A-${(index % 3) + 1}`, `D-${String(index + 1).padStart(3, '0')}`, pno],
    );
  }
  await connection.query(
    `INSERT INTO Approval_Requests (user_id, request_type, payload, status)
     VALUES ('PN-DEMO-1008', 'account_approval', JSON_OBJECT('source', 'demo_seed'), 'pending')`,
  );
  await connection.query(
    `INSERT INTO scms_audit_events
      (actor_user_id, action, entity_type, entity_id, outcome, reason, correlation_id, details)
     VALUES (?, 'database.demo_reset', 'system', 'operational-data', 'success',
       'Replace legacy test rows with coherent demonstration data', UUID(),
       JSON_OBJECT('parents', 8, 'children', 12, 'grants', 4, 'backupPath', ?))`,
    [director.id, backupPath],
  );
  await connection.commit();
  console.log(JSON.stringify({ backupPath, parents: 8, children: 12, grants: 4, gadgets: 4, parentDemoPassword: 'ParentDemo2026!' }, null, 2));
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  try { await connection.query('SET FOREIGN_KEY_CHECKS = 1'); } catch {}
  await connection.end();
  await migrationPool.end();
}
