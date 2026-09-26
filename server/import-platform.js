import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import multer from "multer";
import readExcelFile from "read-excel-file/node";
import ExcelJS from "exceljs";
import { fileURLToPath } from "url";
import { loadDataScope, scopeAllowsAuthority } from "./data-scope.js";
import {
  matchParentByIdentifiers,
  normalizeIdentifier,
  refreshChildCompleteness,
  refreshParentCompleteness,
  syncParentIdentifiers,
} from "./profile-lifecycle.js";

const importStorageRoot = path.resolve(
  process.env.SCMS_IMPORT_STORAGE_DIR ||
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      ".scms-data",
      "imports",
    ),
);
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const MAX_ROWS = 100_000;
const MAX_COLUMNS = 250;
const MAX_CELL_LENGTH = 10_000;
const PROFILES = new Set(["parent", "child", "mixed"]);
const activeJobs = new Set();
let recoverWorkers = async () => undefined;

export async function recoverImportWorkers() {
  return recoverWorkers();
}

export const IMPORT_FIELDS = Object.freeze([
  {
    code: "parent.pNoONo",
    label: "Parent PN/O number",
    group: "Parent",
    aliases: ["pn", "pno", "pnumber", "personnelnumber", "servicenumber"],
  },
  {
    code: "parent.cnic",
    label: "Parent CNIC",
    group: "Parent",
    aliases: ["cnic", "parentcnic", "nationalidentitynumber"],
  },
  {
    code: "parent.name",
    label: "Parent name",
    group: "Parent",
    aliases: ["parentname", "guardianname", "beneficiaryname", "name"],
  },
  {
    code: "parent.rankRate",
    label: "Rank / rate",
    group: "Parent",
    aliases: ["rank", "rate", "rankrate"],
  },
  {
    code: "parent.unit",
    label: "Unit",
    group: "Parent",
    aliases: ["unit", "ship", "formation"],
  },
  {
    code: "parent.authority",
    label: "Administrative authority",
    group: "Parent",
    aliases: ["authority", "adminauthority", "command"],
  },
  {
    code: "parent.serviceStatus",
    label: "Service status",
    group: "Parent",
    aliases: ["servicestatus", "status"],
  },
  {
    code: "parent.address",
    label: "Address",
    group: "Parent",
    aliases: ["address", "residentialaddress", "homeaddress"],
  },
  {
    code: "parent.email",
    label: "Email",
    group: "Parent",
    aliases: ["email", "emailaddress"],
  },
  {
    code: "parent.contactNo",
    label: "Contact number",
    group: "Parent",
    aliases: ["contact", "contactno", "phone", "mobile"],
  },
  {
    code: "child.name",
    label: "Child name",
    group: "Child",
    aliases: ["childname", "studentname", "dependentname"],
  },
  {
    code: "child.age",
    label: "Child age",
    group: "Child",
    aliases: ["childage", "age"],
  },
  {
    code: "child.cnicBformNo",
    label: "Child CNIC / B-Form",
    group: "Child",
    aliases: ["bform", "bformno", "childcnic", "studentcnic"],
  },
  {
    code: "child.school",
    label: "School",
    group: "Child",
    aliases: ["school", "schoolname", "institute"],
  },
  {
    code: "child.category",
    label: "Parent-selected category",
    group: "Child",
    aliases: ["category", "disabilitycategory", "supportcategory"],
  },
]);

function publicError(message, status = 400, code = "IMPORT_ERROR") {
  const error = new Error(message);
  error.status = status;
  error.publicCode = code;
  return error;
}

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function canonicalValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  if (value && typeof value === "object") {
    if (Array.isArray(value)) return value.map(canonicalValue);
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

export function importValuesEqual(left, right) {
  return (
    JSON.stringify(canonicalValue(left)) ===
    JSON.stringify(canonicalValue(right))
  );
}

function csvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function safeCell(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value) return safeCell(value.result);
    if ("text" in value) return String(value.text).slice(0, MAX_CELL_LENGTH);
    if (Array.isArray(value.richText))
      return value.richText
        .map((part) => part.text || "")
        .join("")
        .slice(0, MAX_CELL_LENGTH);
    if ("hyperlink" in value)
      return String(value.text || value.hyperlink).slice(0, MAX_CELL_LENGTH);
    return JSON.stringify(value).slice(0, MAX_CELL_LENGTH);
  }
  return String(value).trim().slice(0, MAX_CELL_LENGTH);
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const input = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
      continue;
    }
    if (character === '"' && cell.length === 0) quoted = true;
    else if (character === ",") {
      row.push(safeCell(cell));
      cell = "";
    } else if (character === "\n") {
      row.push(safeCell(cell));
      if (row.some((value) => value !== ""))
        rows.push(row.slice(0, MAX_COLUMNS));
      if (rows.length > MAX_ROWS + 100)
        throw publicError(
          `Import exceeds the ${MAX_ROWS.toLocaleString()} row limit.`,
          413,
          "IMPORT_ROW_LIMIT",
        );
      row = [];
      cell = "";
    } else if (character !== "\r") cell += character;
  }
  row.push(safeCell(cell));
  if (row.some((value) => value !== "")) rows.push(row.slice(0, MAX_COLUMNS));
  return rows;
}

async function readWorkbook(buffer, format) {
  if (format === "csv") {
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      throw publicError(
        "The CSV must use UTF-8 encoding.",
        400,
        "INVALID_CSV_ENCODING",
      );
    }
    return [{ name: "CSV Data", rows: parseCsv(text) }];
  }
  let workbook;
  try {
    workbook = await readExcelFile(buffer);
  } catch (error) {
    if (error?.publicCode) throw error;
    throw publicError(
      "The .xlsx workbook is damaged, encrypted, or not a supported modern Excel file.",
      400,
      "INVALID_XLSX_WORKBOOK",
    );
  }
  if (workbook.length > 50)
    throw publicError(
      "The workbook contains too many sheets.",
      413,
      "IMPORT_SHEET_LIMIT",
    );
  return workbook.map((sheet) => {
    if (sheet.data.length > MAX_ROWS + 100)
      throw publicError(
        `Sheet ${sheet.sheet} exceeds the ${MAX_ROWS.toLocaleString()} row limit.`,
        413,
        "IMPORT_ROW_LIMIT",
      );
    return {
      name: String(sheet.sheet).slice(0, 160),
      rows: sheet.data.map((row) => row.slice(0, MAX_COLUMNS).map(safeCell)),
    };
  });
}

