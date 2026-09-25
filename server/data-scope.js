function parseConfiguration(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function dataModuleForPath(path) {
  const value = String(path || '').toLowerCase();
  if (value.includes('scanned-documents') || value.startsWith('/documents')) return 'documents';
  if (value.startsWith('/parents')) return 'parents';
  if (value.startsWith('/children')) return 'children';
  if (value.startsWith('/banking')) return 'banking';
  if (value.startsWith('/grants')) return 'grants';
  if (value.startsWith('/gadgets')) return 'gadgets';
  return null;
}

export async function loadDataScope(pool, staff, moduleCode) {
  if (staff?.roles?.includes('Director')) return { all: true, authorities: [], allowNoAuthority: true };

  const [rows] = await pool.query(
    `SELECT s.scope_type, s.configuration
     FROM scms_user_scopes us
     INNER JOIN scms_data_scopes s ON s.id = us.scope_id
     WHERE us.user_id = ? AND us.module_code = ? AND s.is_active = TRUE`,
    [staff?.id, moduleCode]
  );
  if (rows.some(row => row.scope_type === 'all')) return { all: true, authorities: [], allowNoAuthority: true };

  const authorities = new Set();
  let allowNoAuthority = false;
  for (const row of rows) {
    if (row.scope_type === 'no_authority') allowNoAuthority = true;
    if (row.scope_type === 'selected_authorities' || row.scope_type === 'assigned_authority') {
      const configuration = parseConfiguration(row.configuration);
      for (const authority of configuration.authorities || []) {
        const normalized = String(authority).trim();
        if (normalized) authorities.add(normalized);
      }
    }
  }
  return { all: false, authorities: [...authorities], allowNoAuthority };
}

export function scopePredicate(scope, column) {
  if (scope.all) return { sql: '1 = 1', params: [] };
  const clauses = [];
  const params = [];
  if (scope.authorities.length > 0) {
    clauses.push(`${column} IN (${scope.authorities.map(() => '?').join(', ')})`);
    params.push(...scope.authorities);
  }
  if (scope.allowNoAuthority) clauses.push(`(${column} IS NULL OR TRIM(${column}) = '')`);
  return clauses.length > 0 ? { sql: `(${clauses.join(' OR ')})`, params } : { sql: '1 = 0', params: [] };
}

export function scopeAllowsAuthority(scope, authority) {
  if (scope.all) return true;
  const value = typeof authority === 'string' ? authority.trim() : '';
  if (!value) return scope.allowNoAuthority;
  return scope.authorities.includes(value);
}

async function authorityForParent(pool, pNo) {
  const [rows] = await pool.query('SELECT Admin_Authority FROM Parent_Beneficiary WHERE P_No_O_No = ?', [pNo]);
  return rows.length ? rows[0].Admin_Authority : undefined;
}

async function authorityForChild(pool, childId) {
  const [rows] = await pool.query(
    `SELECT pb.Admin_Authority
     FROM Dependent_Children dc
     INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = dc.P_No_O_No
     WHERE dc.Child_ID = ?`,
    [childId]
  );
  return rows.length ? rows[0].Admin_Authority : undefined;
}

async function resolveRequestAuthority(pool, req, moduleCode) {
  const segments = String(req.path || '').split('/').filter(Boolean);
  const body = req.body || {};
  if (moduleCode === 'parents') {
    if (segments.length === 1) return req.method === 'POST' ? body.Admin_Authority ?? null : undefined;
    return authorityForParent(pool, req.params.pNo || segments[1]);
  }
  if (moduleCode === 'documents') {
    if (segments[0] === 'parents') return authorityForParent(pool, req.params.pNo || segments[1]);
    if (segments[0] === 'scanned-documents') {
      const [rows] = await pool.query(
        `SELECT pb.Admin_Authority FROM Parent_Document_Files f
         INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = f.P_No_O_No
         WHERE f.Document_File_ID = ?`,
        [req.params.documentFileId || segments[1]]
      );
      return rows.length ? rows[0].Admin_Authority : undefined;
    }
    if (segments.length === 1) return req.method === 'POST' ? authorityForParent(pool, body.P_No_O_No) : undefined;
    const [rows] = await pool.query(
      `SELECT pb.Admin_Authority FROM Document_Tracking d
       INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = d.P_No_O_No
       WHERE d.Doc_ID = ?`,
      [req.params.docId || segments[1]]
    );
    return rows.length ? rows[0].Admin_Authority : undefined;
  }
  if (moduleCode === 'banking') {
    if (segments[1] === 'parent') return authorityForParent(pool, req.params.pNoONo || segments[2]);
    if (segments.length === 1) return req.method === 'POST' ? authorityForParent(pool, body.P_No_O_No) : undefined;
    const [rows] = await pool.query(
      `SELECT pb.Admin_Authority FROM Banking_Details b
       INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = b.P_No_O_No
       WHERE b.Account_ID = ?`,
      [req.params.accountId || segments[1]]
    );
    return rows.length ? rows[0].Admin_Authority : undefined;
  }
  if (moduleCode === 'children') {
    if (segments[1] === 'by-parent') return authorityForParent(pool, req.params.pNo || segments[2]);
    if (segments.length === 1) return req.method === 'POST' ? authorityForParent(pool, body.P_No_O_No) : undefined;
    return authorityForChild(pool, req.params.childId || segments[1]);
  }
  if (moduleCode === 'grants' || moduleCode === 'gadgets') {
    if (segments.length === 1) return req.method === 'POST' ? authorityForChild(pool, body.Child_ID) : undefined;
    const table = moduleCode === 'grants' ? 'Monthly_Grants' : 'Child_Gadgets';
    const idColumn = moduleCode === 'grants' ? 'Grant_ID' : 'Gadget_ID';
    const id = moduleCode === 'grants' ? req.params.grantId : req.params.gadgetId;
    const [rows] = await pool.query(
      `SELECT pb.Admin_Authority FROM ${table} item
       INNER JOIN Dependent_Children dc ON dc.Child_ID = item.Child_ID
       INNER JOIN Parent_Beneficiary pb ON pb.P_No_O_No = dc.P_No_O_No
       WHERE item.${idColumn} = ?`,
      [id || segments[1]]
    );
    return rows.length ? rows[0].Admin_Authority : undefined;
  }
  return undefined;
}

async function requestedAuthorityForMutation(pool, req, moduleCode) {
  if (!['PUT', 'PATCH'].includes(req.method)) return undefined;
  const body = req.body || {};
  if (moduleCode === 'parents') return body.Admin_Authority ?? null;
  if (moduleCode === 'documents' || moduleCode === 'banking' || moduleCode === 'children') {
    return body.P_No_O_No ? authorityForParent(pool, body.P_No_O_No) : undefined;
  }
  if (moduleCode === 'grants' || moduleCode === 'gadgets') {
    return body.Child_ID ? authorityForChild(pool, body.Child_ID) : undefined;
  }
  return undefined;
}

function isCollectionRead(req) {
  const segments = String(req.path || '').split('/').filter(Boolean);
  if (req.method !== 'GET') return false;
  if (segments.length === 1) return true;
  return false;
}

export function createDataScopeMiddleware(pool) {
  return async (req, res, next) => {
    try {
      const moduleCode = dataModuleForPath(req.path);
      if (!moduleCode) {
        next();
        return;
      }
      const scope = await loadDataScope(pool, req.staff, moduleCode);
      req.dataScope = scope;
      if (isCollectionRead(req)) {
        next();
        return;
      }
      const authority = await resolveRequestAuthority(pool, req, moduleCode);
      if (authority === undefined || !scopeAllowsAuthority(scope, authority)) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'The requested record was not found in your assigned data scope.' } });
        return;
      }
      const requestedAuthority = await requestedAuthorityForMutation(pool, req, moduleCode);
      if (requestedAuthority !== undefined && !scopeAllowsAuthority(scope, requestedAuthority)) {
        res.status(403).json({ error: { code: 'OUTSIDE_DATA_SCOPE', message: 'The update would move this record outside your assigned data scope.' } });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
