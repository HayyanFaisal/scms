# SCMS Developer and Application Guide

> Version: 2.1 implementation baseline
>
> Last updated: 25 September 2026
>
> Canonical product context: [`LLM_GUIDEv2.md`](./LLM_GUIDEv2.md)

## 1. What this guide is

This is the instruction booklet for the SCMS web application. It explains the intended application behavior in ordinary language and then explains the technical design developers should use to deliver it.

The repository is currently a prototype undergoing its security and configuration migration. Screens and APIs for basic records exist. Migration-backed staff authentication/RBAC, Director-facing account/role management, initial SQL-enforced authority scopes, the Phase 1 configuration registry, provisional identity foundation, parent field policies/account review, and the Phase 2 document/form foundation are implemented. Complete legacy-route scoping, the full staged importer/conflict workspace, remaining document operations, durable notifications, and operational packaging still require implementation. Items marked **Current** exist in some form now. Items marked **Target** describe the required production behavior.

## 2. Product overview

SCMS supports PNBA staff, administrative authorities, and parents/guardians. Its job is to maintain reliable parent and child records, collect configurable evidence, route applications for review, apply approved category rates, exchange banking evidence, and retain a complete history.

The production system is expected to run on an internal air-gapped network. Users must be able to configure normal organizational changes through the application because they will not have access to source code.

There is no live personnel-directory feed. Authorized spreadsheet imports and manual maintenance are the supported sources for parent, child, and organizational data in this iteration.

### In scope for this iteration

- Staff and parent accounts.
- Director-managed roles, permissions, and record scopes.
- Authorities, schools, ranks, units, categories, rates, and other master data.
- Parent and child records, including provisional records created by import.
- Parent account requests, record claims, approvals, corrections, retryable rejection, and blocking.
- Parent-selected A/B/C category with staff approval.
- Configurable uploaded documents and structured digital forms.
- Flexible Excel/CSV imports with mapping, progress, logs, and conflict resolution.
- Authority-scoped access to permitted employee demographic data and configured related modules.
- Banking screenshots/evidence and an internal message trail.
- Internal notifications, reporting, and immutable audit history.
- Air-gapped deployment, backup, and operational configuration.

### Out of scope for this iteration

- Medical assessment, scheduling, clinical diagnosis, or medical-board workflow.
- Public messaging services, live bank APIs, NADRA integration, and mobile apps.

A medical certificate can still be requested as an ordinary configurable document.

## 3. Application areas

The target user experience can be served as separate frontend bundles, but it is one secured system.

| Area | Intended users | Main purpose |
|---|---|---|
| Staff portal | Director, Admin, Support, and custom staff roles | Registry, review, settings, imports, operations, reports, and audit. |
| Authority workspace | Named accounts scoped to one or more authorities | Access permitted employee/child records and perform permitted tasks. |
| Parent portal | Parent/guardian accounts | Complete profile, manage children, submit applications, upload evidence, complete forms, and respond to corrections. |
| Operations/settings | Director and specifically delegated roles | Configure users, roles, master data, rates, document/form requirements, security, imports, and system behavior. |

### Current prototype URLs

| Component | Development address |
|---|---|
| Main staff portal | `http://localhost:5173` |
| Authority page | `http://localhost:5173/authority.html` |
| Main API | `http://localhost:3001` |
| Parent portal | `http://localhost:5174` |
| Parent API | `http://localhost:4000` |

These are local development addresses only. The target deployment should use internal DNS and a same-origin reverse proxy instead of exposing development servers.

## 4. Roles, permissions, and scopes

### The simple explanation

A role is a named collection of permissions. A permission controls an action, such as reading parents or approving an application. A scope limits the records on which that permission works, such as only employees of HQ COMKAR.

For example:

```text
Role: Authority Reviewer
Permission: parents.read, applications.read, applications.review
Scope: Authority = HQ COMKAR
Document policy: birth certificate allowed; banking evidence denied
Result: this user can review COMKAR cases but cannot see another authority or banking files.
```

Hiding a screen is helpful for usability but is not security. Every API request must repeat the permission and scope decision on the server.

### Built-in roles

#### Director

The Director is the protected system owner role. It has full access and can:

- Create, edit, deactivate, and assign staff accounts.
- Create custom roles and choose their permissions.
- Configure scopes globally, by authority, role, or account.
- Manage rates, master data, form/document definitions, and security settings.
- View audit records and sensitive reports.
- Delegate individual permissions without giving away the Director role.

At least one active Director must always remain. The system must refuse any change that would deactivate the last Director or remove their ability to recover administration.

#### Admin

The Admin is the default operational manager. By default an Admin can maintain records, review and approve applications, manage evidence, operate imports, and manage organizational master data. High-risk platform powers such as changing role permissions, security policy, or rates remain Director-only unless explicitly delegated.

#### Support

