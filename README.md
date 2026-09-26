# Special Children Management System (SCMS)

SCMS is a comprehensive platform built for the **Pakistan Navy Benevolent Association (PNBA)** to manage beneficiaries, special children medical profiles, educational records, monthly financial grants, assistive gadget procurement, and multi-tiered approval workflows.

The system is composed of two primary sub-systems:

1. **SCMS Main System**: The central administration and regional authority portal.
2. **Parent Portal**: A self-service portal for naval personnel/parents to register, submit child details, upload medical/disability documents, and manage banking information.

---

## Portals & System URLs

| Portal / Service              | URL / Address                                                                | Description                                                                                                               | Default Credentials                       |
| :---------------------------- | :--------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------ | :---------------------------------------- |
| **Main Admin Portal**         | [http://localhost:5173](http://localhost:5173)                               | Central dashboard for beneficiaries, children, grants, gadgets, and approvals inbox.                                      | Individual Director/Admin/Support account |
| **Authority Portal**          | [http://localhost:5173/authority.html](http://localhost:5173/authority.html) | Legacy regional command portal. Shared-password login is disabled by default while it is migrated to named RBAC accounts. | No default credential                     |
| **Main Backend API**          | [http://localhost:3001](http://localhost:3001)                               | Express REST API for Main SCMS & Authority Portal.                                                                        | N/A                                       |
| **Parent Portal Frontend**    | [http://localhost:5174](http://localhost:5174)                               | Self-service portal for parents to register, add children, upload files, and manage bank info.                            | Registered Parent P.No/O.No & Password    |
| **Parent Portal Backend API** | [http://localhost:4000](http://localhost:4000)                               | Express REST API for Parent Portal authentication, document uploads, and syncing.                                         | N/A                                       |

---

## System Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        MAIN SCMS (Root Directory)                      │
│                                                                        │
│   [Vite App - Port 5173]                                               │
│     ├── Main Admin Portal    --> http://localhost:5173                 │
│     └── Authority Portal     --> http://localhost:5173/authority.html  │
│                                                                        │
│   [Express API - Port 3001]                                            │
│     └── Handles MySQL 'pnba' queries, uploads, & admin approvals       │
└───────────────────┬────────────────────────────────────────────────────┘
                    │
                    │ Sync Bridge (X-API-KEY / PORTAL_API_KEY)
                    │ - Admin reviews & approves parent/child requests
                    │ - Syncs status back to Parent Portal
                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     PARENT PORTAL (parent-portal/)                     │
│                                                                        │
│   [Vite App - Port 5174]                                               │
│     └── Parent UI           --> http://localhost:5174                  │
│                                                                        │
│   [Express API - Port 4000]                                            │
│     └── Parent Auth (JWT/Bcrypt), 4-Document Upload, & Requests Queue  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

- **Node.js**: v18+ or v20+
- **MySQL**: MySQL Server 8.0+ running on `127.0.0.1:3306`
- **npm**: v9+

---

## MySQL Setup (Windows)

1. **Install MySQL:**
   - Download MySQL Community Server from [MySQL Downloads](https://dev.mysql.com/downloads/mysql/) and install it.
   - During installation, set your root password (e.g., `Hayyan`).

2. **Start MySQL Service:**
   - Press `Win + R`, type `services.msc`, and ensure the `MySQL` or `MySQL80` service is running.

3. **Create the Database:**
   - Open Command Prompt:
     ```cmd
     mysql -u root -p
     ```
   - Run:
     ```sql
     CREATE DATABASE pnba;
     USE pnba;
     ```

4. **Execute Database Schema:**
   ```sql
   -- Core Identity
   CREATE TABLE IF NOT EXISTS Parent_Beneficiary (
       P_No_O_No VARCHAR(50) PRIMARY KEY,
       Parent_Name VARCHAR(100) NOT NULL,
       Rank_Rate VARCHAR(50),
       Unit VARCHAR(100),
       Admin_Authority VARCHAR(100),
       Service_Status ENUM('Serving', 'Retired', 'Expired'),
       Parent_CNIC VARCHAR(20),
       No_of_Disabled_Children INT DEFAULT 0,
       Address VARCHAR(255),
       Email VARCHAR(100)
   );

   -- Documentation Tracking
   CREATE TABLE IF NOT EXISTS Document_Tracking (
       Doc_ID INT PRIMARY KEY AUTO_INCREMENT,
       P_No_O_No VARCHAR(50),
       Letter_Reference VARCHAR(255),
       Contact_No VARCHAR(50),
       Almirah_No VARCHAR(20),
       File_No VARCHAR(20),
       Total_No_of_Children INT,
       FOREIGN KEY (P_No_O_No) REFERENCES Parent_Beneficiary(P_No_O_No)
   );

   -- Banking Layer
   CREATE TABLE IF NOT EXISTS Banking_Details (
       Account_ID INT PRIMARY KEY AUTO_INCREMENT,
       P_No_O_No VARCHAR(50),
       Account_Title VARCHAR(100),
       Bank_Name VARCHAR(100),
       Account_Number VARCHAR(50),
       Branch_Code VARCHAR(20),
       Branch_Address VARCHAR(255),
       IBAN VARCHAR(50) UNIQUE,
       Routing_Number VARCHAR(20),
       Bank_Name_Branch VARCHAR(255),
       CNIC_of_Account_Holder VARCHAR(20),
       FOREIGN KEY (P_No_O_No) REFERENCES Parent_Beneficiary(P_No_O_No)
   );

   -- Child Medical Profile
   CREATE TABLE IF NOT EXISTS Dependent_Children (
       Child_ID INT PRIMARY KEY AUTO_INCREMENT,
       P_No_O_No VARCHAR(50),
       Child_Name VARCHAR(100),
       Age DECIMAL(4,1),
       CNIC_BForm_No VARCHAR(20) UNIQUE,
       Disease_Disability TEXT,
       Disability_Category CHAR(1), -- A, B, C
       Disability_Certificate_No VARCHAR(100),
       Authority VARCHAR(100),
       Category_Allotted_By VARCHAR(100),
       School VARCHAR(100),
       FOREIGN KEY (P_No_O_No) REFERENCES Parent_Beneficiary(P_No_O_No)
   );

   -- Financials & Gadgets
   CREATE TABLE IF NOT EXISTS Monthly_Grants (
       Grant_ID INT PRIMARY KEY AUTO_INCREMENT,
       Child_ID INT,
       Monthly_Amount DECIMAL(10,2),
       Total_CFY_Amount DECIMAL(10,2),
       Approved_From DATE,
       Approved_To DATE,
       FOREIGN KEY (Child_ID) REFERENCES Dependent_Children(Child_ID)
   );

   CREATE TABLE IF NOT EXISTS Child_Gadgets (
       Gadget_ID INT PRIMARY KEY AUTO_INCREMENT,
       Child_ID INT,
       Detail_of_Gadgets VARCHAR(255),
       Base_Cost DECIMAL(10,2),
       Tax_18_Percent DECIMAL(10,2) AS (Base_Cost * 0.18),
       Total_Cost DECIMAL(10,2) AS (Base_Cost * 1.18),
       Acquisition_Type ENUM('Off the Shelf', 'Customized', 'Reimbursed'),
       FOREIGN KEY (Child_ID) REFERENCES Dependent_Children(Child_ID)
   );
   ```

---

## Environment Configuration

### 1. Root System (`.env`)

Create or verify `.env` in the root `scms` directory:

```env
DATABASE_URL=mysql://root:YourPassword@127.0.0.1:3306/pnba
PORT=3001
VITE_API_URL=http://localhost:3001/api

# Parent Portal Bridge Configuration
PORTAL_API_URL=http://127.0.0.1:4000
PORTAL_API_KEY=scms_sync_secret_2024_change_this
ADMIN_API_URL=http://127.0.0.1:3001
JWT_SECRET=scms_jwt_secret_make_this_long_and_random_change_in_production
```

### 2. Parent Portal (`parent-portal/.env`)

Create or verify `parent-portal/.env`:

```env
PORTAL_HOST=127.0.0.1
PORTAL_PORT=4000

PORTAL_DB_HOST=127.0.0.1
PORTAL_DB_USER=root
PORTAL_DB_PASSWORD=YourPassword
PORTAL_DB_NAME=pnba

PORTAL_JWT_SECRET=portal_jwt_secret_make_this_long_and_random
ADMIN_API_KEY=scms_sync_secret_2024_change_this
PARENT_PORTAL_URL=http://127.0.0.1:5174

UPLOAD_DIR=C:\Users\hayya\VSCode\SCMS\scmsForms
MAX_FILE_SIZE_MB=5
```

---

## Installation & Running the Projects

### Create the first Director account

The previous browser-only demo accounts have been removed. After configuring `.env` from `.env.example` and starting MySQL, create the first protected Director once:

```powershell
$env:SCMS_BOOTSTRAP_USERNAME='director'
$env:SCMS_BOOTSTRAP_PASSWORD='replace-with-a-strong-temporary-password'
$env:SCMS_BOOTSTRAP_DISPLAY_NAME='SCMS Director'
npm run bootstrap:director
Remove-Item Env:SCMS_BOOTSTRAP_USERNAME, Env:SCMS_BOOTSTRAP_PASSWORD, Env:SCMS_BOOTSTRAP_DISPLAY_NAME
```

The account is forced to replace the temporary password after first login. Temporary credentials expire after 24 hours. The bootstrap command refuses to create another Director when an active Director already exists.

After signing in as Director, open **Access Control** in the sidebar to:

- Create named staff accounts and assign one or more roles.
- Create custom roles and select their permitted actions.
- Create reusable scopes for selected administrative authorities.
- Choose a separate data scope for parents, children, documents, banking, grants, and gadgets.
- Unlock accounts or issue a new audited 24-hour temporary password.

The protected Director role always retains all permissions, and the system refuses to deactivate or remove the final active Director.

Any signed-in staff member can rotate their own password from the profile menu using **Change password**. Use this immediately whenever a credential may have been exposed.

Authority credential administration is deliberately split:

- A Director, or a custom role granted `authority_accounts.reset_password`, may issue a 24-hour temporary authority password from **Authority Settings** without knowing the old password.
- The authority changes its own password from the authority dashboard by entering the current password.
- Either operation invalidates older authority tokens. Authority credentials are hashed and there is no default password.

The shared-authority portal is transitional and remains disabled unless `SCMS_ENABLE_LEGACY_AUTHORITY_LOGIN=true`. The production target is individual named RBAC accounts with authority scopes.

### Phase 1 configuration registry

Open **Configuration** in the staff sidebar to manage authorities, schools, ranks/rates, units, service statuses, child categories, category-rate schedules, and transitional authority credentials. The registry is stored in MySQL; operational forms in both the staff app and parent portal read the same active choices.

- `organizations.read` can view registry data; `organizations.manage` can add, rename, reorder, archive, and reactivate it.
- Referenced items are archived rather than deleted. Renames update current legacy string references transactionally and retain before/after history.
- `rates.read` can view category schedules; `rates.manage` can publish a future schedule with a required reason.
- Rate schedules are immutable and effective-dated. Existing grants retain their saved amount; a current rate only prefills a new grant and may be overridden during approval.
- Parent signup may explicitly choose no authority. The former silent `HQ COMNOR` default has been removed.

Migration `005_configurable_registry.js` seeds current database values plus the initial A/B/C monthly rates (PKR 25,000 / 20,000 / 15,000). Restart the API after pulling these changes so migrations and the new routes load.

Imported or admin-created parent accounts no longer use a predictable password. An authorized user can open the parent record and choose **Issue one-time password**. The randomly generated credential is shown once, expires in 24 hours, invalidates prior parent sessions, and forces a password change before any parent data can be used. This lifecycle is installed by `006_parent_account_lifecycle.js` and requires `accounts.issue_one_time_password`.

Parent child submissions now store the parent-selected category separately from the approved category. During review, staff must choose the approved category; it may differ from the parent choice, and migration `007_category_decisions.js` preserves an actor/reason decision record. Only the approved category is mirrored into legacy benefit fields and used for new-grant rate suggestions.

Phase 1 account/profile lifecycle is installed by migrations `008_profile_lifecycle.js` and `009_review_states.js`:

- PN/O number and CNIC are normalized into an identifier registry; ambiguous legacy values are retained as reviewable conflicts.
- Imports can create or match provisional parents and optionally attach provisional children without fake placeholder demographics.
- Parent records expose `complete`, `incomplete`, or `conflict_review` state and list missing configured fields.
- Open **Configuration → Parent Fields** to mark fields as direct-edit, approval-required, or locked, and to control which active fields are required.
- Controlled parent edits appear in **Requests** with current/proposed values. Authorized staff can approve, request changes, reject, or block online access; non-approval decisions require a parent-facing reason.
- A returned parent can sign in, correct the profile, and resubmit. A blocked parent cannot use the portal. A Director or role with `applications.block` can restore access from the parent record after entering a mandatory audit reason; restoration revokes older sessions and returns incomplete records to changes-required.

The Phase 1 provisional-record endpoint is the identity-safe foundation used by the staged Phase 3 importer described below.

### Phase 2 documents and digital forms

Migration `010_documents_and_forms.js` installs the first Phase 2 workflow:

- Open **Configuration → Documents & Forms** to create or edit draft document requirements and bounded structured forms, then publish immutable effective-dated versions.
- Draft definitions can be exported as versioned SCMS JSON packages and imported into another installation. Import accepts only an SCMS `.json` configuration package up to 2 MB—not Excel, Word, PDF, or arbitrary form JSON. Imports are fully validated, reject duplicate stable codes, contain no operational records/files, and always remain drafts until a separately authorized publication. The import dialog includes a downloadable example.
- Requirements support parent, child, application, banking, and gadget records. File size/count, allowed MIME types, expiry, replacement behavior, guidance, required status, and display order are stored in the published definition.
- New evidence is stored under `SCMS_DOCUMENT_STORAGE_DIR` (or the ignored `.scms-data/documents` development directory), outside any public static path. Storage keys are random; the server checks file signatures, enforces the published policy, computes SHA-256, and records the exact owner and definition version.
- Replacement evidence creates a new version and marks the former current version as superseded. It does not overwrite history.
- A new child remains a resumable `draft` while step 2 is incomplete and enters the staff queue only when the parent presses **Submit for review**. Parent uploads are committed immediately after each upload succeeds; refresh does not discard them. Unsubmitted digital-form answers remain browser-only until **Submit form** is pressed. The parent can reopen any child through **My Children → View Details** to resume configured requirements.
- Parents receive a dynamic child-specific Documents & Digital Forms workspace. The former fixed document upload endpoint returns `410 Gone`.
- Open **Documents & Forms** in the staff sidebar to review uploads and structured submissions within the account's document data scope. Verification, changes-required, and rejection decisions retain reviewer, time, and reason.
- Parent/staff message threads are record-scoped. The staff review workspace can start conversations, reply, and add visibly distinguished internal notes; internal notes never appear in the parent portal.

The form designer supports multiple sections, common safe field types, choice options, instructions, help text, and text-length validation. Lookup/repeating-group controls, school-owned records, message attachments, retention jobs, malware-scanner adapters, and legacy-file migration remain Phase 2 follow-up work.

### Phase 3 staged data imports

Migrations `011_import_platform.js`, `012_import_operations.js`, and `013_import_configuration.js` install durable import jobs, staged rows, field-level conflicts, reusable mapping templates, configurable heading aliases, source-retention settings, job logs, restart metadata, and guarded rollback outcomes. Open **Data Imports** in the staff sidebar when the account has `imports.create`.

- Accepted source formats are `.xlsx` and UTF-8 `.csv`, up to 20 MB, 100,000 rows, and 250 columns per sheet. Legacy binary `.xls` is deliberately rejected with instructions to save as `.xlsx` or `.csv`; PDF is not a tabular import format.
- The original source is checksummed and stored under `SCMS_IMPORT_STORAGE_DIR` (or ignored `.scms-data/imports`) outside the web root. A configurable 7-3650 day policy can retire source files after finalization while preserving staged results, logs, reports, and audit history.
- The operator selects the worksheet, header row, and parent/child/mixed profile, then maps arbitrary headings to canonical SCMS fields. Built-in and Director-configured multilingual aliases receive suggestions, but mappings remain explicit and reviewable.
- Dry validation does not change operational records. It checks PN/CNIC normalization, child identifiers, configured reference values, role scope, likely creates/updates, field differences, and hard identity collisions.
- Authorized users resolve each conflict by keeping the existing value, using the incoming value, entering a manual value, skipping, or deferring where the conflict type safely permits it. Identity collisions are never silently merged.
- `imports.execute` starts execution of eligible rows. Progress, heartbeat, row outcome, before/after data, and logs are stored server-side and survive a browser refresh.
- Interrupted execution and rollback workers are discovered from MySQL and resumed when the API starts. Already executed or reversed rows are not applied twice.
- Operators can create, update, archive, reactivate, and reuse mappings. Outcome reports containing every row result, issue, target record, and rollback result are available as UTF-8 CSV and genuine `.xlsx` workbooks.
- The selected/current mapping is shown as an exact SCMS-field, source-heading, and transform table. Archived templates and disabled custom heading aliases can be permanently deleted only after entering a reason and typing the exact name; their deletion audit event remains immutable.
- `imports.rollback` exposes a Director-only guarded rollback. It requires a reason and typed job number, processes rows in reverse order, and refuses to overwrite records edited later or delete records that gained linked operational data.

Current Phase 3 limitations: legacy `.xls`, distributed multi-node worker leasing, more import profiles, bulk conflict decisions, and high-volume performance certification remain follow-up work. The current CSV and Excel result exports are genuine files of the advertised type.

### Phase 4 banking verification

Migrations `015_banking_evidence_workflow.js` and `016_default_banking_evidence.js` add a versioned banking-evidence workflow. Parents save account details, upload the configured evidence, and submit for review. Any later account edit invalidates the former approval and requires evidence uploaded after that change. Staff review the file in **Documents & Forms**, then use **Banking Review** to verify the account or return a parent-visible correction reason. Final banking approval requires `banking.verify`, follows the account's banking authority scope, and is blocked until all current required evidence files are verified. No external bank connection is used.

### Phase 4 payment operations

Migration `017_payment_operations.js` adds authority-scoped fiscal budgets, monthly payment batches, immutable payment-line snapshots, and confirmation attempts. Open **Payments** with `payments.read`.

- Preview explains why every active grant is eligible or excluded. Unapproved records, partial-month grants, missing/unverified banking, invalid rates, and an already scheduled grant/month are never silently included.
- Creating a batch rechecks eligibility inside a transaction. A database unique guard prevents duplicate or concurrent scheduling for the same grant and month.
- A confirmed authority budget is required for approval. The person who prepared a batch cannot approve it, and concurrent approvals serialize against the budget so they cannot both spend the same balance.
- `payments.export` produces a formula-safe CSV containing the captured banking snapshot and records its SHA-256 checksum. Export is a CSRF-protected audited action.
- After bank handoff, `payments.confirm` records paid, failed, or returned outcomes. Every retry is retained rather than overwriting the previous attempt.
- SCMS prepares and reconciles files only; it does not contact a bank or initiate a transfer.

The stakeholder-test container topology is documented in `deploy/README.md`. It serves both portals over HTTPS while keeping MySQL and both API ports off the public network.

For a safe guided test, use `test-data/SCMS_Parent_Import_Test_50_Rows.xlsx`. It contains exactly 50 clearly marked parent rows plus **Read Me** and **Mapping Guide** sheets. Choose **Parents only**, worksheet **Parents 50**, and header row **1**, then run dry validation before execution. Regenerate it with `npm run generate:test-import`.

### Audit log

Accounts with `audit.read` see **Audit Log** in the staff sidebar; it is also available inside Reports when the user has both report and audit permissions. This page reads the immutable `scms_audit_events` server table rather than the retired browser-local prototype log. It supports server-side search, action/entity/outcome/date filters, pagination, structured-detail inspection, and refresh. `audit.export` adds a filtered CSV export, and the export itself is audited. The page provides no edit or delete operation.

Open separate terminals to run both portals simultaneously:

### Terminal 1: Run Main SCMS (Admin + Authority + Backend)

```powershell
cd scms
npm install
npm run dev
```

- **Backend API**: Running at [http://localhost:3001](http://localhost:3001)
- **Main Admin Portal**: Access at [http://localhost:5173](http://localhost:5173)
- **Authority Portal**: Access at [http://localhost:5173/authority.html](http://localhost:5173/authority.html)

### Terminal 2: Run Parent Portal Backend

```powershell
cd scms\parent-portal
npm install
npm start
```

- **Parent Portal API**: Running at [http://localhost:4000](http://localhost:4000)

### Terminal 3: Run Parent Portal Client

```powershell
cd scms\parent-portal\client
npm install
npm run dev
```

- **Parent Portal Frontend**: Access at [http://localhost:5174](http://localhost:5174)

---

## Features & Workflows

### 1. Main Admin Portal ([http://localhost:5173](http://localhost:5173))

- **Role-based Authentication**: protected Director, Admin, Support, and Director-created custom roles.
- **Beneficiary Registry**: Detailed tracking of naval parents (Serving, Retired, Expired), service rankings, almirah & file records, and bank accounts.
- **Dependent Children**: Child records, assigned disability categories (Category A: Severe, Category B: Moderate, Category C: Mild), medical condition details, and schooling.
- **Grants & Gadgets Management**: Manage monthly allowances, calculate total CFY disbursals, record assistive device acquisitions with automated 18% tax calculation.
- **Requests & Approvals Inbox**: Review real-time registration and child addition submissions received from the Parent Portal. Child requests show the currently configured document requirements, saved file versions, and structured-form submissions rather than retired fixed document names.
- **Reports & Exporting**: Generate comprehensive PDF and tabular exports for board presentations.

### 2. Authority Portal ([http://localhost:5173/authority.html](http://localhost:5173/authority.html))

- Dedicated portal for regional commands (HQ COMNOR, HQ COMKAR, HQ COMCEP, HQ COMLOG, HQ COMPAK, HQ COMCOAST, HQ FOST, HQ NSFC, HQ PMSA).
- Provides command-specific filtered dashboards and grant statistics.

### 3. Parent Portal ([http://localhost:5174](http://localhost:5174))

- **Self-Service Registration**: Parents sign up using their Official P.No / O.No, CNIC, rank, unit, and service status.
- **Add Child (2-Step Wizard)**:
  1. Enter child identity, school, and the parent-selected category.
  2. Complete whatever documents and digital forms the Director has currently configured for child records. Uploads save immediately and can be resumed later from **My Children**.
- **Banking Management**: Add, update, and manage bank account, branch, and IBAN details for direct grant transfers.
- **Real-Time Status**: Monitor approval status (`Pending`, `Approved`, `Rejected`) synced with the central Admin system.
