export function permissionForRequest({ path, method }) {
  const pathName = String(path || "").toLowerCase();
  const httpMethod = String(method || "GET").toUpperCase();
  const read = httpMethod === "GET" || httpMethod === "HEAD";

  if (pathName === "/audit-events/export.csv") return "audit.export";
  if (pathName.startsWith("/audit-events")) return "audit.read";

  if (pathName === "/config/reference-data") return "organizations.read";
  if (pathName.startsWith("/config/master-data"))
    return read ? "organizations.read" : "organizations.manage";
  if (pathName.startsWith("/config/rates"))
    return read ? "rates.read" : "rates.manage";
  if (pathName.startsWith("/config/parent-field-policies"))
    return read ? "settings.read" : "settings.manage";
  if (pathName.startsWith("/config/document-types"))
    return read ? "settings.read" : "settings.manage";
  if (pathName.startsWith("/config/form-templates"))
    return read ? "forms.read" : "forms.manage";
  if (pathName === "/imports/provisional-record") return "imports.execute";
  if (pathName === "/imports/settings")
    return read ? "settings.read" : "settings.manage";
  if (pathName === "/imports/maintenance/cleanup") return "settings.manage";
  if (pathName.startsWith("/imports/heading-aliases"))
    return read ? "settings.read" : "settings.manage";
  if (/^\/imports\/jobs\/[^/]+\/execute$/.test(pathName))
    return "imports.execute";
  if (/^\/imports\/jobs\/[^/]+\/rollback$/.test(pathName))
    return "imports.rollback";
  if (pathName.startsWith("/imports/conflicts")) return "imports.resolve";
  if (pathName.startsWith("/imports")) return "imports.create";

  if (pathName === "/access-control/catalog") return "roles.read";
  if (pathName === "/access-control/users" && read) return "users.read";
  if (
    /^\/access-control\/users\/[^/]+\/(reset-password|unlock)$/.test(pathName)
  )
    return "users.manage";
  if (pathName.startsWith("/access-control/users")) return "users.manage";
  if (pathName.startsWith("/access-control/roles"))
    return read ? "roles.read" : "roles.manage";
  if (pathName.startsWith("/access-control/scopes"))
    return "assignments.manage";

  if (pathName === "/bootstrap") return "dashboard.view";
  if (pathName === "/document-workspace") return "documents.read";
  if (pathName === "/document-review") return "documents.read";
  if (/^\/document-files\/[^/]+\/review$/.test(pathName))
    return "documents.verify";
  if (pathName.startsWith("/document-files"))
    return read ? "documents.read" : "documents.upload";
  if (pathName === "/form-review") return "forms.read";
  if (/^\/form-submissions\/[^/]+\/review$/.test(pathName))
    return "forms.review";
  if (pathName.startsWith("/form-submissions"))
    return read ? "forms.read" : "forms.submit";
  if (pathName.startsWith("/message-threads"))
    return read ? "messages.read" : "messages.send";
  if (
    pathName.includes("/scanned-documents") ||
    pathName.startsWith("/documents")
  ) {
    return read
      ? "documents.read"
      : httpMethod === "DELETE"
        ? "documents.delete"
        : "documents.upload";
  }
  if (pathName.startsWith("/parents"))
    return read
      ? "parents.read"
      : httpMethod === "POST"
        ? "parents.create"
        : httpMethod === "DELETE"
          ? "parents.archive"
          : "parents.update";
  if (pathName.startsWith("/banking"))
    return read ? "banking.read" : "banking.update";
  if (pathName.startsWith("/children"))
    return read
      ? "children.read"
      : httpMethod === "POST"
        ? "children.create"
        : httpMethod === "DELETE"
          ? "children.archive"
          : "children.update";
  if (pathName.startsWith("/grants"))
    return read ? "grants.read" : "grants.manage";
  if (pathName.startsWith("/gadgets"))
    return read ? "gadgets.read" : "gadgets.manage";
  if (pathName === "/seed-sample") return "settings.manage";
  if (
    pathName.startsWith("/admin/pending-approvals") ||
    pathName.startsWith("/admin/children")
  )
    return "applications.read";
  if (
    pathName.startsWith("/admin/approve-request") ||
    pathName.startsWith("/admin/update-child-status")
  )
    return "applications.approve";
  if (pathName.startsWith("/admin/parents-with-portal"))
    return "parents.create";
  if (pathName === "/admin/reset-parent-password")
    return "accounts.issue_one_time_password";
  if (/^\/admin\/parents\/[^/]+\/restore-access$/.test(pathName))
    return "applications.block";
  if (
    pathName.startsWith("/admin/child-documents") ||
    pathName.startsWith("/admin/document-view")
  )
    return "documents.read";
  if (pathName.startsWith("/admin/portal-health")) return "settings.read";
  if (pathName === "/auth/authorities") return "organizations.read";
  if (pathName === "/auth/reset-authority-password")
    return "authority_accounts.reset_password";
  return null;
}