Support helps users without receiving broad sensitive or financial access. The default Support role can search permitted records, correct ordinary contact/demographic fields, view request status, unlock an account, and issue an audited one-time password after identity verification. It cannot approve applications, change rates, view banking evidence, or manage RBAC by default.

`authority_accounts.reset_password` is a separate high-risk permission. It belongs only to Director by default but may be granted to a carefully controlled custom role. It permits an administrative authority-credential reset without knowing the previous password. It does not permit changing role rules or general security settings.

#### Custom roles

The Director can create roles such as Staff, Finance, Auditor, Import Operator, Document Reviewer, or Authority Reviewer. A custom role selects from the application permission catalogue and is assigned one or more data scopes.

Custom roles must never permit raw SQL, arbitrary scripts, or arbitrary endpoint names. Permission codes are created by developers, while the Director chooses among them.

### How an authorization decision works technically

For each request the API:

1. Authenticates the session.
2. Confirms the account is active and the session is valid.
3. Loads effective permissions from active role assignments.
4. Applies module and record scopes in the database query.
5. Applies field-level restrictions or masking.
6. Confirms the requested workflow transition is valid.
7. Performs the transaction and appends an audit event.

The safe default is deny. A narrow deny must override a broad allow. Exports, dashboard counts, search suggestions, and notifications must use the same scope rules as detail pages.

### Recommended role-management screens

**Settings > Users**

- Create a named staff account.
- Activate/deactivate or lock/unlock it.
- Assign roles and effective dates.
- Assign authority/module scopes.
- Review recent security events and active sessions.
- Reset credentials without displaying an existing password.

**Settings > Roles & Permissions**

- Create a role from a safe template.
- Select permissions grouped by module.
- Show a plain-language summary of resulting capabilities.
- Show affected user count before saving.
- Require reason and recent authentication for changes.
- Prevent editing the protected meaning of the Director role.

**Settings > Access Scopes**

- Choose all, selected authorities, assigned authority, no-authority records, assigned records, own record, or none.
- Configure module-specific scope and sensitive-field/document access.
- Preview “what this user can see” before applying.

## 5. Account and sign-in manual

### Staff/authority account creation

1. A Director or delegated account opens **Settings > Users**.
2. Enter a unique username, display name, and optional internal contact details.
3. Assign a role and scope.
4. Generate a one-time password or controlled activation code.
5. Give it to the user through an approved offline channel.
6. The user signs in and must set a permanent password.

Authority personnel use individual accounts; there is no shared authority password in the target system.

### Imported parent activation

An imported parent record is not automatically an active account.

1. Search the parent by CNIC or PN/O No.
2. Verify the record and PN/O No.
3. Select **Issue one-time password**.
4. Record the identity-verification method and reason.
5. The generated credential is shown once and expires after 24 hours.
6. On first login the parent can only create a permanent password and complete required profile fields.

If the import contains only CNIC and not PN/O No, PN-based login is impossible until an authorized process links a verified PN/O No.

### Parent self-registration/account claim

1. Parent enters PN/O No and requested identity details.
2. The server looks for an imported record using normalized PN/O No and CNIC.
3. If a safe match exists, create an account-claim request instead of a duplicate parent.
4. If no match exists, create a new-parent request.
5. An authorized reviewer approves, requests corrections, rejects with retry allowed, or blocks online resubmission and directs the parent to the office.
6. On approval, the parent activates the account and completes missing data.

Never reveal during public lookup whether a CNIC exists. Rate-limit attempts and audit the outcome.

### Password and session rules

- Store password hashes only.
- Force a password change after a one-time password.
- One-time passwords expire after 24 hours and after first use.
- Lock after 5 failed attempts according to configured policy.
- Default inactivity timeout is 10 minutes.
- Deactivation, reset, or high-risk assignment change revokes active sessions.
- Do not place passwords or session tokens in application logs.

## 6. Parent and child registry manual

### Searching and identifying a parent

Use normalized CNIC as the preferred person-matching identifier and PN/O No as the login/service identifier. A phone number is contact data only. Name, rank, unit, or address can suggest a match but cannot authorize an automatic merge.

Search results should mask sensitive fields unless the user has permission. If multiple possible matches exist, route them to a merge/review workspace rather than silently choosing one.

### Creating a parent manually

An authorized user enters the known identifiers and demographics. The system checks for exact CNIC/PN matches and warns about strong conflicts. When data is incomplete, save a provisional record with clear missing-field indicators instead of inventing placeholder values.

### Parent-editable data

Default direct updates:

- Phone number.
- Email.
- Correspondence address.
- House/quarter information.

Default approval-required changes:

- Rank/rate.
- Unit.
- Authority.
- Service status.
- Legal name.
- School or other access/benefit-affecting data.

Staff-controlled identity fields:

