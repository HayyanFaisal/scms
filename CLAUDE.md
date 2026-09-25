# SCMS — Claude Assistant Instructions & Quick Reference

Before changing this project, read the canonical [`LLM_GUIDEv2.md`](./LLM_GUIDEv2.md) and its companion [`Developer_Guide.md`](./Developer_Guide.md). The older [`LLM_GUIDE.md`](./LLM_GUIDE.md) is retained only as a historical description of the prototype.

## Project Overview
Special Children Management System (SCMS) for the **Pakistan Navy Benevolent Association (PNBA)**.
Comprises two decoupled portals sharing a single MySQL database (`pnba`):
1. **Main SCMS**: Admin Portal (`:5173`), Authority Portal (`:5173/authority.html`), and Main Backend API (`:3001`).
2. **Parent Portal**: Parent UI (`:5174`) and Parent Backend API (`:4000`).

## Development Commands

```powershell
# 1. Main SCMS (Express API :3001 + Vite Frontend :5173)
cd scms
npm run dev

# 2. Parent Portal Backend (Express API :4000)
cd scms/parent-portal
npm start

# 3. Parent Portal Client (Vite Frontend :5174)
cd scms/parent-portal/client
npm run dev

# 4. Check Listening Ports (Windows PowerShell)
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 3001, 4000, 5173, 5174 } | Select-Object LocalAddress, LocalPort, OwningProcess
```

## Critical Architectural Guidelines

1. **Database Schema & Keys**:
   - Primary key for parents is **`P_No_O_No`** (`VARCHAR(50)`), NOT an auto-increment integer ID.
   - Column for parent's CNIC in `parent_beneficiary` is **`Parent_CNIC`** (NOT `CNIC`).
   - Shared database name is **`pnba`** on default port 3306.

2. **Parent Portal Authentication**:
   - Token is stored in `localStorage` under **`portalToken`** (and user under `portalUser`).
   - In React components, always use `const { token } = useAuth()` from `src/context/AuthContext`. Never read `localStorage.getItem('token')`.

3. **Inter-Service Bridge**:
   - Main API communicates with Parent Portal API using header `x-api-key: scms_sync_secret_2024_change_this`.
   - Admin approves registration or child in Main Admin (`:3001`), which triggers `/api/sync/approval` on Parent Portal API (`:4000`).

4. **Document Uploads**:
   - Parent portal uploads 4 mandatory verification documents to `scmsForms/{P_No_O_No}/` via Multer.
   - Main Admin views these files using the proxy endpoint `/api/admin/document-view`.
