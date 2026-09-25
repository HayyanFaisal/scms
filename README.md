# Special Children Management System (SCMS)

SCMS is a comprehensive platform built for the **Pakistan Navy Benevolent Association (PNBA)** to manage beneficiaries, special children medical profiles, educational records, monthly financial grants, assistive gadget procurement, and multi-tiered approval workflows.

The system is composed of two primary sub-systems:
1. **SCMS Main System**: The central administration and regional authority portal.
2. **Parent Portal**: A self-service portal for naval personnel/parents to register, submit child details, upload medical/disability documents, and manage banking information.

---

## Portals & System URLs

| Portal / Service | URL / Address | Description | Default Credentials |
| :--- | :--- | :--- | :--- |
| **Main Admin Portal** | [http://localhost:5173](http://localhost:5173) | Central dashboard for beneficiaries, children, grants, gadgets, and approvals inbox. | Individual Director/Admin/Support account |
| **Authority Portal** | [http://localhost:5173/authority.html](http://localhost:5173/authority.html) | Legacy regional command portal. Shared-password login is disabled by default while it is migrated to named RBAC accounts. | No default credential |
| **Main Backend API** | [http://localhost:3001](http://localhost:3001) | Express REST API for Main SCMS & Authority Portal. | N/A |
| **Parent Portal Frontend** | [http://localhost:5174](http://localhost:5174) | Self-service portal for parents to register, add children, upload files, and manage bank info. | Registered Parent P.No/O.No & Password |
| **Parent Portal Backend API** | [http://localhost:4000](http://localhost:4000) | Express REST API for Parent Portal authentication, document uploads, and syncing. | N/A |

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
- A returned parent can sign in, correct the profile, and resubmit. A blocked parent cannot use the portal until an authorized future unblock workflow is added.

The staged Excel/CSV importer, mapping wizard, and conflict-resolution UI are Phase 3. The Phase 1 provisional-record endpoint is the identity-safe foundation those screens will use.

Open separate terminals to run both portals simultaneously:

### Terminal 1: Run Main SCMS (Admin + Authority + Backend)
```powershell
cd scms
npm install
npm run dev
```
* **Backend API**: Running at [http://localhost:3001](http://localhost:3001)
* **Main Admin Portal**: Access at [http://localhost:5173](http://localhost:5173)
* **Authority Portal**: Access at [http://localhost:5173/authority.html](http://localhost:5173/authority.html)

### Terminal 2: Run Parent Portal Backend
```powershell
cd scms\parent-portal
npm install
npm start
```
* **Parent Portal API**: Running at [http://localhost:4000](http://localhost:4000)

### Terminal 3: Run Parent Portal Client
```powershell
cd scms\parent-portal\client
npm install
npm run dev
```
* **Parent Portal Frontend**: Access at [http://localhost:5174](http://localhost:5174)

---

## Features & Workflows

### 1. Main Admin Portal ([http://localhost:5173](http://localhost:5173))
- **Role-based Authentication**: protected Director, Admin, Support, and Director-created custom roles.
- **Beneficiary Registry**: Detailed tracking of naval parents (Serving, Retired, Expired), service rankings, almirah & file records, and bank accounts.
- **Dependent Children**: Child records, assigned disability categories (Category A: Severe, Category B: Moderate, Category C: Mild), medical condition details, and schooling.
- **Grants & Gadgets Management**: Manage monthly allowances, calculate total CFY disbursals, record assistive device acquisitions with automated 18% tax calculation.
- **Requests & Approvals Inbox**: Review real-time registration and child addition submissions received from the Parent Portal. Inspect uploaded medical performas and certificates directly in an image modal before approving or rejecting with remarks.
- **Reports & Exporting**: Generate comprehensive PDF and tabular exports for board presentations.

### 2. Authority Portal ([http://localhost:5173/authority.html](http://localhost:5173/authority.html))
- Dedicated portal for regional commands (HQ COMNOR, HQ COMKAR, HQ COMCEP, HQ COMLOG, HQ COMPAK, HQ COMCOAST, HQ FOST, HQ NSFC, HQ PMSA).
- Provides command-specific filtered dashboards and grant statistics.

### 3. Parent Portal ([http://localhost:5174](http://localhost:5174))
- **Self-Service Registration**: Parents sign up using their Official P.No / O.No, CNIC, rank, unit, and service status.
- **Add Special Child (2-Step Wizard)**:
  1. Input child bio, age, B-Form/CNIC, disability details, and category.
  2. Upload 4 verification documents:
     - Assessment Performa (by Specialist Doctor)
     - Application Form (Father + Child + Bank details + PN Authorization)
     - Disability Certificate (NCRDP / PCRDP)
     - Identity Proof (Child B-Form / CNIC)
- **Banking Management**: Add, update, and manage bank account, branch, and IBAN details for direct grant transfers.
- **Real-Time Status**: Monitor approval status (`Pending`, `Approved`, `Rejected`) synced with the central Admin system.