- PN/O No.
- CNIC.
- Account ownership/linking.
- Record merge and blocked/closed state.

The Director can configure a field as directly editable, approval required, read-only, hidden, or mandatory. Every accepted change preserves its previous value and effective dates.

### Parent with no authority

Authority is nullable. “No authority” is a real scope, not the text `N/A`. An authorized role can be granted access specifically to these records. Assigning or transferring the parent later creates a history row; it does not erase the earlier state.

### Adding a child

The child belongs to a parent-child relationship, not simply a text PN value. Capture B-Form/CNIC when available and check it for exact duplication. If unavailable, use an internal child ID and flag identity completion.

The parent or authorized staff may add the child, select the claimed category, complete required fields/forms, and attach configured evidence. The submission becomes an application version when sent for review.

## 7. Application and approval manual

### States

| State | Meaning |
|---|---|
| Draft | Parent/staff is still preparing it. |
| Submitted | Applicant has declared it ready. |
| Under Review | A reviewer has taken or been assigned the work. |
| Changes Required | Reviewer identified correctable missing/invalid information. |
| Resubmitted | Applicant supplied a new version for review. |
| Approved | Authorized decision completed successfully. |
| Rejected - Retry Allowed | Request declined, but a future corrected/new request is permitted. |
| Blocked - Office Contact | Online requests are disabled until authorized staff resolve the issue. |
| Closed | Previously active matter is no longer active. |

### Reviewing a submission

1. Open **Applications > Review Queue**.
2. Claim/assign the item if assignment is enabled.
3. Review the exact submitted version, not live mutable profile fields alone.
4. Check required structured forms and documents.
5. Compare claimed and proposed approved category.
6. Add internal notes where permitted.
7. Choose approve, changes required, retryable rejection, or blocking rejection.
8. Enter a reason and parent-facing message.
9. Confirm the decision. The server validates permission/state and records it atomically.

A Support user can assist and draft notes but cannot approve by default. Blocking requires a dedicated high-risk permission. A blocked parent sees a clear office-contact instruction and cannot bypass it by starting another online request.

### Category and rate behavior

The parent chooses A, B, or C. Keep that `claimed category` even if staff approve a different one. The approved category controls benefits.

Default monthly rates are:

| Category | Rate |
|---|---:|
| A | PKR 25,000 |
| B | PKR 20,000 |
| C | PKR 15,000 |

Only Director or a role with `rates.manage` can publish a new effective-dated schedule. Historical grants/payments retain the old rate snapshot. The Director must confirm the initial schedule before live payments begin.

## 8. Document and digital-form manual

### Configuring a document requirement

Open **Settings > Documents** and define:

- Name and parent-facing instructions.
- Whether it belongs to a parent, child, application, banking item, gadget, or school record.
- Required/optional and conditional applicability.
- File types, maximum size/count, and expiry behavior.
- Which roles may view, verify, reject, or download it.
- Whether upload, digital form, or either satisfies the requirement.
- Effective dates and display order.

Examples include birth certificate, B-Form/CNIC, application letter, or medical certificate. Requirements can change over time without invalidating completed historical submissions.

### Upload behavior

Uploads are saved outside the public web root with a random storage key. The system verifies size, signature, and allowed MIME type and computes a checksum. Each file is attached to the exact parent/child/application and document definition version.

Users can preview supported images and PDFs through an authorized endpoint. Replacing a document creates a new version; the old version remains available to authorized audit/review users according to retention policy.

### Creating a structured digital form

Open **Settings > Form Templates**.

1. Create a draft template and choose its business scope.
2. Add sections and instructions.
3. Add safe field types: text, long text, number, date, checkbox, choice, lookup, repeating group, or file.
4. Configure required rules, validation, options, and simple visibility conditions.
5. Preview as parent and reviewer.
6. Publish a version after validation.
7. Set applicability/effective dates.

Do not paste executable JavaScript, SQL, or arbitrary HTML into a template. Editing a published template creates a new draft version; existing submissions remain tied to the version they used.

Templates should support JSON export/import for exact transfer between installations and a controlled spreadsheet import for bulk field definitions. Arbitrary PDF-to-form conversion is not promised.

### Recommended record tabs

- **Overview**: identity, application state, completeness, category.
- **Digitized Forms**: structured submissions.
- **Uploads**: file evidence and versions.
- **Review**: checks, reviewer decision, and reasons.
- **Messages**: parent/staff correspondence.
- **Audit**: authorized event history.

### Current Phase 2 implementation

Migration `010_documents_and_forms.js` provides document types and immutable published versions, effective-dated requirements, record-owned versioned files, document review history, form templates and immutable schema versions, versioned form submissions, and record-scoped message threads. The active implementation is in `server/document-management.js` and is shared by the staff and parent workflows.

