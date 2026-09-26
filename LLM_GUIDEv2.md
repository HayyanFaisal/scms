# SCMS / SCWMS Canonical LLM Guide v2

> Last reconciled: 25 September 2026
>
> Status: approved product direction plus an audited description of the current prototype
>
> Audience: AI coding agents, reviewers, architects, and developers
>
> Companion manual: [`Developer_Guide.md`](./Developer_Guide.md)

## 1. Purpose of this document

This is the canonical working context for the Special Children Welfare Management System (SCMS/SCWMS) for the Pakistan Navy Benevolent Association (PNBA). An agent should read this file before planning or changing the repository.

This guide deliberately separates:

- **Current**: behavior that exists in the repository now.
- **Target**: approved behavior that the production system must provide.
- **Deferred**: explicitly outside the current iteration.

Do not describe a target feature as implemented until code, migrations, authorization, tests, and user-facing behavior all exist.

### Source precedence

When sources conflict, use this order:

1. The user's latest explicit decision.
2. This guide.
3. `Developer_Guide.md`.
4. `SCWMS_Requirements.md` for stakeholder intent not superseded here.
5. The running code and database for current behavior.
6. `LLM_GUIDE.md`, `README.md`, and `CLAUDE.md` as historical implementation notes.

The requirements file is an OCR-derived and incomplete transcription. It contains missing sections, numbering gaps, duplicate requirement identifiers, and an inconsistent authority count. Treat it as stakeholder evidence, not a complete specification.

## 2. Product mission and confirmed boundaries

SCMS is an air-gapped, browser-based welfare administration platform. It manages parent/guardian and child records, applications, configurable evidence, approvals, category-based rates, banking evidence, authority-scoped access, imports, reporting, and audit history.

### Confirmed decisions

1. The current iteration has three built-in staff roles: **Director**, **Admin**, and **Support**.
2. The Director has full system control, can create custom roles, change role permissions, assign accounts to roles, and configure data access.
3. Permissions are selected from a fixed application permission catalogue. A role never contains arbitrary code, SQL, or expressions.
4. Parents select a support category. The selection is a claim until approved through the configured review flow.
5. Default monthly rates are Category A = PKR 25,000, B = PKR 20,000, and C = PKR 15,000.
6. A Director, or a custom role granted `rates.manage`, may change rates. Rates are effective-dated and historical payments must not change retroactively.
7. Authority users may access demographic and other permitted employee data only within their configured scope. The Director may configure access globally, per authority, per role, and where necessary per account.
8. MySQL is the database for this deployment.
9. The deployment is internal and air-gapped. Production must have no runtime dependency on the public internet.
10. Stakeholders will not receive source-code access. Every expected operational change must therefore be exposed through an authorized settings screen or supported deployment procedure.
11. Parents may belong to an authority or have no authority. Authority, rank, unit, address, and similar attributes can change over time.
12. Parent CNIC is the preferred person-matching key. PN/O No is also a strong identifier and the parent login identifier. Contact number is never an identity key.
13. Excel/CSV imports may contain parents, children, or related data in any combination. A child row can create a provisional parent from supplied parent CNIC and/or PN/O No.
14. A parent imported by staff can activate/claim the account using a one-time password. The one-time password expires after 24 hours and forces a permanent password change.
15. The full medical assessment, medical-board, diagnosis, and scheduling workflow is **deferred**. A medical certificate may still exist as a configurable document requirement; storing a document is not a medical workflow.
16. External SMS/email messaging and live bank integration are deferred. The system needs an internal notification inbox and extension points, but no internet service is required now.
17. There is no personnel-directory integration available. Spreadsheet imports and authorized manual maintenance are the current sources for organizational/personnel data.

### Explicitly deferred for this iteration

- Medical assessment scheduling, assessor workflows, clinical records, or diagnosis processing.
- NADRA verification integration.
- SMS, email, or public push-notification gateways.
- Direct bank API integration.
- Mobile applications.
- Automatic, pixel-perfect conversion of arbitrary PDFs into editable forms.

School-fee and gadget workflows remain part of the broader product requirements, but should follow the phased priority in section 16 unless the stakeholder promotes them.

## 3. Terminology

| Term | Meaning |
|---|---|
| Parent | Parent, guardian, or naval beneficiary responsible for one or more children. |
| PN/O No | Service/personnel number. Current database column: `P_No_O_No`. It is the intended parent login name. |
| CNIC | Pakistani national identity number. Store a normalized 13-digit value; format for display only. |
| Child identity | B-Form/CNIC when available; otherwise a provisional system child ID plus deduplication attributes. |
| Authority | Administrative formation or organization responsible for scoped employee records. |
| Category | Parent-selected support category A, B, or C, subject to approval. It is not a clinical diagnosis. |
| Case/application | A versioned submission containing parent/child data and required evidence for review. |
| Document type | A configurable definition such as birth certificate, B-Form, or medical certificate. |
| Form template | A configurable structured digital form used instead of, or alongside, a file upload. |
| Provisional parent | A minimal parent record created by import because a child exists but complete parent data does not. |
| Data scope | The records a user may act on, separate from what actions their role permits. |

