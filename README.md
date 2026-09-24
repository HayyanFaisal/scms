# Special Children Management System (SCMS)

SCMS is a comprehensive platform built for the **Pakistan Navy Benevolent Association (PNBA)** to manage beneficiaries, special children medical profiles, educational records, monthly financial grants, assistive gadget procurement, and multi-tiered approval workflows.

The system is composed of two primary sub-systems:
1. **SCMS Main System**: The central administration and regional authority portal.
2. **Parent Portal**: A self-service portal for naval personnel/parents to register, submit child details, upload medical/disability documents, and manage banking information.

---

## Portals & System URLs

| Portal / Service | URL / Address | Description | Default Credentials |
| :--- | :--- | :--- | :--- |
| **Main Admin Portal** | [http://localhost:5173](http://localhost:5173) | Central dashboard for beneficiaries, children, grants, gadgets, and approvals inbox. | **Admin:** `admin` / `admin123`<br>**Finance:** `finance` / `finance123`<br>**Operator:** `operator` / `operator123`<br>**Viewer:** `viewer` / `viewer123` |
| **Authority Portal** | [http://localhost:5173/authority.html](http://localhost:5173/authority.html) | Regional command portal (COMKAR, COMLOG, COMNOR, etc.) with command-filtered data. | Select Authority<br>**Password:** `12345678` |
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
- **Role-based Authentication**: Admin, Finance Officer, Data Entry Operator, Viewer.
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

