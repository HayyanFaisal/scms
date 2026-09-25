export const PARENT_FIELD_COLUMNS = Object.freeze({
  parentName: 'Parent_Name',
  cnic: 'Parent_CNIC',
  rankRate: 'Rank_Rate',
  unit: 'Unit',
  adminAuthority: 'Admin_Authority',
  serviceStatus: 'Service_Status',
  email: 'Email',
  contactNo: 'Contact_No',
  address: 'Address'
});

export function normalizeIdentifier(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function calculateParentMissingFields(parent) {
  const required = [
    ['Parent_Name', 'parentName'], ['Rank_Rate', 'rankRate'], ['Unit', 'unit'],
    ['Service_Status', 'serviceStatus'], ['Parent_CNIC', 'cnic']
  ];
  return required.filter(([column]) => !String(parent?.[column] || '').trim()).map(([, code]) => code);
}

export function calculateChildMissingFields(child) {
  const required = [
    ['Child_Name', 'childName'], ['Age', 'age'], ['CNIC_BForm_No', 'cnicBformNo'],
    ['School', 'school'], ['Parent_Selected_Category', 'parentSelectedCategory']
  ];
  return required.filter(([column]) => !String(child?.[column] || '').trim()).map(([, code]) => code);
}

export async function refreshParentCompleteness(connection, pNoONo) {
  const [rows] = await connection.query('SELECT * FROM Parent_Beneficiary WHERE P_No_O_No = ?', [pNoONo]);
  if (!rows[0]) return null;
  const [policies] = await connection.query(
    `SELECT field_code FROM scms_parent_field_policies
     WHERE is_active = TRUE AND is_required = TRUE ORDER BY sort_order`
  );
  const missingFields = policies
    .map(policy => policy.field_code)
    .filter(fieldCode => !String(rows[0][PARENT_FIELD_COLUMNS[fieldCode]] || '').trim());
  const recordState = rows[0].Record_State === 'conflict_review'
    ? 'conflict_review'
    : missingFields.length ? 'incomplete' : 'complete';
  await connection.query(
    'UPDATE Parent_Beneficiary SET Record_State = ?, Missing_Fields = ? WHERE P_No_O_No = ?',
    [recordState, JSON.stringify(missingFields), pNoONo]
  );
  return { recordState, missingFields };
}

export async function refreshChildCompleteness(connection, childId) {
  const [rows] = await connection.query('SELECT * FROM Dependent_Children WHERE Child_ID = ?', [childId]);
  if (!rows[0]) return null;
  const missingFields = calculateChildMissingFields(rows[0]);
  const recordState = missingFields.length ? 'incomplete' : 'complete';
  await connection.query(
    'UPDATE Dependent_Children SET Record_State = ?, Missing_Fields = ? WHERE Child_ID = ?',
    [recordState, JSON.stringify(missingFields), childId]
  );
  return { recordState, missingFields };
}

export async function matchParentByIdentifiers(connection, { pNoONo, cnic }) {
  const identifiers = [
    ['pn', normalizeIdentifier(pNoONo)],
    ['cnic', normalizeIdentifier(cnic)]
  ].filter(([, value]) => value);
  if (identifiers.length === 0) return { status: 'insufficient_identifiers', matches: [] };

  const owners = [];
  for (const [type, value] of identifiers) {
    const [rows] = await connection.query(
      `SELECT parent_p_no_o_no FROM scms_parent_identifiers
       WHERE identifier_type = ? AND normalized_value = ?`,
      [type, value]
    );
    if (rows[0]) owners.push({ type, value, parentPNo: rows[0].parent_p_no_o_no });
  }
  const parentIds = [...new Set(owners.map(owner => owner.parentPNo))];
  if (parentIds.length > 1) return { status: 'conflict', matches: owners };
  if (parentIds.length === 1) return { status: 'matched', parentPNo: parentIds[0], matches: owners };
  return { status: 'not_found', matches: [] };
}

export async function syncParentIdentifiers(connection, pNoONo, cnic, { source = 'profile', verified = false } = {}) {
  const identifiers = [['pn', pNoONo, true], ['cnic', cnic, true]];
  for (const [type, rawValue, primary] of identifiers) {
    const value = normalizeIdentifier(rawValue);
    if (!value) continue;
    const [owners] = await connection.query(
      `SELECT parent_p_no_o_no FROM scms_parent_identifiers
       WHERE identifier_type = ? AND normalized_value = ?`,
      [type, value]
    );
    if (owners[0] && owners[0].parent_p_no_o_no !== pNoONo) {
      const error = new Error(`The ${type === 'cnic' ? 'CNIC' : 'PN/O number'} is already linked to another parent record.`);
      error.status = 409;
      error.publicCode = 'IDENTIFIER_CONFLICT';
      throw error;
    }
    await connection.query(
      `INSERT INTO scms_parent_identifiers
        (parent_p_no_o_no, identifier_type, normalized_value, is_primary, is_verified, source, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE is_primary = VALUES(is_primary), is_verified = GREATEST(is_verified, VALUES(is_verified)),
         source = VALUES(source), verified_at = COALESCE(verified_at, VALUES(verified_at))`,
      [pNoONo, type, value, primary, verified, source, verified ? new Date() : null]
    );
  }
}

export async function loadParentFieldPolicies(connection) {
  const [rows] = await connection.query(
    `SELECT field_code, label, update_mode, reference_type, is_required, is_active, sort_order
     FROM scms_parent_field_policies WHERE is_active = TRUE ORDER BY sort_order, label`
  );
  return rows.map(row => ({
    fieldCode: row.field_code,
    label: row.label,
    updateMode: row.update_mode,
    referenceType: row.reference_type,
    isRequired: Boolean(row.is_required),
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order)
  }));
}