## 4. Current repository truth

The repository currently contains two frontends and two Express APIs sharing a MySQL database named `pnba`.

```text
Root Vite React/TypeScript app (:5173)
  - Admin-style portal
  - Authority entry point at /authority.html
  - Main Express API (:3001)
             |
             | shared MySQL database + partial HTTP sync bridge
             v
Parent portal
  - React/JavaScript client (:5174)
  - Express API (:4000)
```

### Important paths

| Path | Current responsibility |
|---|---|
| `src/` | Main admin and authority React application. |
| `src/services/database.ts` | Browser-side cache, prototype CRUD, hard-coded main users, and local audit/notification state. |
| `src/services/auth.ts` | Prototype client-side role checks. These are not a secure authorization boundary. |
| `server/index.js` | Main Express routes for core CRUD, approvals, uploads, and authority reads. |
| `server/database.js` | MySQL pool and startup-time schema alterations. |
| `parent-portal/client/src/` | Parent-facing React application. |
| `parent-portal/server.js` | Parent authentication, profile, child, upload, banking, and sync routes. |
| `SCWMS_Requirements.md` | OCR-derived stakeholder requirements. |
| `LLM_GUIDE.md` | Historical implementation guide; some claims are outdated or unsafe. |
| `README.md` | Historical local setup notes; not a production runbook. |

### Current capabilities

- CRUD screens for parents, children, document tracking, banking, grants, and gadgets.
- Migration-backed staff accounts, Director/Admin/Support roles, permission checks, HttpOnly sessions, CSRF protection, login lockout, and forced first-login password change.
- A Director-facing Access Control screen for named staff accounts, custom roles, permission selection, account activation, account unlocking, 24-hour temporary password resets, and reusable authority scopes.
- SQL-enforced, deny-by-default per-account scopes for parent, child, document, banking, grant, and gadget data. The dashboard/bootstrap feed and protected uploaded-document downloads apply the same authority boundary.
- Legacy shared-authority credentials, when explicitly enabled, are hashed. A staff override requires `authority_accounts.reset_password`, issues a 24-hour temporary password, forces self-service change, and revokes old authority JWTs through credential versioning.
- Parent signup and login with bcrypt/JWT in the parent API.
- Parent profile, child creation, file upload, banking entry, and status display.
- An approvals inbox with approve/reject behavior.
- Authority login and several authority-filtered read endpoints.
- Basic dashboard, CSV-style reporting, theme support, and UI component library.

### Current prototype limitations that must not be preserved as design

- Main staff authentication, route permissions, role management, and core parent-linked authority scopes now run on the API. Field-level masking, effective-dated scope history, access preview, and complete scoping of legacy approval/authority routes are not implemented yet.
- Some sensitive endpoints still use `SELECT *`; core parent-linked list queries are scoped, but every legacy/admin endpoint still needs a field and scope audit.
- The authority portal still uses a shared credential per authority and remains disabled by default. Credential storage/reset is hardened, but it must ultimately be replaced by individual named RBAC accounts.
- Browser `localStorage` is still treated as a cache for domain records and legacy audit/notification state.
- The main app optimistically saves locally and may hide an API failure.
- Main-API uploaded parent documents now require document permission and matching record scope; parent-portal storage and every legacy file route still require a full authorization/storage review.
- Parent and main APIs duplicate logic while also writing the same database.
- Current child documents are associated primarily through the parent number and can be mixed between siblings.
- Fixed four-document logic conflicts with the approved configurable-document model.
- The current admin and parent approval/sync routes have authentication and schema inconsistencies.
- The authority UI expects fields that its API does not return, and its settings view is not reliably reachable.
- Server-side RBAC/session tables, migration history, role/scoping administration, initial record-scope enforcement, the guided form designer, and the staged parent/child import engine now exist. Field masking, production backup/restore automation, and comprehensive end-to-end/load testing do not.
- The root production build is clean. Lint still has legacy violations. The parent client build succeeds, but that is not sufficient production validation.
- Tracked environment files, an uploaded file, and generated output must be removed from source control and any exposed secrets rotated before real deployment.
- The parent UI includes public Google font/icon references and therefore is not fully air-gap ready.