Files are written outside the web root using a random 256-bit storage key. Browser MIME declarations are not trusted: supported PDF/image signatures are detected from the content, the published MIME/size/count/expiry policy is enforced, and SHA-256 is stored. Downloads use authenticated endpoints that re-check ownership or staff authority scope. Replacement creates a new row and marks the former current file as superseded.

The staff Configuration page provides bounded document/form draft editing and immutable publication. Its guided form designer supports multiple sections, common safe fields, individually edited choice options, help text, and text-length validation. Versioned `.json` configuration packages (maximum 2 MB) support exact offline transfer between installations: imports are validated, reject duplicate stable codes, and are always inactive drafts. The parent child-registration workflow loads current requirements dynamically, renders published structured forms, uploads exact child-owned evidence, and exposes record-scoped message threads. A new child is stored with `draft` status during step 2 and changes to `pending` only through the final authenticated submission endpoint after required uploads are present. Successful uploads are committed immediately to the versioned store; unsubmitted form input is not persisted. Parents can reopen a child from My Children to resume work. A submitted or verified form cannot be accidentally resubmitted unless staff first marks it changes-required. The staff request and evidence workspaces both read current dynamic requirements rather than legacy fixed document labels. The staff Documents & Forms queue verifies or returns the exact version, displays responses with configured labels, and lets authorized staff start conversations, send parent-visible replies, or add visually marked internal notes. Internal notes are filtered from parent responses.

Current follow-up work within Phase 2: lookup/repeating-group designer controls, school-owned record support, message attachments, retention jobs, malware-scanner adapter hooks, and migration of legacy `Parent_Document_Files` content into the versioned store.

## 9. Excel/CSV import manual

### Preparing an import

The source workbook can have unfamiliar or inconsistent headings. Do not require users to edit it first. It should contain at least a reliable identifier per entity. Child-only rows require parent CNIC and/or PN/O No.

### Import wizard

1. Open **Imports > New Import**.
2. Choose the entity/profile: parents, children with parents, or another supported type.
3. Upload `.xlsx`, `.xls`, or `.csv`.
4. Select sheet and header row.
5. Preview sample rows.
6. Map each source heading to a system field. Save the mapping as a reusable template when useful.
7. Add transforms such as date format, trimming, CNIC/PN normalization, authority alias, or fixed default.
8. Run **Validate/Dry Run**.
9. Review totals and row-level errors.
10. Start the import. The progress screen can be left and reopened.
11. Review conflicts after valid non-conflicting rows are committed.
12. Resolve each field with keep existing, use incoming, manual value, skip, or defer.
13. Download the final result report.

### Example heading mapping

| Source heading | Canonical field | Transform |
|---|---|---|
| `Svc No` | Parent PN/O No | Trim + uppercase |
| `NIC #` | Parent CNIC | Remove dashes/spaces |
| `Command` | Authority | Alias lookup |
| `Dependent Name` | Child name | Trim |
| `B Form` | Child B-Form/CNIC | Remove dashes/spaces |
| `Cat` | Claimed category | A/B/C lookup |

### Conflict handling

For an address conflict, the screen shows existing value, incoming value, source file/sheet/row, last update information, and the proposed action. The operator can keep existing, use incoming, enter a third value, skip, or defer. Bulk decisions are allowed only for the same field and conflict pattern and must show the affected count before confirmation.

Hard conflicts such as one CNIC matching one parent and the PN/O No matching another can never be auto-resolved. They need authorized manual review.

### Child without an existing parent

If the row supplies parent CNIC or PN/O No, create one provisional parent and link the child. Reuse that parent for later matching rows. Mark all missing required parent fields. Later:

- A parent with PN/O No can claim/sign in after activation and complete the profile.
- A CNIC-only parent must first have a verified PN/O No linked.
- Access-affecting completed fields go through approval by default.

### Technical import guarantees

- All rows are staged before production writes.
- Job and row states persist in MySQL.
- Re-running the same job does not create duplicates.
- Batch commits are transactional.
- Progress and logs come from the server, not a browser timer.
- Every decision records actor, reason, source, before, and after.
- Temporary source files follow a configured retention policy.
- Rollback is controlled and allowed only where later human changes have not made it unsafe.

## 10. Authority workspace manual

An authority user signs in with an individual account. The dashboard shows only records permitted by role and assigned scope.

Possible modules, each independently configurable:

- Employee/parent demographics.
- Child summary.
- Application status and review.
- Selected document types.
- Grants/payments.
- Gadgets.
- School information.
- Reports/export.

The Director may set a default policy for all authorities and override a specific authority. “Can view demographics” does not automatically mean “can view documents” or “can view banking.”

Transfers create authority-assignment history. The default after transfer is that the former authority loses access. If policy allows historical or transition access, the SQL scope must enforce dates and allowed modules.

## 11. Banking evidence manual

This iteration does not connect to a bank. It supports evidence exchange:

1. Parent enters configured account metadata or uploads the requested screenshot/document.
2. The server stores the item securely and creates a review task.
3. Authorized staff review and mark it pending, changes required, verified, rejected, or superseded.
4. Parent and staff can exchange messages and replacement evidence in the same thread.
5. Every view, download, upload, message, and decision is audited according to sensitivity policy.

Banking data is denied to Support and authority roles by default. Exports need an explicit sensitive-export permission and should mask values unless the use case requires full data.

## 12. Settings manual

The goal is to avoid code changes for predictable operational changes.

### Organization settings

Manage authorities, hierarchy, codes, aliases/old names, start/end dates, and active state. Manage schools, ranks, units, and service statuses similarly. Deactivate items in use instead of deleting them.

### Program settings

Manage categories, effective-dated rates, fiscal years, budgets, reason codes, workflow deadlines, and notification rules. Financial changes require a reason, recent authentication, and audit.

### Data collection settings

Manage document types, requirements, form templates, field-edit policies, allowed file types/sizes, and parent guidance.

### Access settings

Manage users, roles, permissions, scopes, per-authority policies, and session/security policy. The settings UI should include an effective-access preview.

### System settings

Manage internal display name/branding, local storage paths, job limits, retention values, report templates, backup status display, and disabled future integration adapters. Secrets are configured at deployment/host level and are never shown back in full.

### Configuration design rules

- Every item has a stable ID separate from display name.
- Renames preserve references and aliases.
- Changes are effective-dated/versioned when historical meaning matters.
- Invalid combinations are rejected before saving.
- Security bounds cannot be weakened beyond developer-defined safe limits.
- Every change has actor, time, reason, and before/after audit data.

### Current Phase 1 registry implementation

Migration `005_configurable_registry.js` provides `scms_reference_items`, `scms_reference_item_history`, and `scms_category_rate_schedules`. Supported registry types are `authority`, `school`, `rank`, `unit`, `service_status`, and `category`.

The staff API is implemented in `server/configuration.js`:

- `GET /api/config/reference-data` returns active choices for operational forms.
- `GET/POST/PATCH /api/config/master-data` reads and manages stable registry records.
- `GET /api/config/master-data/:itemId/history` returns immutable item history.
- `GET/POST /api/config/rates` reads schedules and publishes a future effective-dated rate.

Writes are permission-protected, CSRF-protected, transactional, and recorded in configuration history plus the central audit log. Operational parent/child writes validate configured choices server-side. The parent portal exposes only active, non-sensitive reference choices and applies the same server validation to signup and child creation.

Migration `006_parent_account_lifecycle.js` removes the predictable PN-derived parent password path. Parent one-time credentials are random, bcrypt-hashed, expire after 24 hours, force replacement, increment a credential version to invalidate older JWTs, and have a dedicated credential-event history. Staff issuance requires `accounts.issue_one_time_password`; the credential is returned once and is never logged or stored as plaintext.

Migration `007_category_decisions.js` separates `Parent_Selected_Category` from `Approved_Category`. Parent submissions populate only the claimed value; the review flow requires staff to select an approved configured category and records actor, reason, claimed value, and approved value in `scms_child_category_decisions`. The existing `Disability_Category`/`Category` columns are maintained as approved-category compatibility mirrors until the legacy schema is retired.

Migration `008_profile_lifecycle.js` adds normalized PN/CNIC identifiers, explicit identity conflicts, provisional/incomplete record markers, configurable parent-field policies, and versioned parent change requests. The provisional-record API can match or create a parent from PN and/or CNIC, attach a child, and records missing required fields without inventing placeholder demographics. The full spreadsheet staging, mapping, and conflict-resolution screens remain Phase 3 work.

Migration `009_review_states.js` expands review states and stores parent-facing responses. Parent profile fields are configured as `direct`, `approval`, or `locked`; required fields contribute to live completeness. Controlled edits enter staff review, while direct edits save transactionally. Staff can approve, request changes, reject further online processing, or block online access when granted the dedicated permission. A Director or delegated role can restore blocked/rejected access with a mandatory audited reason; both blocking and restoring revoke existing parent sessions. Resubmission, blocking, and restoration behavior have API-level live smoke coverage in addition to unit tests.

Phase 1 is complete at the application-foundation level. A CNIC-only provisional record still needs an authorized staff member or the future Phase 3 conflict workspace to attach a verified PN/O number before PN-based login. Stable surrogate parent IDs remain a target schema migration because legacy foreign keys still use PN/O number.

## 13. Notifications, reports, and audit

### Internal notifications

Use a durable database inbox for assignments, changes required, approvals, expiring items, import completion, and operational failures. Mark-read state is per user. Scope notifications exactly like the underlying record. Future SMS/email adapters consume an outbox but remain disabled in this air-gapped iteration.

### Reports and exports

