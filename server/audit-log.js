function publicError(message, status = 400, code = "AUDIT_ERROR") {
  const error = new Error(message);
  error.status = status;
  error.publicCode = code;
  return error;
}

function parseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function boundedText(value, maximum = 160) {
  return String(value || "")
    .trim()
    .slice(0, maximum);
}

function parseDate(value, endOfDay = false) {
  const text = boundedText(value, 40);
  if (!text) return null;
  const date = new Date(
    text.length === 10
      ? `${text}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
      : text,
  );
  if (Number.isNaN(date.getTime()))
    throw publicError("Choose a valid audit date range.");
  return date;
}

function buildFilters(query) {
  const clauses = [];
  const values = [];
  const action = boundedText(query.action, 120);
  const entityType = boundedText(query.entityType, 120);
  const outcome = boundedText(query.outcome, 40);
  const search = boundedText(query.search, 120);
  const from = parseDate(query.from);
  const to = parseDate(query.to, true);

  if (action) {
    clauses.push("event.action = ?");
    values.push(action);
  }
  if (entityType) {
    clauses.push("event.entity_type = ?");
    values.push(entityType);
  }
  if (outcome) {
    clauses.push("event.outcome = ?");
    values.push(outcome);
  }
  if (from) {
    clauses.push("event.occurred_at >= ?");
    values.push(from);
  }
  if (to) {
    clauses.push("event.occurred_at <= ?");
    values.push(to);
  }
  if (from && to && from > to)
    throw publicError("The audit start date must be before the end date.");
  if (search) {
    const term = `%${search}%`;
    clauses.push(`(
      event.action LIKE ? OR event.entity_type LIKE ? OR event.entity_id LIKE ? OR
      event.reason LIKE ? OR event.correlation_id LIKE ? OR user.username LIKE ? OR user.display_name LIKE ?
    )`);
    values.push(term, term, term, term, term, term, term);
  }
  return {
    sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function formatRow(row) {
  return {
    ...row,
    id: Number(row.id),
    actor_user_id: row.actor_user_id ? Number(row.actor_user_id) : null,
    details: parseJson(row.details),
  };
}

function csvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function registerAuditLogRoutes(app, pool) {
  app.get("/api/audit-events", async (req, res, next) => {
    try {
      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(
        100,
        Math.max(10, Number.parseInt(req.query.pageSize, 10) || 50),
      );
      const offset = (page - 1) * pageSize;
      const filter = buildFilters(req.query);
      const [[count], [rows], [actions], [entityTypes]] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) AS total
           FROM scms_audit_events event
           LEFT JOIN scms_users user ON user.id = event.actor_user_id
           ${filter.sql}`,
          filter.values,
        ),
        pool.query(
          `SELECT event.*, user.username AS actor_username, user.display_name AS actor_display_name
           FROM scms_audit_events event
           LEFT JOIN scms_users user ON user.id = event.actor_user_id
           ${filter.sql}
           ORDER BY event.occurred_at DESC, event.id DESC
           LIMIT ? OFFSET ?`,
          [...filter.values, pageSize, offset],
        ),
        pool.query(
          "SELECT DISTINCT action FROM scms_audit_events ORDER BY action LIMIT 250",
        ),
        pool.query(
          "SELECT DISTINCT entity_type FROM scms_audit_events WHERE entity_type IS NOT NULL ORDER BY entity_type LIMIT 250",
        ),
      ]);
      const total = Number(count[0]?.total || 0);
      res.json({
        items: rows.map(formatRow),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
        facets: {
          actions: actions.map((row) => row.action),
          entityTypes: entityTypes.map((row) => row.entity_type),
          outcomes: ["success", "failure", "denied"],
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/audit-events/export.csv", async (req, res, next) => {
    try {
      const filter = buildFilters(req.query);
      const [rows] = await pool.query(
        `SELECT event.*, user.username AS actor_username, user.display_name AS actor_display_name
         FROM scms_audit_events event
         LEFT JOIN scms_users user ON user.id = event.actor_user_id
         ${filter.sql}
         ORDER BY event.occurred_at DESC, event.id DESC
         LIMIT 50000`,
        filter.values,
      );
      const headings = [
        "occurred_at",
        "actor",
        "action",
        "outcome",
        "entity_type",
        "entity_id",
        "reason",
        "ip_address",
        "correlation_id",
        "details",
      ];
      const lines = [headings.map(csvCell).join(",")];
      for (const row of rows) {
        lines.push(
          [
            row.occurred_at instanceof Date
              ? row.occurred_at.toISOString()
              : row.occurred_at,
            row.actor_display_name || row.actor_username || "System",
            row.action,
            row.outcome,
            row.entity_type,
            row.entity_id,
            row.reason,
            row.ip_address,
            row.correlation_id,
            row.details ? JSON.stringify(parseJson(row.details)) : "",
          ]
            .map(csvCell)
            .join(","),
        );
      }
      await pool.query(
        `INSERT INTO scms_audit_events
          (actor_user_id, action, entity_type, entity_id, outcome, ip_address, correlation_id, details)
         VALUES (?, 'audit.exported', 'audit_event', NULL, 'success', ?, UUID(), ?)`,
        [
          req.staff.id,
          String(req.ip || "").slice(0, 64) || null,
          JSON.stringify({ exportedRows: rows.length, filters: req.query }),
        ],
      );
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="scms-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      res.send(`\uFEFF${lines.join("\r\n")}`);
    } catch (error) {
      next(error);
    }
  });
}