Do not add new features on top of these security assumptions. Establish the foundation in section 16 first.

## 5. Target architecture

Use a **modular monolith** unless deployment constraints later prove that independent services are necessary. A single API and single transactional database are simpler and safer for this installation than two APIs writing the same tables.

```text
Admin / Director / Support UI ----+
Authority-scoped UI --------------+--> SCMS API --> MySQL
Parent portal UI -----------------+       |          |
                                          |          +--> immutable audit records
                                          +--> protected document storage (local/NAS)
                                          +--> background job queue
                                          +--> internal notification outbox
```

Recommended server modules:

- Identity and authentication
- Roles, permissions, assignments, and data scopes
- Parents, children, aliases, and change history
- Organizations, authorities, schools, ranks, and units
- Applications, review tasks, notes, and decisions
- Categories and effective-dated rates
- Document definitions, files, structured forms, and verification
- Imports, staging, mapping templates, conflicts, and job logs
- Banking evidence and message threads
- Grants/payments, school support, gadgets, and reports
- Settings, notifications, audit, backup/health, and operations

The frontend may remain separate bundles for staff/authority and parents, but both must call the same protected API contract. No business authorization may depend on a hidden button or client-side route.

## 6. Identity and authentication target

### Staff and authority users

- Each person has an individual account. Do not use a shared password per authority.
- Passwords are hashed with a modern adaptive hash.
- Login, logout, failed login, password changes, resets, account lock/unlock, and role changes are audited.
- Lock an account after 5 consecutive failed attempts according to a configurable lock duration or manual unlock policy.
- End an inactive session after 10 minutes by default; make the duration configurable by the Director within a safe range.
- Revoking/deactivating an account or changing security-sensitive assignments invalidates active sessions.
- High-risk actions such as role changes, data exports, permanent rejection, and rate changes require recent authentication/step-up confirmation.

### Parent users and imported records

- Primary login name: PN/O No.
- Preferred deduplication/person match: normalized parent CNIC.
- Secondary match: normalized PN/O No and its historical aliases.
- Contact number may help notify or verify but must not identify a person.
- A parent without a PN/O No cannot log in with PN/O No. The record remains provisional until staff adds the number or an approved account-claim process links it.
- Never silently merge two records based on name, phone, or fuzzy matching. Present potential matches to an authorized reviewer.

### One-time password flow

1. An authorized user invokes `accounts.issue_one_time_password` for an imported/approved parent.
2. The server generates a cryptographically random, single-use password, stores only its hash, and records a 24-hour expiry.
3. The plaintext is displayed once for controlled print/manual delivery. It must not be written to application logs.
4. Login with that password creates a restricted password-change session, not a normal full session.
5. The parent sets a new password meeting policy; all outstanding one-time credentials are invalidated.
6. Expired, used, or administratively revoked credentials cannot be reused.

For a parent who forgot a permanent password in the air-gapped environment, an authorized Support/Admin/Director user can perform an audited reset using the same one-time flow after identity verification.

## 7. RBAC and data-scope model

Authorization is always evaluated server-side:

```text
allow = authenticated
    AND account_is_active
    AND permission_granted_by_role
    AND record_within_data_scope
    AND field/action policy permits operation
    AND workflow state permits transition
```

The UI may use the same authorization result to hide or disable controls, but the API is authoritative.

### Protected built-in roles

| Capability | Director | Admin | Support |
|---|---:|---:|---:|
| Use operational dashboard | Yes | Yes | Yes |
| View parents/children in scope | Yes | Yes | Yes |
| Edit ordinary demographic/contact fields | Yes | Yes | Yes |
| Review applications and request corrections | Yes | Yes | View/assist by default |
| Approve/reject applications | Yes | Yes | No by default |
| Permanently block further requests | Yes | Configurable, default No | No |
| View/verify configured documents | Yes | Yes | Metadata only by default |
| View/manage banking evidence | Yes | Yes | No by default |
| Run imports and resolve conflicts | Yes | Yes | No by default |
| Manage authorities, schools, ranks, units | Yes | Yes | No by default |
| Issue/reset parent one-time password | Yes | Yes | Yes |
| Manage category rates | Yes | No by default | No |
| Manage staff accounts | Yes | Limited by delegated permission | No |
| Create roles/change permissions | Yes | No | No |
| Manage system/security settings | Yes | No | No |
| Read audit log | Yes | Limited operational view | No by default |

These are initial defaults. The Director can create roles such as Finance, Staff, Auditor, Import Operator, or Authority Reviewer and assign permissions. The system must protect the last active Director from deletion, deactivation, or loss of the permissions required to restore administration.

### Permission catalogue

Use stable machine codes, grouped by module. At minimum:

```text
dashboard.view
parents.read | parents.create | parents.update | parents.archive | parents.merge
parents.sensitive.read | parents.identity.update
children.read | children.create | children.update | children.archive
applications.read | applications.create | applications.submit
applications.review | applications.approve | applications.reject
applications.block | applications.reopen
documents.read | documents.upload | documents.verify | documents.download
document_types.manage | form_templates.manage | form_templates.publish
banking.read | banking.update | banking.verify | banking_evidence.manage
categories.read | categories.assign | rates.read | rates.manage
imports.create | imports.execute | imports.resolve | imports.rollback
organizations.read | organizations.manage
schools.read | schools.manage
grants.read | grants.manage | payments.manage | payments.export
gadgets.read | gadgets.manage
reports.read | reports.export_sensitive
users.read | users.create | users.update | users.deactivate
roles.read | roles.manage | assignments.manage | scopes.manage
accounts.issue_one_time_password | accounts.unlock
audit.read | audit.export
settings.read | settings.manage | security_settings.manage
```

Avoid permissions named only `admin` or `full_access`; they are hard to audit and delegate.

### Data scopes

A permission answers **what** a user may do. A scope answers **to which records**. Supported scope types should include:

- Own record (parents only).
- Assigned authority.
- One or more selected authorities.
- All authorities.
- Records with no authority.
- Explicitly assigned cases/records.
- No access.

Scopes can apply by module. A user may see demographics for an authority but not banking evidence or documents. Per-authority policy can further control which document types and fields are visible. Deny wins over allow. More specific restrictions should win over broad grants.

Sensitive fields such as CNIC, bank numbers, addresses, and documents require field-level policies and masking. List screens should show only the minimum useful subset.

## 8. Configurable master data and history

The following must be managed in authorized settings, not hard-coded:

- Authorities and organizational hierarchy.
- Schools and institutions.
- Ranks/rates, units, and service statuses.
- Categories and effective-dated rates.
- Document types and requirements.
- Structured form templates.
- Rejection/correction reasons.
- Workflow deadlines and notification rules.
- Fiscal years and approved budget values.
- Report templates and export policies.
- Security settings within safe ranges.
- Import mapping templates and aliases.

Every configurable entity needs a stable immutable ID, display name, optional code, aliases/previous names, active dates, active/inactive state, sort order, and audit metadata. Renaming an authority or school must not rewrite historical facts or break foreign keys. Deactivate rather than hard-delete an item already in use.

Parent facts that change over time, especially authority, rank, unit, service status, and address, need effective-dated history. Current values can be cached for search, but history is the record of truth.

### Parent update policy

Default policy:

- Parent may directly update phone, email, correspondence address, and house/quarter information.
- Parent may propose changes to rank, unit, authority, service status, school, legal name, and other access-affecting facts. Those changes require approval.
- PN/O No, CNIC, record ownership, merges, and blocked status are staff-controlled.
- The Director may configure the policy per field, choosing direct update, approval required, read-only, hidden, or required.

## 9. Parent, child, and application lifecycle

### Parent account/request states

Use explicit status values rather than overloading one `approved` flag:

```text
Provisional -> Claim Pending -> Active
New Request -> Under Review -> Changes Required -> Resubmitted -> Approved/Active
                                  |                    |
                                  +-> Rejected (retry allowed)
                                  +-> Blocked (office contact required)
Active -> Suspended -> Active, or Closed
```

### Application states

```text
Draft -> Submitted -> Under Review -> Changes Required -> Resubmitted
                              |                         |
                              +-> Approved              +-> Approved
                              +-> Rejected (retry allowed)
                              +-> Blocked (no further online request)
Approved -> Closed when the benefit/case is no longer active
```

Every transition records actor, time, previous/new state, reason, comments, and application version. “Rejected” must state whether resubmission is allowed. “Blocked” requires an explicit permission and tells the parent to contact the office.

### Parent-selected category

Store the parent choice separately from the approved category:

- `claimed_category_id`: selected by the parent.
- `approved_category_id`: decision used for entitlements.
- decision actor/time/reason.
- rate version/effective date used by each grant or payment line.

This preserves what was requested and what was authorized. No medical assessment module is implied.

## 10. Import and provisional-record design

The importer is a first-class workflow, not a direct spreadsheet-to-table insert.

### Supported input

- `.xlsx`, `.xls`, and `.csv` for structured tabular data.
- Multiple sheets; the user selects the sheet and header row.
- Parent-only, child-only, and mixed datasets.
- Later extension to authorities, schools, grants, and other modules through separate import profiles.

Do not treat PDF as a general tabular import format. A PDF can be stored as evidence, while structured data requires mapping or manual entry.