Reports must apply role, scope, field masking, and time-zone rules. Supported export types should accurately match their buttons: CSV, real `.xlsx`, and generated PDF where required. Long reports run as background jobs and produce a protected, expiring download.

The requirements identify budget utilization, pending cases, payment history, active/inactive children, school fees, gadgets, and category statistics. Only expose reports for implemented modules.

### Audit viewer

Authorized users can filter by date, actor, action, module, entity, authority, and correlation ID. The UI cannot edit/delete audit events. Sensitive before/after fields are redacted or separately permissioned. Export itself is audited.

## 14. Technical architecture

### Current architecture

```text
src/                              React 19 + TypeScript main/authority UI
server/index.js                   Express 5 main API
server/database.js                MySQL access/startup schema changes
parent-portal/client/src/         React 18 parent UI
parent-portal/server.js           Express 4 parent API
MySQL database: pnba              Shared by both APIs
```

The current dual-API/shared-database/sync-bridge design causes duplicate behavior and inconsistent authorization. The target is one modular API with one transaction boundary. Frontends may remain separated for usability and deployment.

The current main API also includes `server/access-control.js` for Director-managed staff/roles/scopes and `server/data-scope.js` for deny-by-default authority predicates. These predicates currently protect parent, child, document, banking, grant, and gadget reads/writes plus the aggregate bootstrap feed. New parent-linked routes must use the same policy layer; do not add an unscoped parallel query.

The temporary legacy authority credential flow stores scrypt hashes, never returns credential material, and separates two operations: staff reset at `POST /api/auth/reset-authority-password`, and authenticated authority self-change at `POST /api/authority/change-password`. Reset credentials expire after 24 hours, require replacement, and increment a credential version that invalidates older authority JWTs. This is transitional; production authority users should become individual RBAC staff accounts.

### Target request flow

```text
Browser -> internal reverse proxy -> SCMS API -> module/service -> repository -> MySQL
                                      |               |
                                      |               +-> protected file store
                                      +-> audit/outbox/background job
```

Recommended layer responsibilities:

- **Route/controller**: parse request, invoke schema validation, pass authenticated context.
- **Authorization policy**: evaluate permission, scope, field, and workflow state.
- **Application service**: implement the use case and transaction boundary.
- **Repository/query**: apply scope predicates and use parameterized SQL.
- **Domain/configuration**: centralize statuses, transitions, and effective-dated rules.
- **Job worker**: imports, reports, checksums, and other long operations.
- **Audit/outbox**: append events in the same database transaction as the change.

### Suggested API shape

```text
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/change-password
POST   /api/v1/parents/:id/one-time-password
GET    /api/v1/parents?authorityId=&cursor=
POST   /api/v1/parents
PATCH  /api/v1/parents/:id
POST   /api/v1/parents/:id/change-requests
GET    /api/v1/children?parentId=&cursor=
POST   /api/v1/applications
POST   /api/v1/applications/:id/submit
POST   /api/v1/applications/:id/transitions
POST   /api/v1/documents
GET    /api/v1/documents/:id/content
POST   /api/v1/import-jobs
GET    /api/v1/import-jobs/:id
POST   /api/v1/import-jobs/:id/execute
POST   /api/v1/import-conflicts/:id/resolve
GET    /api/v1/settings/roles
PUT    /api/v1/settings/roles/:id
```

Names can change, but versioning, validation, pagination, authorization, stable errors, and transaction semantics are required.

### Error contract

Return an appropriate HTTP status and a stable body such as:

```json
{
  "error": {
    "code": "IMPORT_IDENTITY_CONFLICT",
    "message": "CNIC and PN/O No match different parent records.",
    "correlationId": "generated-server-side",
    "fieldErrors": []
  }
}
```

Never include SQL, stack traces, filesystem paths, tokens, or secrets in a production response.

## 15. Database guidance

MySQL is the approved database for this installation. Use versioned migration files; do not rely on runtime `CREATE TABLE`/`ALTER TABLE` as the long-term schema process.

### Key modeling rules

- Use immutable surrogate IDs for relationships.
- Keep normalized CNIC and PN/O No unique when known, with controlled aliases/history.
- Make nullable unknowns truly null; do not store `N/A` as data.
- Add created/updated timestamps, version, and actor where appropriate.
- Store time in UTC and display in the configured local time zone.
- Use `DECIMAL`, never floating point, for money.
- Add foreign keys and useful composite indexes for scope/status/date queries.
- Model history with effective dates or versions; do not overwrite historical meaning.
- Use an outbox/audit insert in the same transaction as important state changes.

### Migration rules

Each change includes:

1. Forward migration.
2. Backfill/verification strategy for legacy data.
3. Rollback or documented restore plan when reversal is unsafe.
4. Index/locking assessment for large tables.
5. Automated migration test from an empty database and supported previous version.

Never put a database password in an SQL or JavaScript migration file.