function uniqueHeaders(values) {
  const used = new Map();
  return values.slice(0, MAX_COLUMNS).map((value, index) => {
    const base = String(value || "").trim() || `Column ${index + 1}`;
    const count = (used.get(base.toLowerCase()) || 0) + 1;
    used.set(base.toLowerCase(), count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

export function suggestMapping(
  headers,
  profile = "mixed",
  configuredAliases = {},
) {
  const allowedGroups =
    profile === "parent"
      ? new Set(["Parent"])
      : profile === "child"
        ? new Set(["Parent", "Child"])
        : new Set(["Parent", "Child"]);
  const mapping = {};
  for (const field of IMPORT_FIELDS.filter((item) =>
    allowedGroups.has(item.group),
  )) {
    const aliases = new Set(
      [...field.aliases, ...(configuredAliases[field.code] || [])].map(
        normalizeHeader,
      ),
    );
    const match = headers.find((header) =>
      aliases.has(normalizeHeader(header)),
    );
    if (match) mapping[field.code] = match;
  }
  return mapping;
}

function applyTransform(value, transforms = []) {
  let result = value === null || value === undefined ? "" : String(value);
  for (const transform of transforms) {
    if (transform === "trim") result = result.trim();
    if (transform === "uppercase") result = result.toUpperCase();
    if (transform === "lowercase") result = result.toLowerCase();
    if (transform === "digits_only") result = result.replace(/\D/g, "");
    if (transform === "normalize_identifier")
      result = normalizeIdentifier(result);
  }
  return result.trim() === "" ? null : result;
}

export function mapImportRow(rawData, mapping, transforms = {}) {
  const mapped = {};
  for (const field of IMPORT_FIELDS) {
    const sourceHeader = mapping?.[field.code];
    if (!sourceHeader) continue;
    const defaults =
      field.code === "parent.pNoONo" ||
      field.code === "parent.cnic" ||
      field.code === "child.cnicBformNo"
        ? ["trim", "normalize_identifier"]
        : ["trim"];
    mapped[field.code] = applyTransform(
      rawData[sourceHeader],
      Array.isArray(transforms[field.code]) ? transforms[field.code] : defaults,
    );
  }
  return mapped;
}

export function validateMappedRow(mapped, profile) {
  const errors = [];
  const warnings = [];
  const pn = mapped["parent.pNoONo"];
  const cnic = mapped["parent.cnic"];
  const hasChildData = [
    "child.name",
    "child.age",
    "child.cnicBformNo",
    "child.school",
    "child.category",
  ].some(
    (code) =>
      mapped[code] !== null &&
      mapped[code] !== undefined &&
      mapped[code] !== "",
  );
  if (!pn && !cnic)
    errors.push({
      code: "PARENT_IDENTIFIER_REQUIRED",
      field: "parent.pNoONo",
      message: "Parent PN/O number or CNIC is required.",
    });
  if (cnic && !/^\d{13}$/.test(String(cnic)))
    errors.push({
      code: "INVALID_PARENT_CNIC",
      field: "parent.cnic",
      message: "Parent CNIC must contain exactly 13 digits.",
    });
  const childIdentifier = mapped["child.cnicBformNo"];
  if (childIdentifier && !/^\d{13}$/.test(String(childIdentifier)))
    errors.push({
      code: "INVALID_CHILD_IDENTIFIER",
      field: "child.cnicBformNo",
      message: "Child CNIC/B-Form must contain exactly 13 digits.",
    });
  if (
    (profile === "child" || (profile === "mixed" && hasChildData)) &&
    !mapped["child.name"]
  )
    errors.push({
      code: "CHILD_NAME_REQUIRED",
      field: "child.name",
      message: "Child name is required for a child row.",
    });
  if (
    mapped["child.age"] !== null &&
    mapped["child.age"] !== undefined &&
    mapped["child.age"] !== ""
  ) {
    const age = Number(mapped["child.age"]);
    if (!Number.isFinite(age) || age <= 0 || age > 30)
      errors.push({
        code: "INVALID_CHILD_AGE",
        field: "child.age",
        message:
          "Child age must be a number greater than 0 and no more than 30.",
      });
  }
  if (
    mapped["parent.email"] &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(mapped["parent.email"]))
  )
    warnings.push({
      code: "EMAIL_FORMAT_WARNING",
      field: "parent.email",
      message: "Email format should be reviewed.",
    });
  if (!mapped["parent.name"])
    warnings.push({
      code: "PARENT_INCOMPLETE",
      field: "parent.name",
      message:
        "Parent name is missing; a provisional incomplete record may be created.",
    });
  if (hasChildData && !childIdentifier)
    warnings.push({
      code: "CHILD_IDENTIFIER_MISSING",
      field: "child.cnicBformNo",
      message:
        "Child CNIC/B-Form is missing; the child cannot be automatically deduplicated.",
    });
  return { errors, warnings, hasChildData };
}

function formatJob(row) {
  return {
    ...row,
    id: Number(row.id),
    source_metadata: parseJson(row.source_metadata, {}),
    mapping_json: parseJson(row.mapping_json, {}),
    transforms_json: parseJson(row.transforms_json, {}),
    rollback_summary: parseJson(row.rollback_summary, null),
  };
}

async function getJob(connection, jobId) {
  const [[row]] = await connection.query(
    "SELECT * FROM scms_import_jobs WHERE id = ?",
    [Number(jobId)],
  );
  if (!row)
    throw publicError("Import job not found.", 404, "IMPORT_JOB_NOT_FOUND");
  return formatJob(row);
}

function assertJobAccess(job, staff) {
  if (
    staff?.permissions?.includes("imports.rollback") ||
    Number(job.created_by) === Number(staff?.id)
  )
    return;
  throw publicError("Import job not found.", 404, "IMPORT_JOB_NOT_FOUND");
}

async function logEvent(
  connection,
  jobId,
  eventCode,
  message,
  details = null,
  level = "info",
) {
  await connection.query(
    `INSERT INTO scms_import_logs (import_job_id, level, event_code, message, details) VALUES (?, ?, ?, ?, ?)`,
    [
      Number(jobId),
      level,
      eventCode,
      String(message).slice(0, 1000),
      details ? JSON.stringify(details) : null,
    ],
  );
}

async function appendImportAudit(
  connection,
  req,
  action,
  entityType,
  entityId,
  details = null,
  reason = null,
) {
  await connection.query(
    `INSERT INTO scms_audit_events
      (actor_user_id, action, entity_type, entity_id, reason, ip_address, correlation_id, details)
     VALUES (?, ?, ?, ?, ?, ?, UUID(), ?)`,
    [
      req.staff.id,
      action,
      entityType,
      String(entityId),
      reason,
      String(req.ip || "").slice(0, 64) || null,
      details ? JSON.stringify(details) : null,
    ],
  );
}

async function configuredHeadingAliases(
  connection,
  { includeInactive = false } = {},
) {
  const [rows] = await connection.query(
    `SELECT * FROM scms_import_heading_aliases
     ${includeInactive ? "" : "WHERE is_active = TRUE"}
     ORDER BY field_code, alias`,
  );
  return rows;
}

function aliasMap(rows) {
  const result = {};
  for (const row of rows) {
    if (!result[row.field_code]) result[row.field_code] = [];
    result[row.field_code].push(row.alias);
  }
  return result;
}

async function loadImportSettings(connection) {
  const [[row]] = await connection.query(
    "SELECT * FROM scms_import_settings WHERE id = 1",
  );
  return {
    sourceRetentionDays: Number(row?.source_retention_days || 90),
    cleanupEnabled: row ? Boolean(row.cleanup_enabled) : true,
    updatedAt: row?.updated_at || null,
  };
}

function storedPath(job) {
  return path.join(
    importStorageRoot,
    job.storage_key.slice(0, 2),
    `${job.storage_key}.${job.file_format}`,
  );
}

async function cleanupExpiredImportSources(
  pool,
  { actorId = null, reason = "retention_policy" } = {},
) {
  const settings = await loadImportSettings(pool);
  if (!settings.cleanupEnabled) return { cleaned: 0, missing: 0, settings };
  const [jobs] = await pool.query(
    `SELECT id, storage_key, file_format
     FROM scms_import_jobs
     WHERE source_deleted_at IS NULL
       AND status IN ('completed', 'completed_with_issues', 'rolled_back', 'rollback_completed_with_issues')
       AND COALESCE(rolled_back_at, completed_at, updated_at) < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL ? DAY)
     ORDER BY id LIMIT 500`,
    [settings.sourceRetentionDays],
  );
  let cleaned = 0;
  let missing = 0;
  for (const job of jobs) {
    let outcome = reason;
    try {
      await fs.unlink(storedPath(job));
      cleaned += 1;
    } catch (error) {
      if (error?.code !== "ENOENT") {
        await logEvent(
          pool,
          job.id,
          "retention.source_cleanup_failed",
          "The protected import source could not be removed.",
          { code: error?.code || "SOURCE_DELETE_FAILED" },
          "error",
        );
        continue;
      }
      outcome = "source_already_missing";
      missing += 1;
    }
    await pool.query(
      `UPDATE scms_import_jobs SET source_deleted_at = CURRENT_TIMESTAMP(3), source_delete_reason = ? WHERE id = ? AND source_deleted_at IS NULL`,
      [outcome, job.id],
    );
    await logEvent(
      pool,
      job.id,
      "retention.source_removed",
      "The protected source file was removed after its retention period; staged results and audit history remain available.",
      { actorId, reason: outcome },
    );
  }
  return { cleaned, missing, settings };
}

function resultIssueText(value) {
  return parseJson(value, [])
    .map((issue) => `${issue.code}: ${issue.message}`)
    .join("; ");
}

function resultRollbackText(value) {
  return value ? JSON.stringify(parseJson(value, {})) : "";
}

async function loadResultRows(connection, jobId) {
  const [rows] = await connection.query(
    `SELECT source_row_number, sheet_name, status, proposed_action, target_parent_p_no_o_no,
            target_child_id, issues, rollback_status, rollback_details, executed_at, rolled_back_at
     FROM scms_import_rows WHERE import_job_id = ? ORDER BY source_row_number`,
    [jobId],
  );
  return rows;
}

async function loadJobWorkbook(job) {
  const buffer = await fs.readFile(storedPath(job)).catch(() => {
    throw publicError(
      "The protected source file is unavailable.",
      404,
      "IMPORT_SOURCE_MISSING",
    );
  });
  return readWorkbook(buffer, job.file_format);
}

function detectFormat(file) {
  const extension = path.extname(file.originalname || "").toLowerCase();
  if (extension === ".xls")
    throw publicError(
      "Legacy .xls files are not accepted yet. Save the workbook as .xlsx or .csv and upload it again.",
      415,
      "LEGACY_XLS_NOT_SUPPORTED",
    );
  if (extension === ".csv") {
    if (file.buffer.includes(0))
      throw publicError(
        "The CSV appears to contain binary data.",
        415,
        "INVALID_CSV",
      );
    return "csv";
  }
  if (
    extension === ".xlsx" &&
    file.buffer[0] === 0x50 &&
    file.buffer[1] === 0x4b
  )
    return "xlsx";
  throw publicError(
    "Only .xlsx and .csv files are accepted in this phase.",
    415,
    "IMPORT_FILE_TYPE_NOT_ALLOWED",
  );
}

function sheetMetadata(sheets) {
  return {
    sheets: sheets.map((sheet) => ({
      name: sheet.name,
      rowCount: sheet.rows.length,
      columnCount: Math.max(
        0,
        ...sheet.rows.slice(0, 50).map((row) => row.length),
      ),
      preview: sheet.rows.slice(0, 20),
    })),
  };
}

async function referenceSets(connection) {
  const [rows] = await connection.query(
    `SELECT item_type, name FROM scms_reference_items WHERE is_active = TRUE`,
  );
  const result = new Map();
  for (const row of rows) {
    if (!result.has(row.item_type)) result.set(row.item_type, new Set());
    result.get(row.item_type).add(String(row.name).trim().toLowerCase());
  }
  return result;
}

function addReferenceIssues(mapped, references, errors) {
  const checks = [
    ["parent.rankRate", "rank"],
    ["parent.unit", "unit"],
    ["parent.authority", "authority"],
    ["parent.serviceStatus", "service_status"],
    ["child.school", "school"],
    ["child.category", "category"],
  ];
  for (const [field, type] of checks) {
    const value = mapped[field];
    if (
      value &&
      !references.get(type)?.has(String(value).trim().toLowerCase())
    ) {
      errors.push({
        code: "UNKNOWN_REFERENCE_VALUE",
        field,
        message: `${value} is not an active configured ${type.replace("_", " ")}.`,
      });
    }
  }
}

function parentValues(mapped) {
  return {
    Parent_Name: mapped["parent.name"] || null,
    Rank_Rate: mapped["parent.rankRate"] || null,
    Unit: mapped["parent.unit"] || null,
    Admin_Authority: mapped["parent.authority"] || null,
    Service_Status: mapped["parent.serviceStatus"] || null,
    Parent_CNIC: mapped["parent.cnic"] || null,
    Address: mapped["parent.address"] || null,
    Email: mapped["parent.email"] || null,
    Contact_No: mapped["parent.contactNo"] || null,
  };
}

const IMPORT_PARENT_COLUMNS = `
  P_No_O_No, Parent_Name, Rank_Rate, Unit, Admin_Authority, Service_Status,
  Parent_CNIC, Address, Email, Contact_No, Status, Origin, Record_State,
  Missing_Fields, Is_Provisional, Created_At, Approved_At
`;

const IMPORT_CHILD_COLUMNS = `
  Child_ID, P_No_O_No, Child_Name, Age, CNIC_BForm_No, School,
  Parent_Selected_Category, Status, Record_State, Missing_Fields, Is_Provisional
`;

async function classifyDatabaseConflicts(
  connection,
  mapped,
  match,
  rowId,
  jobId,
) {
  const conflicts = [];
  if (match.status === "conflict") {
    conflicts.push({
      type: "identity_collision",
      field: null,
      existing: match.matches,
      incoming: { pn: mapped["parent.pNoONo"], cnic: mapped["parent.cnic"] },
    });
  } else if (match.status === "matched") {
    const [[existing]] = await connection.query(
      `SELECT ${IMPORT_PARENT_COLUMNS} FROM Parent_Beneficiary WHERE P_No_O_No = ?`,
      [match.parentPNo],
    );
    if (existing) {
      if (
        mapped["parent.pNoONo"] &&
        normalizeIdentifier(mapped["parent.pNoONo"]) !==
          normalizeIdentifier(match.parentPNo)
      ) {
        conflicts.push({
          type: "identifier_mismatch",
          field: "parent.pNoONo",
          existing: match.parentPNo,
          incoming: mapped["parent.pNoONo"],
        });
      }
      for (const [column, incoming] of Object.entries(parentValues(mapped))) {
        if (incoming === null || incoming === "") continue;
        const current = existing[column];
        if (
          current !== null &&
          String(current).trim() !== "" &&
          String(current).trim().toLowerCase() !==
            String(incoming).trim().toLowerCase()
        ) {
          const field =
            IMPORT_FIELDS.find(
              (item) =>
                ({
                  Parent_Name: "parent.name",
                  Rank_Rate: "parent.rankRate",
                  Unit: "parent.unit",
                  Admin_Authority: "parent.authority",
                  Service_Status: "parent.serviceStatus",
                  Parent_CNIC: "parent.cnic",
                  Address: "parent.address",
                  Email: "parent.email",
                  Contact_No: "parent.contactNo",
                })[column] === item.code,
            )?.code || column;
          conflicts.push({
            type: "field_difference",
            field,
            existing: current,
            incoming,
          });
        }
      }
    }
  }
  for (const conflict of conflicts) {
    await connection.query(
      `INSERT INTO scms_import_conflicts
        (import_job_id, import_row_id, conflict_type, field_code, existing_value, incoming_value)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        jobId,
        rowId,
        conflict.type,
        conflict.field,
        JSON.stringify(conflict.existing),
        JSON.stringify(conflict.incoming),
      ],
    );
  }
  return conflicts;
}

async function classifyChildConflict(connection, mapped, match, rowId, jobId) {
  const identifier = mapped["child.cnicBformNo"];
  if (!identifier) return { conflicts: [], childId: null };
  const [[child]] = await connection.query(
    `SELECT * FROM Dependent_Children
     WHERE REPLACE(REPLACE(UPPER(CNIC_BForm_No), '-', ''), ' ', '') = ? LIMIT 1`,
    [normalizeIdentifier(identifier)],
  );
  if (!child) return { conflicts: [], childId: null };
  const conflicts = [];
  if (match.status !== "matched" || child.P_No_O_No !== match.parentPNo) {
    conflicts.push({
      type: "child_identity_collision",
      field: "child.cnicBformNo",
      existing: { childId: child.Child_ID, parentPNoONo: child.P_No_O_No },
      incoming: { identifier, matchedParent: match.parentPNo || null },
    });
  } else {
    conflicts.push({
      type: "child_already_exists",
      field: "child.cnicBformNo",
      existing: { childId: child.Child_ID, name: child.Child_Name },
      incoming: { identifier, name: mapped["child.name"] },
    });
  }
  for (const conflict of conflicts) {
    await connection.query(
      `INSERT INTO scms_import_conflicts
        (import_job_id, import_row_id, conflict_type, field_code, existing_value, incoming_value)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        jobId,
        rowId,
        conflict.type,
        conflict.field,
        JSON.stringify(conflict.existing),
        JSON.stringify(conflict.incoming),
      ],
    );
  }
  return { conflicts, childId: Number(child.Child_ID) };
}

function fieldColumn(fieldCode) {
  return {
    "parent.name": "Parent_Name",
    "parent.rankRate": "Rank_Rate",
    "parent.unit": "Unit",
    "parent.authority": "Admin_Authority",
    "parent.serviceStatus": "Service_Status",
    "parent.cnic": "Parent_CNIC",
    "parent.address": "Address",
    "parent.email": "Email",
    "parent.contactNo": "Contact_No",
  }[fieldCode];
}

async function resolvedConflictPlan(connection, rowId) {
  const [conflicts] = await connection.query(
    "SELECT * FROM scms_import_conflicts WHERE import_row_id = ? ORDER BY id",
    [rowId],
  );
  const plan = { skip: false, parentPNo: null, overwrite: new Map() };
  for (const conflict of conflicts) {
    if (!["resolved", "skipped"].includes(conflict.status))
      throw publicError(
        "This row still has an unresolved conflict.",
        409,
        "IMPORT_CONFLICT_PENDING",
      );
    if (conflict.resolution === "skip_row") {
      plan.skip = true;
      continue;
    }
    const resolvedValue = parseJson(conflict.resolved_value, null);
    if (
      conflict.conflict_type === "identity_collision" &&
      conflict.resolution === "manual"
    )
      plan.parentPNo = String(resolvedValue || "");
    if (
      conflict.conflict_type === "field_difference" &&
      ["use_incoming", "manual"].includes(conflict.resolution)
    ) {
      plan.overwrite.set(conflict.field_code, resolvedValue);
    }
    if (
      conflict.conflict_type === "child_already_exists" &&
      conflict.resolution === "keep_existing"
    )
      plan.skip = true;
  }
  return plan;
}

async function executeStagedRow(connection, job, row, actorId) {
  const mapped = parseJson(row.mapped_data, {});
  const plan = await resolvedConflictPlan(connection, row.id);
  if (plan.skip) {
    await connection.query(
      `UPDATE scms_import_rows SET status = 'skipped', executed_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
      [row.id],
    );
    return { skipped: true };
  }
  let parentPNo = plan.parentPNo || row.target_parent_p_no_o_no || null;
  if (parentPNo) {
    const [[exists]] = await connection.query(
      "SELECT P_No_O_No FROM Parent_Beneficiary WHERE P_No_O_No = ?",
      [parentPNo],
    );
    if (!exists)
      throw publicError(
        "The manually selected parent record no longer exists.",
        409,
        "IMPORT_PARENT_MISSING",
      );
  }
  const pNoInput = mapped["parent.pNoONo"] || "";
  const cnicInput = mapped["parent.cnic"] || "";
  if (!parentPNo) {
    const match = await matchParentByIdentifiers(connection, {
      pNoONo: pNoInput,
      cnic: cnicInput,
    });
    if (match.status === "conflict")
      throw publicError(
        "Parent identifiers became conflicting after validation.",
        409,
        "IMPORT_IDENTITY_CONFLICT",
      );
    parentPNo = match.status === "matched" ? match.parentPNo : null;
  }
  const incomingParent = parentValues(mapped);
  let parentCreated = false;
  let beforeParent = null;
  if (!parentPNo) {
    parentPNo =
      pNoInput ||
      `PROV-${crypto.randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
    await connection.query(
      `INSERT INTO Parent_Beneficiary
        (P_No_O_No, Parent_Name, Rank_Rate, Unit, Admin_Authority, Service_Status, Parent_CNIC,
         Address, Email, Contact_No, Status, Origin, Record_State, Is_Provisional)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activation_required', 'imported', 'incomplete', TRUE)`,
      [
        parentPNo,
        incomingParent.Parent_Name,
        incomingParent.Rank_Rate,
        incomingParent.Unit,
        incomingParent.Admin_Authority,
        incomingParent.Service_Status,
        incomingParent.Parent_CNIC,
        incomingParent.Address,
        incomingParent.Email,
        incomingParent.Contact_No,
      ],
    );
    await syncParentIdentifiers(connection, parentPNo, cnicInput, {
      source: "import",
      verified: false,
    });
    parentCreated = true;
  } else {
    const [[existing]] = await connection.query(
      `SELECT ${IMPORT_PARENT_COLUMNS} FROM Parent_Beneficiary WHERE P_No_O_No = ?`,
      [parentPNo],
    );
    beforeParent = existing;
    const updates = [];
    const params = [];
    for (const [column, incoming] of Object.entries(incomingParent)) {
      if (incoming === null || incoming === "") continue;
      const fieldCode = Object.keys({
        "parent.name": "Parent_Name",
        "parent.rankRate": "Rank_Rate",
        "parent.unit": "Unit",
        "parent.authority": "Admin_Authority",
        "parent.serviceStatus": "Service_Status",
        "parent.cnic": "Parent_CNIC",
        "parent.address": "Address",
        "parent.email": "Email",
        "parent.contactNo": "Contact_No",
      }).find((code) => fieldColumn(code) === column);
      const chosen =
        fieldCode && plan.overwrite.has(fieldCode)
          ? plan.overwrite.get(fieldCode)
          : incoming;
      const currentBlank =
        existing[column] === null || String(existing[column]).trim() === "";
      if (currentBlank || (fieldCode && plan.overwrite.has(fieldCode))) {
        updates.push(`${column} = ?`);
        params.push(chosen);
      }
    }
    if (updates.length)
      await connection.query(
        `UPDATE Parent_Beneficiary SET ${updates.join(", ")} WHERE P_No_O_No = ?`,
        [...params, parentPNo],
      );
    await syncParentIdentifiers(
      connection,
      parentPNo,
      plan.overwrite.get("parent.cnic") || existing.Parent_CNIC || cnicInput,
      { source: "import", verified: false },
    );
  }
  await refreshParentCompleteness(connection, parentPNo);

  let childId = null;
  const hasChild = [
    "child.name",
    "child.age",
    "child.cnicBformNo",
    "child.school",
    "child.category",
  ].some(
    (code) =>
      mapped[code] !== null &&
      mapped[code] !== undefined &&
      mapped[code] !== "",
  );
  if (hasChild) {
    const childIdentifier = mapped["child.cnicBformNo"] || null;
    if (childIdentifier) {
      const [[existingChild]] = await connection.query(
        `SELECT Child_ID FROM Dependent_Children WHERE REPLACE(REPLACE(UPPER(CNIC_BForm_No), '-', ''), ' ', '') = ? LIMIT 1`,
        [normalizeIdentifier(childIdentifier)],
      );
      if (existingChild)
        throw publicError(
          "The child identifier already exists and must be resolved before execution.",
          409,
          "IMPORT_CHILD_DUPLICATE",
        );
    }
    const [childResult] = await connection.query(
      `INSERT INTO Dependent_Children
        (P_No_O_No, Child_Name, Age, CNIC_BForm_No, School, Parent_Selected_Category, Status, Record_State, Is_Provisional)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', 'incomplete', TRUE)`,
      [
        parentPNo,
        mapped["child.name"] || null,
        mapped["child.age"] ? Number(mapped["child.age"]) : null,
        childIdentifier,
        mapped["child.school"] || null,
        mapped["child.category"] || null,
      ],
    );
    childId = Number(childResult.insertId);
    await refreshChildCompleteness(connection, childId);
  }
  const [[afterParent]] = await connection.query(
    `SELECT ${IMPORT_PARENT_COLUMNS} FROM Parent_Beneficiary WHERE P_No_O_No = ?`,
    [parentPNo],
  );
  const [[afterChild]] = childId
    ? await connection.query(
        `SELECT ${IMPORT_CHILD_COLUMNS} FROM Dependent_Children WHERE Child_ID = ?`,
        [childId],
      )
    : [[]];
  await connection.query(
    `UPDATE scms_import_rows SET status = 'executed', target_parent_p_no_o_no = ?, target_child_id = ?,
       before_values = ?, after_values = ?, executed_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [
      parentPNo,
      childId,
      beforeParent ? JSON.stringify({ parent: beforeParent }) : null,
      JSON.stringify({
        parent: afterParent,
        child: afterChild || null,
        childId,
        parentCreated,
      }),
      row.id,
    ],
  );
  await connection.query(
    `INSERT INTO scms_audit_events (actor_user_id, action, entity_type, entity_id, correlation_id, details)
     VALUES (?, 'import.row.executed', 'import_row', ?, UUID(), ?)`,
    [
      actorId,
      String(row.id),
      JSON.stringify({
        jobId: job.id,
        sourceRow: row.source_row_number,
        parentPNo,
        childId,
        parentCreated,
      }),
    ],
  );
  return { skipped: false };
}

const PARENT_ROLLBACK_COLUMNS = [
  "Parent_Name",
  "Rank_Rate",
  "Unit",
  "Admin_Authority",
  "Service_Status",
  "Parent_CNIC",
  "Address",
  "Email",
  "Contact_No",
  "Status",
  "Origin",
  "Record_State",
  "Missing_Fields",
  "Is_Provisional",
  "Claimed_At",
  "Block_Reason",
  "Blocked_At",
];
const CHILD_ROLLBACK_COLUMNS = [
  "P_No_O_No",
  "Child_Name",
  "Age",
  "CNIC_BForm_No",
  "School",
  "Parent_Selected_Category",
  "Status",
  "Record_State",
  "Missing_Fields",
  "Is_Provisional",
];

function snapshotMatches(current, expected, columns) {
  return columns.every((column) =>
    importValuesEqual(current?.[column], expected?.[column]),
  );
}

async function childDependencyCount(connection, childId) {
  const [[counts]] = await connection.query(
    `SELECT
       (SELECT COUNT(*) FROM Monthly_Grants WHERE Child_ID = ?) +
       (SELECT COUNT(*) FROM Child_Gadgets WHERE Child_ID = ?) +
       (SELECT COUNT(*) FROM scms_child_category_decisions WHERE child_id = ?) +
       (SELECT COUNT(*) FROM scms_document_files WHERE owner_type = 'child' AND owner_id = ?) +
       (SELECT COUNT(*) FROM scms_form_submissions WHERE owner_type = 'child' AND owner_id = ?) +
       (SELECT COUNT(*) FROM scms_message_threads WHERE owner_type = 'child' AND owner_id = ?) AS total`,
    [
      childId,
      childId,
      childId,
      String(childId),
      String(childId),
      String(childId),
    ],
  );
  return Number(counts.total || 0);
}

async function parentDependencyCount(
  connection,
  parentPNo,
  excludedChildId = null,
) {
  const [[counts]] = await connection.query(
    `SELECT
       (SELECT COUNT(*) FROM Dependent_Children WHERE P_No_O_No = ? AND (? IS NULL OR Child_ID <> ?)) +
       (SELECT COUNT(*) FROM Document_Tracking WHERE P_No_O_No = ?) +
       (SELECT COUNT(*) FROM Banking_Details WHERE P_No_O_No = ?) +
       (SELECT COUNT(*) FROM Parent_Document_Files WHERE P_No_O_No = ?) +
       (SELECT COUNT(*) FROM scms_document_files WHERE parent_p_no_o_no = ?) +
       (SELECT COUNT(*) FROM scms_form_submissions WHERE parent_p_no_o_no = ?) +
       (SELECT COUNT(*) FROM scms_message_threads WHERE parent_p_no_o_no = ?) +
       (SELECT COUNT(*) FROM scms_parent_change_requests WHERE parent_p_no_o_no = ?) +
       (SELECT COUNT(*) FROM scms_parent_credential_events WHERE p_no_o_no = ?) +
       (SELECT COUNT(*) FROM Approval_Requests WHERE user_id = ?) AS total`,
    [
      parentPNo,
      excludedChildId,
      excludedChildId,
      parentPNo,
      parentPNo,
      parentPNo,
      parentPNo,
      parentPNo,
      parentPNo,
      parentPNo,
      parentPNo,
      parentPNo,
    ],
  );
  return Number(counts.total || 0);
}

async function rollbackStagedRow(connection, job, row, actorId) {
  const before = parseJson(row.before_values, {});
  const after = parseJson(row.after_values, {});
  const parentPNo = row.target_parent_p_no_o_no;
  const childId = Number(row.target_child_id || after.childId || 0) || null;
  const blockers = [];
  let currentChild = null;
  let currentParent = null;

  if (childId) {
    const [childRows] = await connection.query(
      `SELECT ${IMPORT_CHILD_COLUMNS} FROM Dependent_Children WHERE Child_ID = ? FOR UPDATE`,
      [childId],
    );
    currentChild = childRows[0] || null;
    if (currentChild && !after.child)
      blockers.push(
        "The imported child predates rollback snapshots and cannot be removed automatically.",
      );
    if (
      currentChild &&
      after.child &&
      !snapshotMatches(currentChild, after.child, CHILD_ROLLBACK_COLUMNS)
    )
      blockers.push("The imported child was changed after this import.");
    if (currentChild && (await childDependencyCount(connection, childId)) > 0)
      blockers.push("The imported child now has linked records.");
  }

  if (parentPNo) {
    const [parentRows] = await connection.query(
      `SELECT ${IMPORT_PARENT_COLUMNS}, Claimed_At, Block_Reason, Blocked_At FROM Parent_Beneficiary WHERE P_No_O_No = ? FOR UPDATE`,
      [parentPNo],
    );
    currentParent = parentRows[0] || null;
    if (after.parentCreated && currentParent) {
      if (
        !snapshotMatches(currentParent, after.parent, PARENT_ROLLBACK_COLUMNS)
      )
        blockers.push("The imported parent was changed after this import.");
      if ((await parentDependencyCount(connection, parentPNo, childId)) > 0)
        blockers.push("The imported parent now has linked records.");
    } else if (
      !after.parentCreated &&
      currentParent &&
      before.parent &&
      after.parent
    ) {
      const changed = PARENT_ROLLBACK_COLUMNS.filter(
        (column) =>
          !importValuesEqual(before.parent[column], after.parent[column]),
      );
      if (!snapshotMatches(currentParent, after.parent, changed))
        blockers.push(
          "Parent fields changed by this import were edited afterward.",
        );
    } else if (!after.parentCreated && !currentParent) {
      blockers.push("The parent record no longer exists.");
    }
  }

  if (blockers.length) {
    const details = { outcome: "blocked", blockers };
    await connection.query(
      `UPDATE scms_import_rows SET rollback_status = 'blocked', rollback_details = ? WHERE id = ?`,
      [JSON.stringify(details), row.id],
    );
    await connection.query(
      `INSERT INTO scms_audit_events (actor_user_id, action, entity_type, entity_id, outcome, correlation_id, details)
       VALUES (?, 'import.row.rollback_blocked', 'import_row', ?, 'failure', UUID(), ?)`,
      [actorId, String(row.id), JSON.stringify({ jobId: job.id, blockers })],
    );
    return { blocked: true, details };
  }

  if (currentChild)
    await connection.query(
      "DELETE FROM Dependent_Children WHERE Child_ID = ?",
      [childId],
    );
  if (after.parentCreated && currentParent) {
    await connection.query(
      "DELETE FROM Parent_Beneficiary WHERE P_No_O_No = ?",
      [parentPNo],
    );
  } else if (currentParent && before.parent && after.parent) {
    const changed = PARENT_ROLLBACK_COLUMNS.filter(
      (column) =>
        !importValuesEqual(before.parent[column], after.parent[column]),
    );
    if (changed.length) {
      await connection.query(
        `UPDATE Parent_Beneficiary SET ${changed.map((column) => `${column} = ?`).join(", ")} WHERE P_No_O_No = ?`,
        [...changed.map((column) => before.parent[column] ?? null), parentPNo],
      );
      if (changed.includes("Parent_CNIC")) {
        const importedCnic = normalizeIdentifier(after.parent.Parent_CNIC);
        if (importedCnic) {
          await connection.query(
            `DELETE FROM scms_parent_identifiers
             WHERE parent_p_no_o_no = ? AND identifier_type = 'cnic' AND normalized_value = ? AND source = 'import' AND is_verified = FALSE`,
            [parentPNo, importedCnic],
          );
        }
        await syncParentIdentifiers(
          connection,
          parentPNo,
          before.parent.Parent_CNIC,
          { source: "rollback", verified: false },
        );
      }
    }
  }
  const details = {
    outcome: "rolled_back",
    childDeleted: Boolean(currentChild),
    parentDeleted: Boolean(after.parentCreated && currentParent),
  };
  await connection.query(
    `UPDATE scms_import_rows SET rollback_status = 'rolled_back', rollback_details = ?, rolled_back_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [JSON.stringify(details), row.id],
  );
  await connection.query(
    `INSERT INTO scms_audit_events (actor_user_id, action, entity_type, entity_id, correlation_id, details)
     VALUES (?, 'import.row.rolled_back', 'import_row', ?, UUID(), ?)`,
    [
      actorId,
      String(row.id),
      JSON.stringify({ jobId: job.id, parentPNo, childId, ...details }),
    ],
  );
  return { blocked: false, details };
}

export function registerImportPlatformRoutes(app, pool, transaction) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMPORT_BYTES, files: 1 },
  });
  const receiveImportFile = (req, res, next) =>
    upload.single("file")(req, res, (error) => {
      if (!error) {
        next();
        return;
      }
      next(
        publicError(
          error.code === "LIMIT_FILE_SIZE"
            ? "The import file exceeds the 20 MB limit."
            : "The import upload could not be read.",
          error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
          error.code === "LIMIT_FILE_SIZE"
            ? "IMPORT_FILE_TOO_LARGE"
            : "IMPORT_UPLOAD_INVALID",
        ),
      );
    });

  const executeJob = async (jobId, actorId) => {
    if (activeJobs.has(jobId)) return;
    activeJobs.add(jobId);
    try {
      const job = await getJob(pool, jobId);
      await pool.query(
        `UPDATE scms_import_jobs SET status = 'executing', heartbeat_at = CURRENT_TIMESTAMP(3), last_error = NULL,
           execution_started_by = COALESCE(execution_started_by, ?), execution_started_at = COALESCE(execution_started_at, CURRENT_TIMESTAMP(3))
         WHERE id = ?`,
        [actorId || null, jobId],
      );
      await logEvent(
        pool,
        jobId,
        "execution.started",
        "Execution started for validated, non-conflicting rows.",
      );
      const [rows] = await pool.query(
        `SELECT * FROM scms_import_rows
         WHERE import_job_id = ? AND status IN ('valid', 'warning', 'conflict')
         ORDER BY source_row_number`,
        [jobId],
      );
      let processed = 0;
      for (const row of rows) {
        const [[pending]] = await pool.query(
          `SELECT COUNT(*) AS total FROM scms_import_conflicts WHERE import_row_id = ? AND status NOT IN ('resolved', 'skipped')`,
          [row.id],
        );
        if (Number(pending.total) > 0) continue;
        try {
          await transaction((connection) =>
            executeStagedRow(connection, job, row, actorId),
          );
        } catch (rowError) {
          const issues = [
            ...parseJson(row.issues, []),
            {
              code: rowError.publicCode || "EXECUTION_FAILED",
              message: rowError.publicCode
                ? rowError.message
                : "The row failed during execution and was not applied.",
            },
          ];
          await pool.query(
            `UPDATE scms_import_rows SET status = 'invalid', issues = ? WHERE id = ?`,
            [JSON.stringify(issues), row.id],
          );
          await logEvent(
            pool,
            jobId,
            "row.execution_failed",
            `Source row ${row.source_row_number} was not applied.`,
            {
              sourceRow: row.source_row_number,
              code: rowError.publicCode || "EXECUTION_FAILED",
            },
            "error",
          );
        }
        processed += 1;
        if (processed % 25 === 0 || processed === rows.length) {
          const progress =
            35 + Math.min(60, (processed / Math.max(rows.length, 1)) * 60);
          await pool.query(
            `UPDATE scms_import_jobs SET progress_percent = ?, heartbeat_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
            [progress, jobId],
          );
        }
      }
      const [[counts]] = await pool.query(
        `SELECT
           SUM(status = 'executed') AS executedRows,
           SUM(status = 'skipped') AS skippedRows,
           SUM(status = 'invalid') AS invalidRows,
           SUM(status = 'conflict') AS conflictRows
         FROM scms_import_rows WHERE import_job_id = ?`,
        [jobId],
      );
      const hasIssues =
        Number(counts.invalidRows || 0) > 0 ||
        Number(counts.conflictRows || 0) > 0;
      await pool.query(
        `UPDATE scms_import_jobs SET status = ?, executed_rows = ?, skipped_rows = ?, invalid_rows = ?, conflict_rows = ?,
           progress_percent = 100, heartbeat_at = CURRENT_TIMESTAMP(3), completed_at = CURRENT_TIMESTAMP(3), row_version = row_version + 1
         WHERE id = ?`,
        [
          hasIssues ? "completed_with_issues" : "completed",
          Number(counts.executedRows || 0),
          Number(counts.skippedRows || 0),
          Number(counts.invalidRows || 0),
          Number(counts.conflictRows || 0),
          jobId,
        ],
      );
      await logEvent(
        pool,
        jobId,
        "execution.completed",
        `Execution completed with ${Number(counts.executedRows || 0)} applied and ${Number(counts.skippedRows || 0)} skipped row(s).`,
        counts,
        hasIssues ? "warning" : "info",
      );
    } catch (error) {
      await pool
        .query(
          `UPDATE scms_import_jobs SET status = 'failed', last_error = ?, heartbeat_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
          [
            String(
              error.publicCode ? error.message : "Import execution failed.",
            ).slice(0, 1000),
            jobId,
          ],
        )
        .catch(() => undefined);
      await logEvent(
        pool,
        jobId,
        "execution.failed",
        "Import execution stopped unexpectedly.",
        { code: error.publicCode || "EXECUTION_FAILED" },
        "error",
      ).catch(() => undefined);
    } finally {
      activeJobs.delete(jobId);
    }
  };

  const rollbackJob = async (jobId, actorId) => {
    if (activeJobs.has(jobId)) return;
    activeJobs.add(jobId);
    try {
      const job = await getJob(pool, jobId);
      await pool.query(
        `UPDATE scms_import_jobs SET status = 'rolling_back', rollback_status = 'running',
           rollback_started_at = COALESCE(rollback_started_at, CURRENT_TIMESTAMP(3)), heartbeat_at = CURRENT_TIMESTAMP(3), last_error = NULL
         WHERE id = ?`,
        [jobId],
      );
      await logEvent(
        pool,
        jobId,
        "rollback.started",
        "Guarded rollback started. Rows are checked for later edits and linked records before reversal.",
      );
      const [rows] = await pool.query(
        `SELECT * FROM scms_import_rows
         WHERE import_job_id = ? AND status = 'executed' AND rollback_status <> 'rolled_back'
         ORDER BY source_row_number DESC`,
        [jobId],
      );
      let processed = 0;
      for (const row of rows) {
        try {
          await transaction((connection) =>
            rollbackStagedRow(connection, job, row, actorId),
          );
        } catch (rowError) {
          const details = {
            outcome: "blocked",
            blockers: ["The row could not be reversed safely."],
            code: rowError.code || rowError.publicCode || "ROLLBACK_FAILED",
          };
          await pool.query(
            `UPDATE scms_import_rows SET rollback_status = 'blocked', rollback_details = ? WHERE id = ?`,
            [JSON.stringify(details), row.id],
          );
          await logEvent(
            pool,
            jobId,
            "row.rollback_blocked",
            `Source row ${row.source_row_number} was not reversed.`,
            details,
            "warning",
          );
        }
        processed += 1;
        if (processed % 25 === 0 || processed === rows.length) {
          await pool.query(
            `UPDATE scms_import_jobs SET heartbeat_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
            [jobId],
          );
        }
      }
      const [[counts]] = await pool.query(
        `SELECT
           SUM(rollback_status = 'rolled_back') AS rolledBackRows,
           SUM(rollback_status = 'blocked') AS blockedRows
         FROM scms_import_rows WHERE import_job_id = ? AND status = 'executed'`,
        [jobId],
      );
      const summary = {
        rolledBackRows: Number(counts.rolledBackRows || 0),
        blockedRows: Number(counts.blockedRows || 0),
      };
      const hasBlocked = summary.blockedRows > 0;
      await pool.query(
        `UPDATE scms_import_jobs SET status = ?, rollback_status = ?, rollback_summary = ?,
           rolled_back_at = CURRENT_TIMESTAMP(3), heartbeat_at = CURRENT_TIMESTAMP(3), row_version = row_version + 1
         WHERE id = ?`,
        [
          hasBlocked ? "rollback_completed_with_issues" : "rolled_back",
          hasBlocked ? "completed_with_issues" : "completed",
          JSON.stringify(summary),
          jobId,
        ],
      );
      await logEvent(
        pool,
        jobId,
        "rollback.completed",
        `Rollback completed with ${summary.rolledBackRows} reversed and ${summary.blockedRows} protected row(s).`,
        summary,
        hasBlocked ? "warning" : "info",
      );
    } catch (error) {
      await pool
        .query(
          `UPDATE scms_import_jobs SET rollback_status = 'failed', last_error = ?, heartbeat_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
          [
            String(
              error.publicCode ? error.message : "Import rollback failed.",
            ).slice(0, 1000),
            jobId,
          ],
        )
        .catch(() => undefined);
      await logEvent(
        pool,
        jobId,
        "rollback.failed",
        "Import rollback stopped unexpectedly and can be resumed.",
        { code: error.publicCode || error.code || "ROLLBACK_FAILED" },
        "error",
      ).catch(() => undefined);
    } finally {
      activeJobs.delete(jobId);
    }
  };

  recoverWorkers = async () => {
    const [executions] = await pool.query(
      `SELECT id, execution_started_by FROM scms_import_jobs WHERE status = 'executing' ORDER BY id`,
    );
    const [rollbacks] = await pool.query(
      `SELECT id, rolled_back_by FROM scms_import_jobs WHERE rollback_status = 'running' OR status = 'rolling_back' ORDER BY id`,
    );
    for (const job of executions)
      setImmediate(() => {
        void executeJob(
          Number(job.id),
          job.execution_started_by ? Number(job.execution_started_by) : null,
        );
      });
    for (const job of rollbacks)
      setImmediate(() => {
        void rollbackJob(
          Number(job.id),
          job.rolled_back_by ? Number(job.rolled_back_by) : null,
        );
      });
    const retention = await cleanupExpiredImportSources(pool);
    return {
      resumedExecutions: executions.length,
      resumedRollbacks: rollbacks.length,
      cleanedSources: retention.cleaned + retention.missing,
    };
  };

  const maintenanceTimer = setInterval(
    () => {
      void cleanupExpiredImportSources(pool).catch((error) =>
        console.error("[Imports] Retention cleanup failed:", error.message),
      );
    },
    24 * 60 * 60 * 1000,
  );
  maintenanceTimer.unref();

  app.get("/api/imports/catalog", (_req, res) => {
    res.json({
      profiles: [
        { code: "parent", label: "Parents only" },
        { code: "child", label: "Children with parent identifiers" },
        { code: "mixed", label: "Mixed parent and child rows" },
      ],
      fields: IMPORT_FIELDS,
      transforms: [
        "trim",
        "uppercase",
        "lowercase",
        "digits_only",
        "normalize_identifier",
      ],
      acceptedFormats: [".xlsx", ".csv"],
      limits: {
        maxFileSizeBytes: MAX_IMPORT_BYTES,
        maxRows: MAX_ROWS,
        maxColumns: MAX_COLUMNS,
      },
    });
  });

  app.get("/api/imports/jobs", async (req, res, next) => {
    try {
      const canAccessAllJobs =
        req.staff?.permissions?.includes("imports.rollback");
      const [rows] = await pool.query(
        `SELECT j.*, u.display_name AS created_by_name
         FROM scms_import_jobs j LEFT JOIN scms_users u ON u.id = j.created_by
         ${canAccessAllJobs ? "" : "WHERE j.created_by = ?"}
         ORDER BY j.created_at DESC LIMIT 100`,
        canAccessAllJobs ? [] : [req.staff.id],
      );
      res.json(rows.map(formatJob));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/imports/jobs", receiveImportFile, async (req, res, next) => {
    let savedPath = "";
    try {
      if (!req.file)
        throw publicError("Choose an Excel or CSV file to upload.");
      const format = detectFormat(req.file);
      const sheets = await readWorkbook(req.file.buffer, format);
      if (!sheets.length)
        throw publicError(
          "The file contains no worksheets or rows.",
          400,
          "IMPORT_EMPTY",
        );
      const storageKey = crypto.randomBytes(32).toString("hex");
      const directory = path.join(importStorageRoot, storageKey.slice(0, 2));
      await fs.mkdir(directory, { recursive: true });
      savedPath = path.join(directory, `${storageKey}.${format}`);
      await fs.writeFile(savedPath, req.file.buffer, { flag: "wx" });
      const checksum = crypto
        .createHash("sha256")
        .update(req.file.buffer)
        .digest("hex");
      const metadata = sheetMetadata(sheets);
      const job = await transaction(async (connection) => {
        const [result] = await connection.query(
          `INSERT INTO scms_import_jobs
            (original_file_name, storage_key, file_format, file_size_bytes, checksum_sha256, source_metadata, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            String(req.file.originalname).slice(0, 255),
            storageKey,
            format,
            req.file.size,
            checksum,
            JSON.stringify(metadata),
            req.staff.id,
          ],
        );
        await logEvent(
          connection,
          result.insertId,
          "upload.completed",
          `Protected source file uploaded with ${sheets.length} sheet(s).`,
          {
            sheets: metadata.sheets.map((sheet) => ({
              name: sheet.name,
              rowCount: sheet.rowCount,
            })),
          },
        );
        return getJob(connection, result.insertId);
      });
      res.status(201).json(await job);
    } catch (error) {
      if (savedPath) await fs.unlink(savedPath).catch(() => undefined);
      next(error);
    }
  });

  app.get("/api/imports/jobs/:id", async (req, res, next) => {
    try {
      const job = await getJob(pool, req.params.id);
      assertJobAccess(job, req.staff);
      const [logs] = await pool.query(
        "SELECT * FROM scms_import_logs WHERE import_job_id = ? ORDER BY id DESC LIMIT 200",
        [job.id],
      );
      const [rows] = await pool.query(
        "SELECT * FROM scms_import_rows WHERE import_job_id = ? ORDER BY source_row_number LIMIT 200",
        [job.id],
      );
      const [conflicts] = await pool.query(
        "SELECT * FROM scms_import_conflicts WHERE import_job_id = ? ORDER BY id LIMIT 200",
        [job.id],
      );
      res.json({
        job,
        logs: logs.map((row) => ({
          ...row,
          details: parseJson(row.details, {}),
        })),
        rows: rows.map((row) => ({
          ...row,
          raw_data: parseJson(row.raw_data, {}),
          mapped_data: parseJson(row.mapped_data, {}),
          issues: parseJson(row.issues, []),
          rollback_details: parseJson(row.rollback_details, null),
        })),
        conflicts: conflicts.map((row) => ({
          ...row,
          existing_value: parseJson(row.existing_value, null),
          incoming_value: parseJson(row.incoming_value, null),
          resolved_value: parseJson(row.resolved_value, null),
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/imports/jobs/:id/result.csv", async (req, res, next) => {
    try {
      const job = await getJob(pool, req.params.id);
      assertJobAccess(job, req.staff);
      const rows = await loadResultRows(pool, job.id);
      const headings = [
        "source_row",
        "sheet",
        "status",
        "proposed_action",
        "parent_pn_o",
        "child_id",
        "issues",
        "rollback_status",
        "rollback_details",
        "executed_at",
        "rolled_back_at",
      ];
      const lines = [headings.map(csvCell).join(",")];
      for (const row of rows) {
        const issues = resultIssueText(row.issues);
        const rollbackDetails = resultRollbackText(row.rollback_details);
        lines.push(
          [
            row.source_row_number,
            row.sheet_name,
            row.status,
            row.proposed_action,
            row.target_parent_p_no_o_no,
            row.target_child_id,
            issues,
            row.rollback_status,
            rollbackDetails,
            row.executed_at instanceof Date
              ? row.executed_at.toISOString()
              : row.executed_at,
            row.rolled_back_at instanceof Date
              ? row.rolled_back_at.toISOString()
              : row.rolled_back_at,
          ]
            .map(csvCell)
            .join(","),
        );
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="import-${job.id}-result.csv"`,
      );
      res.send(`\uFEFF${lines.join("\r\n")}`);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/imports/jobs/:id/result.xlsx", async (req, res, next) => {
    try {
      const job = await getJob(pool, req.params.id);
      assertJobAccess(job, req.staff);
      const rows = await loadResultRows(pool, job.id);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="import-${job.id}-result.xlsx"`,
      );
      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
        stream: res,
        useStyles: true,
        useSharedStrings: false,
      });
      workbook.creator = "SCMS";
      workbook.created = new Date();
      const worksheet = workbook.addWorksheet("Import Results", {
        views: [{ state: "frozen", ySplit: 1 }],
      });
      worksheet.columns = [
        { header: "Source row", key: "sourceRow", width: 14 },
        { header: "Sheet", key: "sheet", width: 24 },
        { header: "Status", key: "status", width: 22 },
        { header: "Proposed action", key: "action", width: 24 },
        { header: "Parent PN/O", key: "parent", width: 22 },
        { header: "Child ID", key: "child", width: 14 },
        { header: "Issues", key: "issues", width: 60 },
        { header: "Rollback status", key: "rollbackStatus", width: 22 },
        { header: "Rollback details", key: "rollbackDetails", width: 60 },
        { header: "Executed at", key: "executedAt", width: 26 },
        { header: "Rolled back at", key: "rolledBackAt", width: 26 },
      ];
      worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E3A5F" },
      };
      worksheet.autoFilter = { from: "A1", to: "K1" };
      worksheet.getRow(1).commit();
      for (const row of rows) {
        const values = {
          sourceRow: Number(row.source_row_number),
          sheet: row.sheet_name || "",
          status: row.status || "",
          action: row.proposed_action || "",
          parent: row.target_parent_p_no_o_no || "",
          child: row.target_child_id || "",
          issues: resultIssueText(row.issues),
          rollbackStatus: row.rollback_status || "",
          rollbackDetails: resultRollbackText(row.rollback_details),
          executedAt:
            row.executed_at instanceof Date
              ? row.executed_at.toISOString()
              : row.executed_at || "",
          rolledBackAt:
            row.rolled_back_at instanceof Date
              ? row.rolled_back_at.toISOString()
              : row.rolled_back_at || "",
        };
        for (const key of [
          "sheet",
          "status",
          "action",
          "parent",
          "issues",
          "rollbackStatus",
          "rollbackDetails",
          "executedAt",
          "rolledBackAt",
        ]) {
          if (/^[=+\-@]/.test(String(values[key])))
            values[key] = `'${values[key]}`;
        }
        const resultRow = worksheet.addRow(values);
        resultRow.alignment = { vertical: "top", wrapText: true };
        resultRow.commit();
      }
      worksheet.commit();
      await workbook.commit();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/imports/jobs/:id/stage", async (req, res, next) => {
    try {
      const profile = String(req.body?.profile || "");
      const sheetName = String(req.body?.sheetName || "");
      const headerRow = Number(req.body?.headerRow);
      if (!PROFILES.has(profile))
        throw publicError("Choose a valid import profile.");
      if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > 100)
        throw publicError("Header row must be between 1 and 100.");
      const job = await getJob(pool, req.params.id);
      assertJobAccess(job, req.staff);
      if (["executing", "completed", "rolled_back"].includes(job.status))
        throw publicError(
          "This import can no longer be restaged.",
          409,
          "IMPORT_STATE_CONFLICT",
        );
      const sheets = await loadJobWorkbook(job);
      const sheet = sheets.find((item) => item.name === sheetName);
      if (!sheet)
        throw publicError(
          "Selected worksheet was not found.",
          404,
          "IMPORT_SHEET_NOT_FOUND",
        );
      if (!sheet.rows[headerRow - 1])
        throw publicError("The selected header row is empty.");
      const headers = uniqueHeaders(sheet.rows[headerRow - 1]);
      const dataRows = sheet.rows
        .slice(headerRow)
        .filter((row) => row.some((value) => value !== ""))
        .slice(0, MAX_ROWS);
      const mapping = suggestMapping(
        headers,
        profile,
        aliasMap(await configuredHeadingAliases(pool)),
      );
      const updated = await transaction(async (connection) => {
        await connection.query(
          "DELETE FROM scms_import_conflicts WHERE import_job_id = ?",
          [job.id],
        );
        await connection.query(
          "DELETE FROM scms_import_rows WHERE import_job_id = ?",
          [job.id],
        );
        for (let offset = 0; offset < dataRows.length; offset += 500) {
          const batch = dataRows.slice(offset, offset + 500);
          if (!batch.length) continue;
          const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
          const params = [];
          batch.forEach((values, index) => {
            const raw = Object.fromEntries(
              headers.map((header, column) => [
                header,
                safeCell(values[column]),
              ]),
            );
            const fingerprint = crypto
              .createHash("sha256")
              .update(JSON.stringify(raw))
              .digest("hex");
            params.push(
              job.id,
              sheet.name,
              headerRow + 1 + offset + index,
              fingerprint,
              JSON.stringify(raw),
              "staged",
            );
          });
          await connection.query(
            `INSERT INTO scms_import_rows
              (import_job_id, sheet_name, source_row_number, row_fingerprint, raw_data, status)
             VALUES ${placeholders}`,
            params,
          );
        }
        await connection.query(
          `UPDATE scms_import_jobs SET status = 'staged', import_profile = ?, selected_sheet = ?, header_row = ?,
             mapping_json = ?, transforms_json = JSON_OBJECT(), total_rows = ?, valid_rows = 0, warning_rows = 0,
             invalid_rows = 0, conflict_rows = 0, executed_rows = 0, skipped_rows = 0, progress_percent = 15,
             last_error = NULL, row_version = row_version + 1 WHERE id = ?`,
          [
            profile,
            sheet.name,
            headerRow,
            JSON.stringify(mapping),
            dataRows.length,
            job.id,
          ],
        );
        await logEvent(
          connection,
          job.id,
          "staging.completed",
          `${dataRows.length} row(s) staged from ${sheet.name}.`,
          {
            headerRow,
            headers,
            suggestedMappings: Object.keys(mapping).length,
          },
        );
        return getJob(connection, job.id);
      });
      res.json({
        job: await updated,
        headers,
        suggestedMapping: mapping,
        preview: dataRows
          .slice(0, 20)
          .map((values) =>
            Object.fromEntries(
              headers.map((header, column) => [
                header,
                safeCell(values[column]),
              ]),
            ),
          ),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/imports/jobs/:id/validate", async (req, res, next) => {
    try {
      const job = await getJob(pool, req.params.id);
      assertJobAccess(job, req.staff);
      if (
        !["staged", "validated", "validated_with_issues"].includes(job.status)
      )
        throw publicError(
          "Stage the import before validation.",
          409,
          "IMPORT_NOT_STAGED",
        );
      const mapping =
        req.body?.mapping && typeof req.body.mapping === "object"
          ? req.body.mapping
          : {};
      const transforms =
        req.body?.transforms && typeof req.body.transforms === "object"
          ? req.body.transforms
          : {};
      const allowedCodes = new Set(IMPORT_FIELDS.map((field) => field.code));
      for (const [code, header] of Object.entries(mapping)) {
        if (!allowedCodes.has(code) || typeof header !== "string")
          throw publicError(
            "The column mapping contains an unsupported field.",
            400,
            "INVALID_IMPORT_MAPPING",
          );
      }
      const result = await transaction(async (connection) => {
        const [rows] = await connection.query(
          "SELECT * FROM scms_import_rows WHERE import_job_id = ? ORDER BY source_row_number",
          [job.id],
        );
        const references = await referenceSets(connection);
        const parentScope = await loadDataScope(
          connection,
          req.staff,
          "parents",
        );
        await connection.query(
          "DELETE FROM scms_import_conflicts WHERE import_job_id = ?",
          [job.id],
        );
        const counts = { valid: 0, warning: 0, invalid: 0, conflict: 0 };
        for (const row of rows) {
          const raw = parseJson(row.raw_data, {});
          const mapped = mapImportRow(raw, mapping, transforms);
          const validation = validateMappedRow(mapped, job.import_profile);
          addReferenceIssues(mapped, references, validation.errors);
          if (
            !scopeAllowsAuthority(
              parentScope,
              mapped["parent.authority"] || null,
            )
          ) {
            validation.errors.push({
              code: "OUTSIDE_DATA_SCOPE",
              field: "parent.authority",
              message:
                "The row is outside your assigned parent authority scope.",
            });
          }
          let match = { status: "insufficient_identifiers", matches: [] };
          let conflicts = [];
          if (validation.errors.length === 0) {
            match = await matchParentByIdentifiers(connection, {
              pNoONo: mapped["parent.pNoONo"],
              cnic: mapped["parent.cnic"],
            });
            const parentConflicts = await classifyDatabaseConflicts(
              connection,
              mapped,
              match,
              row.id,
              job.id,
            );
            const childResult = await classifyChildConflict(
              connection,
              mapped,
              match,
              row.id,
              job.id,
            );
            conflicts = [...parentConflicts, ...childResult.conflicts];
            row.target_child_id = childResult.childId;
          }
          let status = "valid";
          if (validation.errors.length) status = "invalid";
          else if (conflicts.length) status = "conflict";
          else if (validation.warnings.length) status = "warning";
          counts[status] += 1;
          const proposedAction =
            match.status === "matched"
              ? "update_candidate"
              : "create_provisional";
          await connection.query(
            `UPDATE scms_import_rows SET mapped_data = ?, status = ?, issues = ?, proposed_action = ?,
               target_parent_p_no_o_no = ?, target_child_id = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
            [
              JSON.stringify(mapped),
              status,
              JSON.stringify([...validation.errors, ...validation.warnings]),
              proposedAction,
              match.parentPNo || null,
              row.target_child_id || null,
              row.id,
            ],
          );
        }
        const finalStatus =
          counts.invalid || counts.conflict
            ? "validated_with_issues"
            : "validated";
        await connection.query(
          `UPDATE scms_import_jobs SET status = ?, mapping_json = ?, transforms_json = ?, valid_rows = ?, warning_rows = ?,
             invalid_rows = ?, conflict_rows = ?, progress_percent = 35, heartbeat_at = CURRENT_TIMESTAMP(3),
             row_version = row_version + 1 WHERE id = ?`,
          [
            finalStatus,
            JSON.stringify(mapping),
            JSON.stringify(transforms),
            counts.valid,
            counts.warning,
            counts.invalid,
            counts.conflict,
            job.id,
          ],
        );
        await logEvent(
          connection,
          job.id,
          "validation.completed",
          "Dry-run validation completed without changing operational records.",
          counts,
          counts.invalid || counts.conflict ? "warning" : "info",
        );
        return { counts, job: await getJob(connection, job.id) };
      });
      res.json(await result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/imports/jobs/:id/execute", async (req, res, next) => {
    try {
      const job = await getJob(pool, req.params.id);
      assertJobAccess(job, req.staff);
      if (
        !["validated", "validated_with_issues", "failed"].includes(job.status)
      )
        throw publicError(
          "Only a dry-run validated job can be executed.",
          409,
          "IMPORT_NOT_VALIDATED",
        );
      if (activeJobs.has(job.id)) {
        res.status(202).json({ jobId: job.id, status: "executing" });
        return;
      }
      await pool.query(
        `UPDATE scms_import_jobs SET status = 'executing', heartbeat_at = CURRENT_TIMESTAMP(3),
           progress_percent = GREATEST(progress_percent, 35), execution_started_by = ?,
           execution_started_at = COALESCE(execution_started_at, CURRENT_TIMESTAMP(3)) WHERE id = ?`,
        [req.staff.id, job.id],
      );
      setImmediate(() => {
        void executeJob(job.id, req.staff.id);
      });
      res.status(202).json({ jobId: job.id, status: "executing" });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/imports/jobs/:id/rollback", async (req, res, next) => {
    try {
      const job = await getJob(pool, req.params.id);
      assertJobAccess(job, req.staff);
      const reason = String(req.body?.reason || "").trim();
      const confirmation = String(req.body?.confirmation || "").trim();
      if (reason.length < 10 || reason.length > 1000)
        throw publicError(
          "Enter a rollback reason between 10 and 1000 characters.",
        );
      if (confirmation !== String(job.id))
        throw publicError(
          `Type import job number ${job.id} to confirm the rollback.`,
        );
      if (
        ![
          "completed",
          "completed_with_issues",
          "rollback_completed_with_issues",
        ].includes(job.status)
      ) {
        throw publicError(
          "Only a completed import can be rolled back.",
          409,
          "IMPORT_ROLLBACK_NOT_ALLOWED",
        );
      }
      if (job.rollback_status === "running" || activeJobs.has(job.id)) {
        res.status(202).json({ jobId: job.id, status: "rolling_back" });
        return;
      }
      const [[eligible]] = await pool.query(
        `SELECT COUNT(*) AS total FROM scms_import_rows
         WHERE import_job_id = ? AND status = 'executed' AND rollback_status <> 'rolled_back'`,
        [job.id],
      );
      if (Number(eligible.total) === 0)
        throw publicError(
          "This job has no remaining executed rows to reverse.",
          409,
          "IMPORT_NOTHING_TO_ROLLBACK",
        );
      await pool.query(
        `UPDATE scms_import_jobs SET status = 'rolling_back', rollback_status = 'running', rollback_reason = ?,
           rolled_back_by = ?, rollback_started_at = CURRENT_TIMESTAMP(3), rolled_back_at = NULL,
           heartbeat_at = CURRENT_TIMESTAMP(3), last_error = NULL WHERE id = ?`,
        [reason, req.staff.id, job.id],
      );
      await logEvent(
        pool,
        job.id,
        "rollback.requested",
        "A guarded rollback was requested.",
        { reason },
        "warning",
      );
      setImmediate(() => {
        void rollbackJob(job.id, req.staff.id);
      });
      res.status(202).json({ jobId: job.id, status: "rolling_back" });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/imports/conflicts/:id/resolve", async (req, res, next) => {
    try {
      const resolution = String(req.body?.resolution || "");
      const note =
        String(req.body?.note || "")
          .trim()
          .slice(0, 1000) || null;
      if (
        ![
          "keep_existing",
          "use_incoming",
          "manual",
          "skip_row",
          "defer",
        ].includes(resolution)
      )
        throw publicError("Choose a valid conflict resolution.");
      const result = await transaction(async (connection) => {
        const [[conflict]] = await connection.query(
          "SELECT * FROM scms_import_conflicts WHERE id = ? FOR UPDATE",
          [Number(req.params.id)],
        );
        if (!conflict)
          throw publicError(
            "Import conflict not found.",
            404,
            "IMPORT_CONFLICT_NOT_FOUND",
          );
        const [[job]] = await connection.query(
          "SELECT status, created_by FROM scms_import_jobs WHERE id = ?",
          [conflict.import_job_id],
        );
        if (
          !job ||
          [
            "executing",
            "completed",
            "completed_with_issues",
            "rolled_back",
          ].includes(job.status)
        )
          throw publicError(
            "Conflicts cannot be changed after execution starts.",
            409,
            "IMPORT_STATE_CONFLICT",
          );
        assertJobAccess(job, req.staff);
        let resolvedValue = null;
        let status =
          resolution === "defer"
            ? "deferred"
            : resolution === "skip_row"
              ? "skipped"
              : "resolved";
        if (
          ["child_identity_collision", "child_already_exists"].includes(
            conflict.conflict_type,
          ) &&
          !["keep_existing", "skip_row", "defer"].includes(resolution)
        ) {
          throw publicError(
            "An existing child identifier cannot be overwritten. Keep the existing child, skip the row, or defer it.",
          );
        }
        if (
          conflict.conflict_type === "identity_collision" &&
          resolution !== "manual" &&
          !["skip_row", "defer"].includes(resolution)
        ) {
          throw publicError(
            "An identity collision requires a manually selected existing parent PN/O number, or the row must be skipped/deferred.",
          );
        }
        if (resolution === "keep_existing")
          resolvedValue = parseJson(conflict.existing_value, null);
        if (resolution === "use_incoming")
          resolvedValue = parseJson(conflict.incoming_value, null);
        if (resolution === "manual") {
          const value = req.body?.value;
          if (
            value === undefined ||
            value === null ||
            String(value).trim() === ""
          )
            throw publicError("Enter the manual resolution value.");
          resolvedValue = String(value).trim();
          if (conflict.conflict_type === "identity_collision") {
            const [[parent]] = await connection.query(
              "SELECT P_No_O_No FROM Parent_Beneficiary WHERE P_No_O_No = ?",
              [resolvedValue],
            );
            if (!parent)
              throw publicError(
                "The selected parent PN/O number does not exist.",
                400,
                "IMPORT_PARENT_MISSING",
              );
          }
        }
        if (
          ["child_identity_collision", "child_already_exists"].includes(
            conflict.conflict_type,
          ) &&
          resolution === "keep_existing"
        ) {
          status = "skipped";
        }
        await connection.query(
          `UPDATE scms_import_conflicts SET status = ?, resolution = ?, resolved_value = ?, resolution_note = ?,
             resolved_by = ?, resolved_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
          [
            status,
            resolution,
            resolvedValue === null ? null : JSON.stringify(resolvedValue),
            note,
            req.staff.id,
            conflict.id,
          ],
        );
        if (status === "skipped")
          await connection.query(
            `UPDATE scms_import_rows SET status = 'skipped' WHERE id = ?`,
            [conflict.import_row_id],
          );
        const [[remaining]] = await connection.query(
          `SELECT COUNT(*) AS total FROM scms_import_conflicts WHERE import_row_id = ? AND status NOT IN ('resolved', 'skipped')`,
          [conflict.import_row_id],
        );
        if (Number(remaining.total) === 0 && status !== "skipped")
          await connection.query(
            `UPDATE scms_import_rows SET status = 'warning' WHERE id = ?`,
            [conflict.import_row_id],
          );
        const [[pendingRows]] = await connection.query(
          `SELECT COUNT(DISTINCT import_row_id) AS total FROM scms_import_conflicts WHERE import_job_id = ? AND status NOT IN ('resolved', 'skipped')`,
          [conflict.import_job_id],
        );
        await connection.query(
          `UPDATE scms_import_jobs SET conflict_rows = ?, row_version = row_version + 1 WHERE id = ?`,
          [Number(pendingRows.total), conflict.import_job_id],
        );
        await logEvent(
          connection,
          conflict.import_job_id,
          "conflict.resolved",
          `Conflict ${conflict.id} was ${resolution.replace("_", " ")}.`,
          {
            conflictId: conflict.id,
            resolution,
            rowId: conflict.import_row_id,
          },
        );
        return {
          id: Number(conflict.id),
          status,
          resolution,
          remainingRowConflicts: Number(remaining.total),
        };
      });
      res.json(await result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/imports/settings", async (_req, res, next) => {
    try {
      res.json(await loadImportSettings(pool));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/imports/settings", async (req, res, next) => {
    try {
      const retentionDays = Number(req.body?.sourceRetentionDays);
      const reason = String(req.body?.reason || "").trim();
      if (
        !Number.isInteger(retentionDays) ||
        retentionDays < 7 ||
        retentionDays > 3650
      )
        throw publicError("Source retention must be between 7 and 3650 days.");
      if (reason.length < 5 || reason.length > 500)
        throw publicError("Enter a reason between 5 and 500 characters.");
      const cleanupEnabled = Boolean(req.body?.cleanupEnabled);
      await transaction(async (connection) => {
        const previous = await loadImportSettings(connection);
        await connection.query(
          `UPDATE scms_import_settings SET source_retention_days = ?, cleanup_enabled = ?, updated_by = ? WHERE id = 1`,
          [retentionDays, cleanupEnabled, req.staff.id],
        );
        await appendImportAudit(
          connection,
          req,
          "import.settings.updated",
          "import_settings",
          1,
          {
            previous,
            next: { sourceRetentionDays: retentionDays, cleanupEnabled },
          },
          reason,
        );
      });
      res.json(await loadImportSettings(pool));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/imports/maintenance/cleanup", async (req, res, next) => {
    try {
      const reason = String(
        req.body?.reason || "Manual retention cleanup",
      ).trim();
      if (reason.length < 5 || reason.length > 500)
        throw publicError(
          "Enter a cleanup reason between 5 and 500 characters.",
        );
      const result = await cleanupExpiredImportSources(pool, {
        actorId: req.staff.id,
        reason: "manual_retention_cleanup",
      });
      await appendImportAudit(
        pool,
        req,
        "import.retention.cleanup",
        "import_settings",
        1,
        result,
        reason,
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/imports/heading-aliases", async (_req, res, next) => {
    try {
      const rows = await configuredHeadingAliases(pool, {
        includeInactive: true,
      });
      res.json(
        rows.map((row) => ({
          ...row,
          id: Number(row.id),
          is_active: Boolean(row.is_active),
        })),
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/imports/heading-aliases", async (req, res, next) => {
    try {
      const fieldCode = String(req.body?.fieldCode || "").trim();
      const alias = String(req.body?.alias || "").trim();
      const reason = String(req.body?.reason || "").trim();
      if (!IMPORT_FIELDS.some((field) => field.code === fieldCode))
        throw publicError("Choose a supported SCMS destination field.");
      if (!alias || alias.length > 160)
        throw publicError(
          "Heading alias must be between 1 and 160 characters.",
        );
      if (reason.length < 5 || reason.length > 500)
        throw publicError("Enter a reason between 5 and 500 characters.");
      const normalized = normalizeHeader(alias);
      if (!normalized)
        throw publicError(
          "Heading alias must contain at least one letter or number.",
        );
      const builtIn = IMPORT_FIELDS.find((field) =>
        field.aliases.map(normalizeHeader).includes(normalized),
      );
      if (builtIn)
        throw publicError(
          `That heading is already recognized as ${builtIn.label}.`,
        );
      const [result] = await pool.query(
        `INSERT INTO scms_import_heading_aliases (field_code, alias, normalized_alias, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?)`,
        [fieldCode, alias, normalized, req.staff.id, req.staff.id],
      );
      await appendImportAudit(
        pool,
        req,
        "import.heading_alias.created",
        "import_heading_alias",
        result.insertId,
        { fieldCode, alias },
        reason,
      );
      res
        .status(201)
        .json({
          id: Number(result.insertId),
          field_code: fieldCode,
          alias,
          is_active: true,
        });
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY") {
        next(
          publicError(
            "That heading alias is already configured.",
            409,
            "IMPORT_ALIAS_EXISTS",
          ),
        );
        return;
      }
      next(error);
    }
  });

  app.patch("/api/imports/heading-aliases/:id", async (req, res, next) => {
    try {
      const reason = String(req.body?.reason || "").trim();
      if (reason.length < 5 || reason.length > 500)
        throw publicError("Enter a reason between 5 and 500 characters.");
      const result = await transaction(async (connection) => {
        const [[existing]] = await connection.query(
          "SELECT * FROM scms_import_heading_aliases WHERE id = ? FOR UPDATE",
          [Number(req.params.id)],
        );
        if (!existing)
          throw publicError(
            "Heading alias was not found.",
            404,
            "IMPORT_ALIAS_NOT_FOUND",
          );
        const alias =
          req.body?.alias === undefined
            ? existing.alias
            : String(req.body.alias).trim();
        const fieldCode =
          req.body?.fieldCode === undefined
            ? existing.field_code
            : String(req.body.fieldCode).trim();
        const isActive =
          req.body?.isActive === undefined
            ? Boolean(existing.is_active)
            : Boolean(req.body.isActive);
        if (!IMPORT_FIELDS.some((field) => field.code === fieldCode))
          throw publicError("Choose a supported SCMS destination field.");
        if (!alias || alias.length > 160 || !normalizeHeader(alias))
          throw publicError(
            "Heading alias must contain 1 to 160 letters or numbers.",
          );
        const normalized = normalizeHeader(alias);
        const builtIn = IMPORT_FIELDS.find((field) =>
          field.aliases.map(normalizeHeader).includes(normalized),
        );
        if (builtIn)
          throw publicError(
            `That heading is already recognized as ${builtIn.label}.`,
          );
        await connection.query(
          `UPDATE scms_import_heading_aliases SET field_code = ?, alias = ?, normalized_alias = ?, is_active = ?, updated_by = ? WHERE id = ?`,
          [fieldCode, alias, normalized, isActive, req.staff.id, existing.id],
        );
        await appendImportAudit(
          connection,
          req,
          "import.heading_alias.updated",
          "import_heading_alias",
          existing.id,
          {
            previous: {
              fieldCode: existing.field_code,
              alias: existing.alias,
              isActive: Boolean(existing.is_active),
            },
            next: { fieldCode, alias, isActive },
          },
          reason,
        );
        return {
          id: Number(existing.id),
          field_code: fieldCode,
          alias,
          is_active: isActive,
        };
      });
      res.json(await result);
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY") {
        next(
          publicError(
            "That heading alias is already configured.",
            409,
            "IMPORT_ALIAS_EXISTS",
          ),
        );
        return;
      }
      next(error);
    }
  });

  app.get("/api/imports/mapping-templates", async (req, res, next) => {
    try {
      const includeInactive = String(req.query?.includeInactive || "") === "1";
      const canManageAll = req.staff?.permissions?.includes("imports.rollback");
      const [rows] = await pool.query(
        `SELECT * FROM scms_import_mapping_templates
         WHERE is_active = TRUE ${includeInactive ? (canManageAll ? "OR is_active = FALSE" : "OR created_by = ?") : ""}
         ORDER BY is_active DESC, name`,
        includeInactive && !canManageAll ? [req.staff.id] : [],
      );
      res.json(
        rows.map((row) => ({
          ...row,
          id: Number(row.id),
          row_version: Number(row.row_version),
          is_active: Boolean(row.is_active),
          mapping_json: parseJson(row.mapping_json, {}),
          transforms_json: parseJson(row.transforms_json, {}),
        })),
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/imports/mapping-templates", async (req, res, next) => {
    try {
      const name = String(req.body?.name || "").trim();
      const description = String(req.body?.description || "").trim();
      const profile = String(req.body?.profile || "");
      const headers = Array.isArray(req.body?.headers)
        ? req.body.headers.map((value) => String(value))
        : [];
      const mapping =
        req.body?.mapping && typeof req.body.mapping === "object"
          ? req.body.mapping
          : {};
      const transforms =
        req.body?.transforms && typeof req.body.transforms === "object"
          ? req.body.transforms
          : {};
      if (name.length < 3 || name.length > 160)
        throw publicError(
          "Template name must be between 3 and 160 characters.",
        );
      if (!PROFILES.has(profile) || !headers.length)
        throw publicError("Template profile and source headers are required.");
      if (description.length > 500)
        throw publicError("Template description is too long.");
      if (headers.length > MAX_COLUMNS)
        throw publicError("The template contains too many source headings.");
      const allowedCodes = new Set(IMPORT_FIELDS.map((field) => field.code));
      const headerSet = new Set(headers);
      const allowedTransforms = new Set([
        "trim",
        "uppercase",
        "lowercase",
        "digits_only",
        "normalize_identifier",
      ]);
      for (const [code, header] of Object.entries(mapping)) {
        if (
          !allowedCodes.has(code) ||
          typeof header !== "string" ||
          !headerSet.has(header)
        )
          throw publicError(
            "The template contains an unsupported field or source heading.",
          );
      }
      for (const [code, values] of Object.entries(transforms)) {
        if (
          !allowedCodes.has(code) ||
          !Array.isArray(values) ||
          values.some((value) => !allowedTransforms.has(value))
        )
          throw publicError(
            "The template contains an unsupported transformation.",
          );
      }
      const signature = crypto
        .createHash("sha256")
        .update(headers.map(normalizeHeader).sort().join("|"))
        .digest("hex");
      const [result] = await pool.query(
        `INSERT INTO scms_import_mapping_templates
          (name, description, import_profile, header_signature, mapping_json, transforms_json, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          description || null,
          profile,
          signature,
          JSON.stringify(mapping),
          JSON.stringify(transforms),
          req.staff.id,
          req.staff.id,
        ],
      );
      await appendImportAudit(
        pool,
        req,
        "import.mapping_template.created",
        "import_mapping_template",
        result.insertId,
        { name, profile },
      );
      res.status(201).json({
        id: Number(result.insertId),
        name,
        profile,
        headerSignature: signature,
      });
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY") {
        next(
          publicError(
            "A mapping template already uses that name.",
            409,
            "IMPORT_TEMPLATE_EXISTS",
          ),
        );
        return;
      }
      next(error);
    }
  });

  app.patch("/api/imports/mapping-templates/:id", async (req, res, next) => {
    try {
      await transaction(async (connection) => {
        const [[existing]] = await connection.query(
          "SELECT * FROM scms_import_mapping_templates WHERE id = ? FOR UPDATE",
          [Number(req.params.id)],
        );
        if (!existing)
          throw publicError(
            "Mapping template was not found.",
            404,
            "IMPORT_TEMPLATE_NOT_FOUND",
          );
        const canManageAll =
          req.staff?.permissions?.includes("imports.rollback");
        if (
          !canManageAll &&
          Number(existing.created_by) !== Number(req.staff.id)
        )
          throw publicError(
            "Mapping template was not found.",
            404,
            "IMPORT_TEMPLATE_NOT_FOUND",
          );
        const rowVersion = Number(req.body?.rowVersion);
        if (
          !Number.isInteger(rowVersion) ||
          rowVersion !== Number(existing.row_version)
        )
          throw publicError(
            "This mapping template changed after you opened it. Refresh and try again.",
            409,
            "IMPORT_TEMPLATE_VERSION_CONFLICT",
          );
        const name =
          req.body?.name === undefined
            ? existing.name
            : String(req.body.name).trim();
        const description =
          req.body?.description === undefined
            ? existing.description || ""
            : String(req.body.description).trim();
        const isActive =
          req.body?.isActive === undefined
            ? Boolean(existing.is_active)
            : Boolean(req.body.isActive);
        const profile =
          req.body?.profile === undefined
            ? existing.import_profile
            : String(req.body.profile);
        const mapping =
          req.body?.mapping &&
          typeof req.body.mapping === "object" &&
          !Array.isArray(req.body.mapping)
            ? req.body.mapping
            : parseJson(existing.mapping_json, {});
        const transforms =
          req.body?.transforms &&
          typeof req.body.transforms === "object" &&
          !Array.isArray(req.body.transforms)
            ? req.body.transforms
            : parseJson(existing.transforms_json, {});
        const headersProvided = Array.isArray(req.body?.headers);
        const headers = headersProvided
          ? req.body.headers.map(String)
          : [...new Set(Object.values(mapping).map(String))];
        if (name.length < 3 || name.length > 160 || description.length > 500)
          throw publicError("Template name or description is invalid.");
        if (
          !PROFILES.has(profile) ||
          (headersProvided && !headers.length) ||
          headers.length > MAX_COLUMNS
        )
          throw publicError(
            "Template profile and source headings are invalid.",
          );
        const allowedCodes = new Set(IMPORT_FIELDS.map((field) => field.code));
        const headerSet = new Set(headers);
        const allowedTransforms = new Set([
          "trim",
          "uppercase",
          "lowercase",
          "digits_only",
          "normalize_identifier",
        ]);
        for (const [code, header] of Object.entries(mapping)) {
          if (
            !allowedCodes.has(code) ||
            typeof header !== "string" ||
            !headerSet.has(header)
          )
            throw publicError(
              "The template contains an unsupported field or source heading.",
            );
        }
        for (const [code, values] of Object.entries(transforms)) {
          if (
            !allowedCodes.has(code) ||
            !Array.isArray(values) ||
            values.some((value) => !allowedTransforms.has(value))
          )
            throw publicError(
              "The template contains an unsupported transformation.",
            );
        }
        const signature = headers.length
          ? crypto
              .createHash("sha256")
              .update(headers.map(normalizeHeader).sort().join("|"))
              .digest("hex")
          : existing.header_signature;
        await connection.query(
          `UPDATE scms_import_mapping_templates SET name = ?, description = ?, import_profile = ?, header_signature = ?,
             mapping_json = ?, transforms_json = ?, is_active = ?, archived_at = ?, updated_by = ?, row_version = row_version + 1
           WHERE id = ?`,
          [
            name,
            description || null,
            profile,
            signature,
            JSON.stringify(mapping),
            JSON.stringify(transforms),
            isActive,
            isActive ? null : new Date(),
            req.staff.id,
            existing.id,
          ],
        );
        await appendImportAudit(
          connection,
          req,
          "import.mapping_template.updated",
          "import_mapping_template",
          existing.id,
          {
            previous: {
              name: existing.name,
              isActive: Boolean(existing.is_active),
            },
            next: { name, isActive, profile },
          },
        );
      });
      const [[updated]] = await pool.query(
        "SELECT * FROM scms_import_mapping_templates WHERE id = ?",
        [Number(req.params.id)],
      );
      res.json({
        ...updated,
        id: Number(updated.id),
        row_version: Number(updated.row_version),
        is_active: Boolean(updated.is_active),
        mapping_json: parseJson(updated.mapping_json, {}),
        transforms_json: parseJson(updated.transforms_json, {}),
      });
    } catch (error) {
      next(error);
    }
  });
}