### Import stages

1. Upload file to protected temporary storage.
2. Select sheet and header row; preview raw data.
3. Choose an entity/import profile.
4. Map arbitrary source columns to canonical fields.
5. Apply explicit transforms: trim, normalize CNIC/PN, parse date, map aliases/enums, split/merge columns.
6. Validate all rows in staging without mutating production tables.
7. Show counts for valid, warning, duplicate, conflict, and invalid rows.
8. Execute valid, non-conflicting rows in batches.
9. Present conflicts after or alongside successful rows without losing their staging data.
10. Resolve each conflict with keep existing, use incoming, enter a manual value, skip row, or defer.
11. Produce a durable log and downloadable result report.

Imports must be resumable and idempotent. Each row needs a fingerprint, source file/sheet/row number, status, created/updated record IDs, and before/after values. Progress is based on server-side job state and survives a browser refresh.

### Identity matching rules

Normalize before comparing:

- CNIC/B-Form: remove spaces/dashes and validate 13 digits.
- PN/O No: trim, uppercase, normalize permitted punctuation, and check historical aliases.
- Blank strings become null.

Suggested match outcome priority:

1. Exact parent CNIC and exact PN/O No identify the same record: update candidate.
2. Exact CNIC only: probable same parent; link/update subject to field-conflict policy.
3. Exact PN/O No only: probable same parent; conflict if CNIC differs.
4. CNIC and PN/O No point to different records: hard conflict; never auto-merge.
5. No strong identifier: invalid for automatic parent creation; defer for manual resolution.

### Child-only import

A child row must provide at least one usable parent identifier: parent CNIC and/or parent PN/O No.

- If a parent matches, link the child.
- If no parent matches, create a provisional parent with the supplied identifier(s), provenance, and `profile_completeness` markers.
- If the child has a B-Form/CNIC, use it as the strongest child deduplication key.
- If the child lacks one, generate a stable internal ID and flag the record for completion; do not treat name alone as unique.
- Later child rows matching the same normalized parent key must reuse the provisional parent.

When that parent later signs in with PN/O No, show a profile-completion wizard for missing required fields, then route access-affecting changes for approval. If only CNIC was imported and PN/O No is absent, staff or an approved claim flow must add/link the PN/O No before PN-based login is possible.

## 11. Configurable documents and structured forms

### Document type definition

An authorized administrator can define:

- Name, description, scope (parent/child/application/banking/gadget/school).
- Required/optional status and applicability conditions.
- Allowed file types, maximum size, count, and page expectations.
- Whether expiry date and re-upload are required.
- Verification roles and rejection reasons.
- Effective dates, display order, and parent guidance.
- Whether a file upload, structured form, or either is accepted.

Medical certificate is one possible configured type. It does not enable medical assessment features.

### Stored file metadata

Each file belongs to a specific business record and includes document type/version, original and stored name, MIME type verified server-side, byte size, checksum, storage key, uploader, upload time, review status, reviewer, and superseded version. Never store only a parent-level path for child-specific evidence.

Documents are served through an authorized download/preview endpoint. They must not be placed under a public static directory. PDF must be rendered/downloaded appropriately rather than placed in an image tag.

### Structured form designer

Use a schema-driven builder with a deliberately bounded feature set:

- Sections and instructions.
- Text, long text, number, date, checkbox, radio, select, lookup, and file fields.
- Repeating groups for controlled multi-row information.
- Required rules, length/range validation, and simple conditional visibility.
- Approved calculations using a safe expression model.
- Draft, published, retired, and versioned template states.
- JSON import/export and an optional structured Excel template import.

Do not allow arbitrary JavaScript, SQL, or raw HTML in a form definition. Published submissions retain the exact template version used even after a new version is published.

Suggested record workspace tabs: Overview, Digitized Forms, Uploads, Review, Messages, and Audit.

## 12. Authority access and organization changes

An authority is master data, not a hard-coded login value. Authority users are ordinary named staff accounts with role permissions plus authority scope.

Default behavior:

- See only current employees assigned to the user's authority.
- Access demographic data needed for work.
- Access documents, banking, grants, or other modules only when separately granted.
- No global search leakage: counts, autocomplete, exports, and notifications must use the same scope filter.

The Director can configure a policy for all authorities and override it for a specific authority. Store authority assignment history with start/end dates and change reason. Configure whether a former authority has no access, historical read-only access for its assignment period, or time-limited transition access. Default to no access after transfer unless the Director chooses otherwise.

## 13. Category rates and financial integrity

Initial rate schedule:

| Category | Monthly rate |
|---|---:|
| A | PKR 25,000 |
| B | PKR 20,000 |
| C | PKR 15,000 |