## 16. Security implementation guide

### Authentication/session

Prefer server sessions or short-lived tokens held in HttpOnly, Secure, SameSite cookies. Protect cookie writes against CSRF. Avoid placing authentication tokens in `localStorage` because any successful XSS can steal them.

### Authorization

Create one reusable policy layer. Route handlers declare the permission, repositories receive resolved scope predicates, and tests prove a denied user cannot access the endpoint by calling it directly.

### Sensitive data

- Encrypt backups and document storage.
- Consider application/field encryption for CNIC and bank values while preserving a keyed search hash for exact match.
- Mask sensitive list/search/report values.
- Redact request headers, tokens, passwords, CNICs, bank fields, and paths in logs.
- Never return `SELECT *` from a user-facing endpoint.

### File security

- Use allowlisted extensions and MIME signatures.
- Enforce configured limits before and during streaming.
- Generate random storage keys; retain safe original filename as metadata only.
- Store outside the frontend/public directories.
- Authorize each content request by its linked business record.
- Set safe response headers and force download for unsafe types.
- Add an offline malware-scanning hook if infrastructure provides one.

### Browser/network

- Restrict CORS to configured origins or use same-origin deployment.
- Use Content Security Policy without public origins.
- Bundle fonts/icons locally.
- Apply Helmet-equivalent headers at the reverse proxy/API.
- Disable source maps in release artifacts unless kept privately for support.

## 17. Local development setup

### Prerequisites

- Supported Node.js LTS release.
- npm compatible with the lockfiles.
- MySQL 8 running locally.
- PowerShell on the current Windows development workstation.

Do not copy real production data into development. Use synthetic fixtures.

### Current prototype commands

From repository root:

```powershell
npm install
npm run dev
```

This starts the current main API and Vite client through `scripts/dev.mjs`.

In a second terminal:

```powershell
Set-Location parent-portal
npm install
npm start
```

In a third terminal:

```powershell
Set-Location parent-portal/client
npm install
npm run dev
```

### Environment configuration

The current prototype uses root `.env`, `parent-portal/.env`, and client environment settings. Treat the committed examples in older documentation as unsafe placeholders. Target practice:

- Commit `.env.example` containing names and safe explanations only.
- Keep populated `.env` files out of Git.
- Generate long random secrets per environment.
- Use a least-privilege MySQL account rather than `root`.
- Configure host/port/origins/storage paths through validated environment/deployment config.
- Never expose server secrets via variables prefixed for Vite/browser use.

### Checks

```powershell
npm run build
npm run lint

Set-Location parent-portal/client
npm run build
```

The root production build now passes. Lint still reports legacy violations that must be repaired during Phase 0. Initial security unit tests exist, but the application does not yet have sufficient automated coverage; expanding it remains foundational work.

## 18. Testing strategy

### Unit tests

- Identifier normalization and validation.
- Permission composition, deny precedence, field policy, and scope construction.
- Workflow transition rules.
- Rate effective-date selection.
- Import mappings, transforms, matching, and conflict classification.
- Form-schema validation.

### API integration tests

- Login, timeout, lockout, reset, and session revocation.
- Every protected endpoint with allowed, denied, wrong-authority, and inactive account cases.
- Parent claim and provisional-parent linkage.
- Approval, correction, rejection, and blocking transitions.
- Document upload/download authorization across siblings and authorities.
- Import execute/retry/idempotency/conflict resolution.
- Rate history and payment duplicate prevention.
- Audit creation and redaction.

### Browser tests

- Director creates role and assigns a scoped user.
- Imported parent activates with an expiring one-time password.
- Parent completes missing data, adds child, chooses category, and submits evidence.
- Admin requests correction and parent resubmits.
- Authority user cannot search/export outside scope.
- Import mapping survives refresh and conflict resolution completes.
- Application operates with public internet disconnected.

### Quality gates

- Build, lint, unit tests, API integration tests, and critical browser smoke tests pass.
- Migrations work on empty and upgrade databases.
- Dependency/security scan is reviewed for the offline release.
- Authorization regression tests cover every route.
- Performance tests cover expected import size and concurrent usage.
- Automated coverage target follows the stakeholder requirement of more than 80%, with particular emphasis on security and financial rules rather than gaming a total percentage.

## 19. Air-gapped deployment and operations

### Release contents

An offline release bundle should contain:

- Versioned server and frontend production artifacts.
- Locked production dependencies or packaged runtime/container images approved for the network.
- Database migrations.
- Deployment templates with no secrets.
- Checksums and software bill of materials.
- Upgrade, rollback, backup, and restore instructions.
- Release notes and known limitations.

### Deployment layout