Rates require start date, optional end date, currency, creator/approver, reason, and audit entry. Editing a rate creates a new version; it never overwrites the rate used by a historical payment.

Before the first live payment, the Director must confirm the schedule in settings. Payment lines copy the applicable rate and category decision so reports remain reproducible.

Banking in this iteration is an evidence workflow, not integration: protected screenshots/files, structured account metadata where configured, a staff-parent message thread, versioning, verification status, and a full audit record. Authority access is denied unless explicitly granted.

## 14. Target data model

Names are recommendations; migrations may adapt the legacy schema. Prefer surrogate immutable IDs plus unique normalized business identifiers rather than using mutable PN/O No as every foreign key.

### Identity and access

- `users`, `user_credentials`, `sessions`, `one_time_credentials`
- `roles`, `permissions`, `role_permissions`, `user_roles`
- `scope_definitions`, `user_scopes`, `authority_policies`
- `login_events`, `security_events`

### People and organizations

- `parents`, `parent_identifiers`, `parent_contacts`, `parent_change_requests`
- `children`, `child_identifiers`, `parent_child_relationships`
- `organizations`, `organization_aliases`, `parent_organization_history`
- `ranks`, `units`, `schools`, plus alias/history tables where needed

### Workflow and configuration

- `applications`, `application_versions`, `application_transitions`, `review_tasks`, `case_notes`
- `categories`, `rate_schedules`, `rate_schedule_items`
- `settings`, `setting_versions`, `reason_codes`, `fiscal_years`

### Documents and forms

- `document_types`, `document_requirements`, `document_files`, `document_reviews`
- `form_templates`, `form_template_versions`, `form_submissions`, `form_submission_values`

### Imports

- `import_jobs`, `import_files`, `import_mappings`, `import_rows`, `import_conflicts`, `import_actions`

### Operations

- `banking_profiles`, `banking_evidence`, `message_threads`, `messages`
- `grants`, `payment_batches`, `payment_lines`, `payment_confirmations`
- future: `school_claims`, `gadgets`, `gadget_requests`, `vendors`, `quotes`, `issuances`
- `notifications`, `outbox_events`, `audit_events`, `background_jobs`

Required integrity rules include unique normalized CNIC when known, controlled PN/O No uniqueness/aliases, unique child B-Form/CNIC when known, foreign keys, optimistic concurrency/version columns, and unique payment per child/program/period.

## 15. API, audit, and security conventions

### API conventions

- Version APIs, for example `/api/v1/...`.
- Validate every request server-side with a shared schema.
- Return stable error codes plus a safe human-readable message and correlation ID.
- Paginate list endpoints and apply scope in the SQL query, not after reading all rows.
- Use database transactions for multi-table state changes.
- Use optimistic concurrency for editable records.
- Make job-starting endpoints return a job ID; expose status and logs separately.
- Never expose password hashes, secrets, internal paths, or unrestricted database rows.

### Audit

Audit records are append-only and server-generated. Capture actor/account, effective role/scope, action, entity type/ID, timestamp, source IP/workstation where meaningful, correlation ID, reason, and redacted before/after values. Audit login/logout/failure, data view of highly sensitive records, create/update/archive, import actions, document access, approval transitions, exports, rate/settings/RBAC changes, and password resets.

Application users cannot edit or delete audit entries. Database/host administrators still require operational access, so tamper evidence, restricted DB grants, backup controls, and periodic export/signing should supplement the UI restriction.

### Security and privacy baseline

- Secrets only in deployment secret/config stores, never Git or browser bundles.
- TLS on the internal network where infrastructure supports it.
- Encryption at rest for database backups and document storage; field-level encryption for especially sensitive values where practical.
- HttpOnly, Secure, SameSite session cookies are preferred over JWTs in `localStorage`.
- CSRF defense for cookie-authenticated writes, strict CORS, security headers, rate limiting, and file malware/content checks appropriate to the air-gapped environment.
- MIME sniffing and file-signature validation; random storage keys outside the web root.
- Least-privilege database and filesystem service accounts.
- Redact CNIC, account numbers, tokens, passwords, and document paths from logs.
- Backup and restore must be tested, not merely scheduled.

### Air-gap baseline

- Bundle fonts, icons, packages, help, and static assets locally.
- No CDN, analytics beacon, public OAuth, public map, remote font, or mandatory license check.
- Provide offline installers/artifact bundles, checksums, migration scripts, rollback instructions, and local dependency provenance/SBOM.
- Messaging adapters are disabled by default and must not retry against the internet.
- Expose internal health, job, and log export screens to authorized operators.

Frontend source cannot be made literally invisible: browsers must receive HTML, CSS, and JavaScript. Production builds should be minified and source maps withheld, but all secrets and enforcement must remain on the server. The server source and configuration stay outside the web root and are protected by host permissions.

## 16. Implementation order

### Phase 0 - production foundation

1. Choose the unified API/module boundary and formal migration tool.
2. Move staff/authority authentication and authorization to the server.
3. Implement users, protected Director role, permissions, role assignments, scopes, sessions, lockout, and audit.
4. Remove sensitive Git artifacts, rotate secrets, protect uploads, restrict CORS, and remove secret logging.
5. Replace whole-database bootstrap/localStorage authority with paginated APIs and server truth.
6. Make root build/lint clean; establish unit, API integration, authorization, migration, and browser smoke tests.
7. Remove internet runtime dependencies and create an offline deployment/configuration process.

### Phase 1 - configurable registry and account lifecycle

1. Stable organization/school/rank/unit master data and history.
2. Parent and child identifiers, provisional records, matching, and completeness states.
3. Self-registration/account claim, approval states, correction/rejection/blocking, and 24-hour one-time passwords.
4. Parent field-change policy and approval requests.
5. Parent-selected category plus approved category and effective-dated rates.

Current implementation status (2026-09-25): the Phase 1 application foundation is implemented. Migration `005_configurable_registry.js` and the Configuration UI cover authorities, schools, ranks/rates, units, service statuses, categories, and effective-dated rates. Migration `006_parent_account_lifecycle.js` provides audited random 24-hour one-time passwords, forced replacement, and JWT invalidation. Migration `007_category_decisions.js` separates parent-selected and staff-approved categories with decision history. Migration `008_profile_lifecycle.js` adds normalized PN/CNIC identities, conflict records, provisional/completeness states, configurable parent field policies, controlled change requests, and a provisional parent/child creation API. Migration `009_review_states.js` adds changes-required/rejected/blocked review states and parent-facing responses. The parent and staff UIs expose profile policy/completeness and the review actions. Users with `applications.block` can restore blocked/rejected parent access with an audited reason; block and restore both revoke old parent sessions. The spreadsheet staging/mapping/conflict-resolution workflow is implemented in Phase 3; a CNIC-only provisional parent must still receive a verified PN/O number before PN-based login. Legacy PN-keyed foreign keys remain a later schema migration.

### Phase 2 - documents and digital forms

1. Document definitions/requirements and record-specific secure storage.
2. Verification/version/expiry workflows.
3. Schema-driven form templates and versioned submissions.
4. Review workspace and internal messaging.

Current implementation status (2026-09-26): migration `010_documents_and_forms.js` and `server/document-management.js` implement the Phase 2 foundation. Document/form drafts publish immutable checksummed versions; requirements are effective-dated; files bind to an exact parent/child/application/banking/gadget record and definition version; signature-verified content is stored under random keys outside the web root with SHA-256 and supersession history. Structured form responses are server-validated against the exact published schema and versioned on correction. Staff can edit drafts with optimistic locking, build guided multi-section forms with individually managed choices, and transfer validated versioned `.json` configuration packages up to 2 MB; imports reject duplicate codes and remain drafts. New child registrations remain server-side drafts during step 2 and enter the staff queue only through the final authenticated submit endpoint after required uploads are present. Successful parent uploads persist immediately and parents can resume a child's workspace through My Children; form answers persist only after submission, and the API prevents duplicate submission until changes are requested. Staff request and review screens read current dynamic requirements, apply authority scopes, show configured form labels, support verified/changes-required/rejected decisions, and present record-scoped parent conversations plus visibly marked internal notes. Internal notes are filtered from the parent API. The former fixed parent upload route is retired with `410 Gone`. Remaining Phase 2 work is lookup/repeating-group controls, school-owned records, message attachments, retention/scanner jobs, and legacy-file migration; do not describe the entire phase as complete yet.

### Phase 3 - import platform

1. Staging, column mapping, transformations, dry run, and mapping templates.
2. Parent/child/provisional-parent imports.
3. Durable progress/logs, conflict resolution, idempotency, result reports, and controlled rollback.