- Internal reverse proxy terminates TLS and serves built frontend assets.
- API runs as a managed service under a restricted OS account.
- MySQL runs under its own account and is not exposed beyond required hosts.
- Document storage is outside the web root with restricted permissions and redundancy appropriate to capacity.
- Background worker can be the same codebase in a separate process.
- Logs are local/centralized inside the network with retention and redaction.

### Backup and recovery

The stakeholder baseline requests nightly full backups, hourly incrementals, encrypted off-site/DR copies, and point-in-time recovery close to five minutes. Infrastructure capability must be confirmed. Operators must:

1. Monitor successful database and document backups.
2. Keep database and matching document/audit backups consistent.
3. Regularly restore into an isolated validation environment.
4. Record recovery time and data-loss results.
5. Protect backup keys and access separately from application accounts.

A green “backup completed” message is not proof until restore has been tested.

### Upgrade procedure

1. Announce/enter maintenance mode if migration requires it.
2. Verify recent restorable backup.
3. Verify artifact checksums/version.
4. Run preflight checks and migration dry run where supported.
5. Apply migrations and deploy services/assets.
6. Run health and role/scope smoke tests.
7. Exit maintenance mode and monitor jobs/errors.
8. Roll back using the documented version-specific procedure if acceptance fails.

## 20. Troubleshooting guide

### Service will not start

- Check configured bind address/port and whether another process is listening.
- Confirm MySQL is running and the application account can connect.
- Check migration status before assuming the schema can be altered at runtime.
- Inspect redacted server logs using the correlation ID.
- Never print the whole environment to diagnose a configuration issue.

### User sees no records

- Confirm the account is active and session unexpired.
- Inspect effective role permissions.
- Inspect module scope and authority assignment/effective dates.
- Check field/document policy separately.
- Verify the record itself has the expected current authority.
- Use an authorized access-preview tool; do not bypass scope in SQL.

### Import is stuck

- Reload the job page; progress should be durable.
- Check job heartbeat/status and worker health.
- Review row error counts and current batch.
- Retry only through an idempotent job action.
- Do not directly mark rows complete in MySQL without a recovery procedure and audit entry.

### Parent cannot log in

- Confirm PN/O No exists and normalization matches.
- Check account/request state, active/blocked status, failed-attempt lock, and session revocation.
- Check one-time password expiry/use state.
- For CNIC-only provisional records, link a verified PN/O No before attempting PN login.
- Use an audited reset; never retrieve or reveal the existing password.

### Document will not preview

- Verify user permission, scope, and the document's exact linked record.
- Confirm file exists, checksum/metadata match, and MIME type is supported.
- Offer a protected download for unsupported preview types.
- Do not expose the filesystem path or temporarily publish the upload directory.

## 21. Developer change checklist

Before coding:

- Read `LLM_GUIDEv2.md`, this guide, relevant source, and current `git status`.
- State whether work changes current prototype behavior, target architecture, or both.
- Identify permission, scope, field sensitivity, workflow state, audit, and migration impact.

While coding:

- Validate at the server boundary.
- Apply scope in queries.
- Use parameterized SQL and transactions.
- Preserve history and unrelated worktree changes.
- Keep secrets and personal data out of logs/tests.
- Add denial and conflict tests, not only happy-path tests.

Before handoff:

- Run affected build, lint, tests, migrations, and smoke checks.
- Verify with an allowed and denied role/scope.
- Verify air-gap behavior if frontend assets/integrations changed.
- Update the relevant manual/settings help and migration notes.
- Report remaining limitations honestly; do not label target-only behavior as complete.

## 22. Current-to-target warning map

| Current prototype behavior | Required replacement |
|---|---|
| DB-backed RBAC UI, authority scopes, and parent field policies for core parent-linked modules | Extend the same policy to every legacy/admin route, then add effective-dated assignments, access preview, and full session operations. |
| Hardened but still shared password per legacy authority | Individual named accounts with authority scope. |
| Authenticated CRUD/bootstrap routes with permission checks and initial SQL scopes, but no pagination/versioning | Versioned, fully scoped, field-filtered, paginated APIs. |
| Browser localStorage as database/audit cache | Server database as source of truth and append-only audit. |
| Two APIs write the same tables and synchronize them | One modular transactional API. |
| PN/O No used directly as parent primary/foreign key | Stable parent ID plus identifier/alias tables. |
| Fixed four-document upload wizard | Configurable document requirements and structured forms. |
| Parent-level child-document lookup | Exact child/application/document association. |
| Local/generated notifications | Durable scoped notification inbox/outbox. |
| CSV presented as multiple export types | True CSV/XLSX/PDF generation as advertised. |
| Startup schema alterations/manual SQL | Versioned tested migrations. |
| Public font/icon requests | Locally bundled air-gap assets. |
| Source/config secrets and uploads tracked in Git | Clean history, rotated secrets, ignored runtime data. |

This table is a migration guide, not permission to keep parallel insecure paths. Retire old paths as secure equivalents become available.