Current implementation status (2026-09-26): migrations `011_import_platform.js`, `012_import_operations.js`, and `013_import_configuration.js` plus `server/import-platform.js` provide protected `.xlsx`/UTF-8 `.csv` upload, sheet/header selection, parent/child/mixed profiles, durable staged rows, explicit canonical mapping, bounded transforms, saved mapping-template create/update/archive/reactivation, configurable Unicode heading aliases, dry-run validation, normalized PN/CNIC matching, reference/scope checks, field and child-identity conflicts, per-conflict decisions, provisional parent/child execution, server-side progress/heartbeat/logs, before/after row provenance, formula-safe UTF-8 CSV and streamed native `.xlsx` result downloads, startup recovery for interrupted execution/rollback workers, guarded rollback, and configurable 7-3650 day source-file retention. `src/sections/ImportWorkspace.tsx` exposes the operational workflow under `imports.create`, `imports.resolve`, `imports.execute`, and `imports.rollback`; configuration inspection/changes use `settings.read` and `settings.manage`. Startup/daily/manual retention cleanup removes only original source files for final jobs and keeps staged results, reports, logs, and audit history. Rollback requires a reason plus typed job number, reverses rows in reverse order, and leaves a protected result instead of overwriting records edited later or deleting records with downstream links. Legacy `.xls` is rejected with conversion guidance because the selected parser supports modern `.xlsx` only. Still pending are distributed multi-node worker leasing, broader import profiles, bulk conflict actions, `.xls` conversion, and high-volume certification.

### Phase 4 - program operations

1. Banking evidence workflow.
2. Grant/payment batches, exports, confirmations, duplicate prevention, and budgets.
3. School claims/fees and gadget workflows according to confirmed stakeholder priority.
4. Reports and role/scope-aware exports.

### Phase 5 - production operations

1. Backup/restore and disaster-recovery drills.
2. Monitoring, capacity/load tests, security review, accessibility, and browser certification.
3. Offline release packaging, upgrade/rollback rehearsal, and operator training.

## 17. Definition of done

A feature is not complete unless:

- Its behavior is accepted against a written requirement/workflow.
- API authentication, permission, scope, field, and state checks exist.
- Database changes use a reversible, versioned migration.
- Validation and error states exist in both server and UI.
- Relevant actions are audited with sensitive values redacted.
- Unit/integration tests cover success, denial, invalid input, conflict, and concurrency where relevant.
- UI has loading, empty, failure, and retry behavior and is keyboard usable.
- Lists paginate and do not expose unrelated records.
- It works without public internet access.
- Documentation and configuration help are updated.
- Build, lint, tests, migration-up, migration-down/restore strategy, and smoke checks pass.

## 18. Working rules for any LLM or developer

1. Read this file, `Developer_Guide.md`, relevant source, and `git status` before editing.
2. Preserve unrelated user changes; the worktree may be dirty.
3. Never copy secrets, actual CNICs, bank data, tokens, or uploaded documents into prompts, logs, fixtures, or documentation.
4. Do not use or expand the current hard-coded users/authority passwords.
5. Do not trust a frontend role check. Protect the server route and SQL scope first.
6. Do not add configuration as another hard-coded array. Use stable database-backed master data and authorized settings.
7. Do not silently merge imports. Stage, explain, and record every decision.
8. Do not delete referenced master data; deactivate it.
9. Do not overwrite historical rates, authority assignments, documents, form templates, or decisions.
10. Do not invent missing stakeholder policy. Record a safe default and mark the decision for confirmation.
11. Use transactions for workflows that update more than one table.
12. Add tests with every behavior change and rerun affected builds/lints/tests.

## 19. Current development commands

These commands describe the existing prototype, not the final deployment topology.

```powershell
# Root main API + frontend
npm install
npm run dev

# Root checks
npm run build
npm run lint

# Parent API
Set-Location parent-portal
npm install
npm start

# Parent frontend
Set-Location client
npm install
npm run dev
npm run build
```

Default prototype ports:

- Main API: `3001`
- Main/authority Vite frontend: `5173`
- Parent API: `4000`
- Parent Vite frontend: `5174`
- MySQL: `3306`

Do not rely on hard-coded loopback URLs in production. Public browser-facing paths should normally use a same-origin reverse proxy, while bind addresses and ports come from validated deployment configuration.

## 20. Known decisions still requiring stakeholder confirmation

These do not block the foundational work, but must be resolved before the related module is finalized:

- Exact approval chain and separation-of-duty rules for category decisions, rates, banking evidence, payments, schools, and gadgets.
- Whether Admin may permanently block a parent by default or only through delegated permission.
- How a person with CNIC but no PN/O No proves account ownership before a PN/O No is linked.
- Retention periods for applications, uploads, audit records, import files, and backups.
- Maximum file size/type policy and capacity plan for the promised document volume.
- Former-authority access after a transfer.
- Final category names/meaning and Director confirmation of the initial A/B/C rates before live payment.
- Detailed school, gadget, budget, and payment procedures for Phase 4.
- Production infrastructure, redundancy, recovery objectives, and expected concurrent usage.

Until confirmed, use conservative access, preserve history, avoid destructive automation, and make the choice configurable where that will not weaken security or integrity.
