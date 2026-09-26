// parent-portal/server.js
import express from 'express';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import crypto from 'crypto';
import multer from 'multer';
import { documentFilePath, loadDocumentWorkspace, missingRequiredUploads, resolveDocumentOwner, storeDocumentFile, validateFormResponse } from '../server/document-management.js';
import { appendBankingHistory, bankingError, normalizeBankingPayload } from '../server/banking-workflow.js';
import path from 'path';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import {
    PARENT_FIELD_COLUMNS,
    loadParentFieldPolicies,
    refreshChildCompleteness,
    refreshParentCompleteness,
    syncParentIdentifiers
} from '../server/profile-lifecycle.js';
dotenv.config();

const app = express();

// Security middleware
app.use(helmet());
app.use(express.json({ limit: '10mb' }));

// CORS: accept the configured internal origins and both loopback spellings in development.
const parentPortalOrigins = new Set([
    ...(process.env.PARENT_PORTAL_ORIGINS || process.env.PARENT_PORTAL_URL || '')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean),
    'http://localhost:5174',
    'http://127.0.0.1:5174'
]);

app.use(cors({
    credentials: true,
    origin(origin, callback) {
        if (!origin || parentPortalOrigins.has(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error('Origin is not allowed'));
    }
}));

// Rate limiting with admin API key exception
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later' },
    skip: (req) => {
        // Skip rate limiting for requests with valid admin API key
        const apiKey = req.headers['x-api-key'];
        return apiKey === process.env.ADMIN_API_KEY;
    }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 attempts per 15 minutes
    skipSuccessfulRequests: true,
    message: { error: 'Too many login attempts, please try again in 15 minutes' }
});

// Database connection (using main database)
const pool = mysql.createPool({
    host: process.env.PORTAL_DB_HOST,
    user: process.env.PORTAL_DB_USER,
    password: process.env.PORTAL_DB_PASSWORD,
    database: process.env.PORTAL_DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Global config
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), '..', '..', 'scmsForms');
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || 5);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Ensure upload directory exists
await fs.mkdir(UPLOAD_DIR, { recursive: true });

// Multer storage: scmsForms/{PN_NUMBER}/{documentType}_{bform/cnic}.{ext}
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        console.log('Multer destination called with req.body:', req.body);
        const { pNoONo, documentType } = req.body;
        console.log('Extracted pNoONo:', pNoONo, 'documentType:', documentType);
        
        // Use the correct directory
        const targetDir = pNoONo ? path.join(UPLOAD_DIR, pNoONo) : path.join(UPLOAD_DIR, 'temp');
        await fs.mkdir(targetDir, { recursive: true });
        cb(null, targetDir);
    },
    filename: (req, file, cb) => {
        console.log('Multer filename called with req.body:', req.body);
        const { identifier, documentType } = req.body;
        
        // Generate a temporary filename if data is missing
        const tempIdentifier = identifier || 'temp';
        const tempDocType = documentType || 'temp';
        const ext = path.extname(file.originalname) || '.jpg';
        const safeDocType = tempDocType.replace(/_/g, '-');
        cb(null, `${safeDocType}_${tempIdentifier}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error(`Only images and PDF allowed. Got: ${file.mimetype}`));
    }
});

const phaseTwoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024, files: 1 }
});

// Verify database connection and check main database tables
pool.getConnection()
    .then(async conn => {
        console.log('✅ Connected to main database:', process.env.PORTAL_DB_NAME);
        
        // Check if main database tables exist
        const [tables] = await conn.query('SHOW TABLES');
        const tableNames = tables.map(row => Object.values(row)[0]);
        
        console.log('📋 Available tables:', tableNames);
        
        // Check for required tables
        const requiredTables = ['parent_beneficiary', 'banking_details', 'dependent_children'];
        const missingTables = requiredTables.filter(table => !tableNames.includes(table));
        
        if (missingTables.length > 0) {
            console.error('❌ Missing required tables:', missingTables);
            console.error('Please ensure the main database has been properly initialized with the main system.');
            process.exit(1);
        }
        
        console.log('✅ All required tables found in main database');
        
        conn.release();
    })
    .catch(err => {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1);
    });

// JWT middleware
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: 'Access denied' });
    
    try {
        const user = jwt.verify(token, process.env.PORTAL_JWT_SECRET);
        const [records] = await pool.execute(
            'SELECT Credential_Version, Must_Change_Password, Status FROM parent_beneficiary WHERE P_No_O_No = ?',
            [user.pNoONo]
        );
        if (!records[0] || Number(user.credentialVersion) !== Number(records[0].Credential_Version)) {
            return res.status(403).json({ error: 'Session is no longer valid. Please sign in again.' });
        }
        req.user = user;
        req.user.mustChangePassword = Boolean(records[0].Must_Change_Password);
        req.user.accountStatus = records[0].Status;
        if (req.user.mustChangePassword && !req.originalUrl.startsWith('/api/auth/change-password')) {
            return res.status(403).json({ error: 'Replace the one-time password before using the portal.', status: 'password_change_required' });
        }
        if (req.user.accountStatus === 'blocked') {
            return res.status(403).json({ error: 'Online access is blocked. Contact the office.', status: 'blocked' });
        }
        if (req.user.accountStatus === 'changes_required') {
            const allowed = ['/api/profile', '/api/profile/update', '/api/profile/configuration', '/api/status', '/api/auth/change-password'];
            if (!allowed.some(pathName => req.originalUrl.startsWith(pathName))) {
                return res.status(403).json({ error: 'Complete the requested profile corrections before using this feature.', status: 'changes_required' });
            }
        }
        if (['pending', 'rejected'].includes(req.user.accountStatus)) {
            const allowed = ['/api/profile', '/api/status'];
            if (!allowed.some(pathName => req.originalUrl.startsWith(pathName))) {
                return res.status(403).json({ error: 'This account is not currently approved for portal operations.', status: req.user.accountStatus });
            }
        }
        next();
    } catch (error) {
        console.error('JWT verification failed:', error.message);
        return res.status(403).json({ error: 'Invalid token' });
    }
};

const requireApproved = async (req, res, next) => {
    const [users] = await pool.execute(
        'SELECT Status FROM parent_beneficiary WHERE P_No_O_No = ?',
        [req.user.pNoONo]
    );
    if (users[0]?.Status !== 'approved') {
        return res.status(403).json({ error: 'Account pending approval' });
    }
    next();
};

// Password utilities
const hashPassword = async (password) => bcrypt.hash(password, 12);
const verifyPassword = async (password, hash) => bcrypt.compare(password, hash);
const generateOneTimePassword = () => `SCMS-${crypto.randomBytes(12).toString('base64url')}!`;

const REFERENCE_TYPES = ['authority', 'school', 'rank', 'unit', 'service_status', 'category'];

const assertConfiguredValue = async (itemType, value, { optional = false } = {}) => {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized && optional) return null;
    const [rows] = await pool.execute(
        `SELECT id FROM scms_reference_items
         WHERE item_type = ? AND name = ? AND is_active = TRUE`,
        [itemType, normalized]
    );
    if (rows.length === 0) {
        const error = new Error(`${normalized || 'The supplied value'} is not an active configured ${itemType.replace('_', ' ')}.`);
        error.status = 400;
        throw error;
    }
    return normalized;
};

// ==================== AUTH ROUTES ====================

// Public, read-only choices used by registration forms. No sensitive configuration is exposed.
app.get('/api/config/reference-data', async (_req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT item_type, code, name, description, sort_order
             FROM scms_reference_items
             WHERE is_active = TRUE
             ORDER BY item_type, sort_order, name`
        );
        const items = Object.fromEntries(REFERENCE_TYPES.map(type => [type, []]));
        for (const row of rows) {
            if (items[row.item_type]) items[row.item_type].push({ code: row.code, name: row.name, description: row.description || '' });
        }
        res.json({ items });
    } catch (error) {
        console.error('Failed to load registration configuration:', error);
        res.status(500).json({ error: 'Registration configuration is unavailable' });
    }
});

// Self-registration (New User)
app.post('/api/auth/signup', authLimiter, async (req, res) => {
    const { email, password, parentName, pNoONo, rankRate, unit, contactNo, cnic, serviceStatus, adminAuthority } = req.body;
    
    // Ensure all optional fields have default values
    const safeRankRate = rankRate?.trim() || null;
    const safeUnit = unit?.trim() || null;
    const safeContactNo = contactNo || null;
    const safeServiceStatus = serviceStatus || 'Serving';
    const safeAdminAuthority = adminAuthority?.trim() || null;
    
    const connection = await pool.getConnection();
    try {
        if (!email || !password || !parentName || !pNoONo || !cnic) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        await Promise.all([
            assertConfiguredValue('rank', safeRankRate, { optional: true }),
            assertConfiguredValue('unit', safeUnit, { optional: true }),
            assertConfiguredValue('authority', safeAdminAuthority, { optional: true }),
            assertConfiguredValue('service_status', safeServiceStatus)
        ]);

        const [existing] = await connection.execute(
            'SELECT P_No_O_No, Email, Status FROM parent_beneficiary WHERE P_No_O_No = ? OR Email = ?',
            [pNoONo, email]
        );
        
        if (existing.length > 0) {
            const existingUser = existing[0];
            if (existingUser.P_No_O_No === pNoONo) {
                if (existingUser.Status === 'pending') {
                    return res.status(409).json({
                        error: 'This account is already registered and pending authorization from PNBA staff.',
                        status: 'pending'
                    });
                }
                return res.status(409).json({ 
                    error: 'This P.No/O.No is already registered. Please login instead.' 
                });
            }
            if (existingUser.Email === email) {
                return res.status(409).json({ 
                    error: 'This email is already registered. Please use a different email.' 
                });
            }
        }

        const hashedPassword = await hashPassword(password);
        const verificationToken = crypto.randomBytes(32).toString('hex');
        await connection.beginTransaction();

        // Insert new user into parent_beneficiary with ALL fields
        const [result] = await connection.execute(
            `INSERT INTO parent_beneficiary 
             (P_No_O_No, Parent_Name, Rank_Rate, Unit, Admin_Authority, Service_Status, Parent_CNIC, Contact_No, Email, Password_Hash, Status, Origin, Created_At)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [pNoONo, parentName, safeRankRate, safeUnit, safeAdminAuthority, safeServiceStatus, cnic, safeContactNo, email, hashedPassword, 'pending', 'self_registered']
        );
        await syncParentIdentifiers(connection, pNoONo, cnic, { source: 'self_registration', verified: false });
        await refreshParentCompleteness(connection, pNoONo);

        // Create approval request
        console.log('Creating approval request for user:', pNoONo);
        const approvalPayload = JSON.stringify({
            email, parentName, pNoONo, rankRate: safeRankRate, unit: safeUnit, contactNo: safeContactNo, cnic, serviceStatus: safeServiceStatus,
            origin: 'self_registered',
            adminAuthority: safeAdminAuthority
        });
        
        const [approvalResult] = await connection.execute(
            `INSERT INTO Approval_Requests (user_id, request_type, payload, status, created_at) 
             VALUES (?, 'parent_registration', ?, 'pending', NOW())`,
            [pNoONo, approvalPayload]
        );
        
        console.log('Approval request created with ID:', approvalResult.insertId);
        await connection.commit();

        res.status(201).json({ 
            message: 'Registration submitted for admin approval',
            userId: result.insertId,
            loginId: pNoONo
        });

    } catch (error) {
        await connection.rollback();
        if (error.status) return res.status(error.status).json({ error: error.message, code: error.publicCode });
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Email or P.No/O.No already registered' });
        }
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Registration failed' });
    } finally {
        connection.release();
    }
});

// Unified Login (PN Number + Password)
app.post('/api/auth/login', authLimiter, async (req, res) => {
    const { pNoONo, password } = req.body;

    if (!pNoONo || !password) {
        return res.status(400).json({ error: 'P.No/O.No and password required' });
    }

    try {
        const [users] = await pool.execute(
            `SELECT P_No_O_No, Parent_Name, Email, Rank_Rate, Unit, Contact_No, Parent_CNIC,
                    Service_Status, Status, Origin, Password_Hash, Default_Password_Changed,
                    Must_Change_Password, Temporary_Password_Expires_At, Credential_Version
             FROM parent_beneficiary WHERE P_No_O_No = ?`,
            [pNoONo]
        );

        const user = users[0];
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Imported accounts are activated only through an audited one-time credential reset.
        if (!user.Password_Hash) {
            return res.status(403).json({ error: 'Portal access has not been activated. Contact authorized staff for a one-time password.', status: 'activation_required' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.Password_Hash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        if (user.Must_Change_Password && (!user.Temporary_Password_Expires_At || new Date(user.Temporary_Password_Expires_At).getTime() <= Date.now())) {
            return res.status(403).json({ error: 'This one-time password has expired. Contact authorized staff for another.', status: 'temporary_password_expired' });
        }

        if (user.Status === 'pending') {
            return res.status(403).json({
                error: 'Your account is pending authorization from PNBA staff. Please try again after it has been reviewed.',
                status: 'pending'
            });
        }

        if (user.Status === 'rejected') {
            return res.status(403).json({ error: 'Account was rejected. Contact admin.', status: 'rejected' });
        }
        if (user.Status === 'blocked') {
            return res.status(403).json({ error: 'Online access is blocked. Contact the office.', status: 'blocked' });
        }

        // Log login attempt (you may need to create this table if it doesn't exist)
        try {
            await pool.execute(
                'INSERT INTO Portal_Login_History (user_id, login_status, ip_address, details) VALUES (?, ?, ?, ?)',
                [user.P_No_O_No, 'LOGIN_SUCCESS', req.ip, JSON.stringify({ origin: user.Origin, email: user.Email })]
            );
        } catch (logError) {
            console.warn('Login history logging failed (table may not exist):', logError.message);
        }

        const token = jwt.sign(
            { 
                userId: user.P_No_O_No, 
                pNoONo: user.P_No_O_No,
                email: user.Email,
                parentName: user.Parent_Name,
                credentialVersion: Number(user.Credential_Version)
            },
            process.env.PORTAL_JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.P_No_O_No,
                name: user.Parent_Name,
                email: user.Email,
                pNoONo: user.P_No_O_No,
                rankRate: user.Rank_Rate,
                unit: user.Unit,
                contactNo: user.Contact_No,
                cnic: user.Parent_CNIC,
                serviceStatus: user.Service_Status,
                status: user.Status,
                origin: user.Origin,
                defaultPasswordChanged: user.Default_Password_Changed,
                mustChangePassword: Boolean(user.Must_Change_Password)
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});


// ==================== CHILD MANAGEMENT ====================

app.get('/api/document-workspace', authenticateToken, async (req, res) => {
    try {
        const workspace = await loadDocumentWorkspace(pool, req.query.ownerType, req.query.ownerId);
        if (workspace.owner.parentPNo !== req.user.pNoONo) return res.status(404).json({ error: 'Record not found' });
        res.json(workspace);
    } catch (error) {
        const status = Number(error.status) || 500;
        res.status(status).json({ error: error.publicCode ? error.message : 'Unable to load document workspace', code: error.publicCode });
    }
});

app.post('/api/document-files', authenticateToken, (req, res) => {
    phaseTwoUpload.single('file')(req, res, async uploadError => {
        if (uploadError) return res.status(uploadError.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: uploadError.message });
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const owner = await resolveDocumentOwner(connection, req.body.ownerType, req.body.ownerId);
            if (owner.parentPNo !== req.user.pNoONo) {
                const error = new Error('Record not found');
                error.status = 404;
                error.publicCode = 'NOT_FOUND';
                throw error;
            }
            const stored = await storeDocumentFile(connection, {
                file: req.file,
                documentTypeId: req.body.documentTypeId,
                ownerType: req.body.ownerType,
                ownerId: req.body.ownerId,
                expiresOn: req.body.expiresOn,
                uploaderType: 'parent',
                uploaderId: req.user.pNoONo
            });
            await connection.query(
                `INSERT INTO scms_audit_events
                  (action, entity_type, entity_id, correlation_id, details)
                 VALUES ('document.uploaded', 'document_file', ?, UUID(), JSON_OBJECT('parent', ?, 'ownerType', ?, 'ownerId', ?))`,
                [String(stored.id), req.user.pNoONo, owner.ownerType, owner.ownerId]
            );
            await connection.commit();
            res.status(201).json({ id: stored.id });
        } catch (error) {
            await connection.rollback();
            res.status(Number(error.status) || 500).json({ error: error.publicCode ? error.message : 'Upload failed', code: error.publicCode });
        } finally {
            connection.release();
        }
    });
});

app.get('/api/document-files/:id/content', authenticateToken, async (req, res) => {
    try {
        const content = await documentFilePath(pool, req.params.id);
        if (content.record.parent_p_no_o_no !== req.user.pNoONo) return res.status(404).json({ error: 'Document not found' });
        res.type(content.record.verified_mime_type);
        res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(content.record.original_file_name)}`);
        res.sendFile(content.path);
    } catch (error) {
        res.status(Number(error.status) || 500).json({ error: error.publicCode ? error.message : 'Document content is unavailable' });
    }
});

app.post('/api/form-submissions', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const owner = await resolveDocumentOwner(connection, req.body?.ownerType, req.body?.ownerId);
        if (owner.parentPNo !== req.user.pNoONo) {
            const error = new Error('Record not found');
            error.status = 404;
            error.publicCode = 'NOT_FOUND';
            throw error;
        }
        const [[version]] = await connection.query(
            `SELECT v.*, t.entity_scope FROM scms_form_template_versions v
             INNER JOIN scms_form_templates t ON t.id = v.form_template_id
             WHERE v.id = ? AND t.status = 'published'`,
            [Number(req.body?.templateVersionId)]
        );
        if (!version || version.entity_scope !== owner.ownerType) {
            const error = new Error('Form template not found');
            error.status = 404;
            error.publicCode = 'FORM_TEMPLATE_NOT_FOUND';
            throw error;
        }
        const schema = typeof version.schema_json === 'string' ? JSON.parse(version.schema_json) : version.schema_json;
        const response = validateFormResponse(schema, req.body?.response);
        const [[latest]] = await connection.query(
            `SELECT revision_number, status FROM scms_form_submissions
             WHERE form_template_id = ? AND owner_type = ? AND owner_id = ?
             ORDER BY revision_number DESC LIMIT 1 FOR UPDATE`,
            [version.form_template_id, owner.ownerType, owner.ownerId]
        );
        if (latest && latest.status !== 'changes_required') {
            const error = new Error(latest.status === 'verified' ? 'This form has already been verified.' : 'This form is already awaiting staff review.');
            error.status = 409;
            error.publicCode = 'FORM_ALREADY_SUBMITTED';
            throw error;
        }
        const [result] = await connection.query(
            `INSERT INTO scms_form_submissions
              (form_template_id, form_template_version_id, owner_type, owner_id, parent_p_no_o_no,
               revision_number, status, response_json, submitted_by_type, submitted_by_id, submitted_at)
             VALUES (?, ?, ?, ?, ?, ?, 'submitted', ?, 'parent', ?, CURRENT_TIMESTAMP(3))`,
            [version.form_template_id, version.id, owner.ownerType, owner.ownerId, owner.parentPNo,
                Number(latest?.revision_number || 0) + 1, JSON.stringify(response), req.user.pNoONo]
        );
        await connection.query(
            `INSERT INTO scms_audit_events (action, entity_type, entity_id, correlation_id, details)
             VALUES ('form.submitted', 'form_submission', ?, UUID(), JSON_OBJECT('parent', ?, 'templateVersion', ?))`,
            [String(result.insertId), req.user.pNoONo, version.id]
        );
        await connection.commit();
        res.status(201).json({ id: Number(result.insertId) });
    } catch (error) {
        await connection.rollback();
        res.status(Number(error.status) || 500).json({ error: error.publicCode ? error.message : 'Form submission failed', code: error.publicCode });
    } finally {
        connection.release();
    }
});

app.get('/api/message-threads', authenticateToken, async (req, res) => {
    try {
        const owner = await resolveDocumentOwner(pool, req.query.ownerType, req.query.ownerId);
        if (owner.parentPNo !== req.user.pNoONo) return res.status(404).json({ error: 'Record not found' });
        const [threads] = await pool.execute(
            'SELECT * FROM scms_message_threads WHERE owner_type = ? AND owner_id = ? ORDER BY updated_at DESC',
            [owner.ownerType, owner.ownerId]
        );
        for (const thread of threads) {
            const [messages] = await pool.execute(
                'SELECT id, sender_type, sender_id, body, created_at FROM scms_messages WHERE thread_id = ? AND is_internal = FALSE ORDER BY created_at',
                [thread.id]
            );
            thread.messages = messages;
        }
        res.json(threads);
    } catch (error) {
        res.status(Number(error.status) || 500).json({ error: error.publicCode ? error.message : 'Unable to load messages' });
    }
});

app.post('/api/message-threads', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const subject = String(req.body?.subject || '').trim();
        const body = String(req.body?.body || '').trim();
        if (!subject || !body) return res.status(400).json({ error: 'Subject and first message are required' });
        await connection.beginTransaction();
        const owner = await resolveDocumentOwner(connection, req.body?.ownerType, req.body?.ownerId);
        if (owner.parentPNo !== req.user.pNoONo) {
            const error = new Error('Record not found'); error.status = 404; error.publicCode = 'NOT_FOUND'; throw error;
        }
        const [thread] = await connection.query(
            `INSERT INTO scms_message_threads
              (owner_type, owner_id, parent_p_no_o_no, subject, created_by_type, created_by_id)
             VALUES (?, ?, ?, ?, 'parent', ?)`,
            [owner.ownerType, owner.ownerId, owner.parentPNo, subject.slice(0,200), req.user.pNoONo]
        );
        await connection.query(
            `INSERT INTO scms_messages (thread_id, sender_type, sender_id, body, is_internal)
             VALUES (?, 'parent', ?, ?, FALSE)`,
            [thread.insertId, req.user.pNoONo, body.slice(0,4000)]
        );
        await connection.commit();
        res.status(201).json({ id: Number(thread.insertId) });
    } catch (error) {
        await connection.rollback();
        res.status(Number(error.status) || 500).json({ error: error.publicCode ? error.message : 'Unable to create message thread' });
    } finally { connection.release(); }
});

app.post('/api/message-threads/:id/messages', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const body = String(req.body?.body || '').trim();
        if (!body) return res.status(400).json({ error: 'Message text is required' });
        await connection.beginTransaction();
        const [[thread]] = await connection.query('SELECT * FROM scms_message_threads WHERE id = ? FOR UPDATE', [Number(req.params.id)]);
        if (!thread || thread.parent_p_no_o_no !== req.user.pNoONo || thread.status !== 'open') {
            const error = new Error('Message thread not found'); error.status = 404; error.publicCode = 'THREAD_NOT_FOUND'; throw error;
        }
        await connection.query(
            `INSERT INTO scms_messages (thread_id, sender_type, sender_id, body, is_internal)
             VALUES (?, 'parent', ?, ?, FALSE)`,
            [thread.id, req.user.pNoONo, body.slice(0,4000)]
        );
        await connection.query('UPDATE scms_message_threads SET updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [thread.id]);
        await connection.commit();
        res.status(204).send();
    } catch (error) {
        await connection.rollback();
        res.status(Number(error.status) || 500).json({ error: error.publicCode ? error.message : 'Unable to send message' });
    } finally { connection.release(); }
});

app.post('/api/children', authenticateToken, async (req, res) => {
    const { childName, age, cnicBformNo, diseaseDisability, disabilityCategory, school } = req.body;

    try {
        if (!childName?.trim() || !cnicBformNo?.trim() || !disabilityCategory?.trim() || !school?.trim()) {
            return res.status(400).json({ error: 'Child name, CNIC/B-Form, category, and school are required' });
        }
        await Promise.all([
            assertConfiguredValue('category', disabilityCategory),
            assertConfiguredValue('school', school)
        ]);
        // Create a resumable draft. It enters the staff queue only after final submission.
        console.log('Adding child for parent:', req.user.pNoONo);
        const [result] = await pool.execute(
            `INSERT INTO dependent_children
              (P_No_O_No, Child_Name, Age, CNIC_BForm_No, Disease_Disability,
               Parent_Selected_Category, Approved_Category, Disability_Category, School, Status)
             VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, 'draft')`,
            [req.user.pNoONo, childName, age, cnicBformNo, diseaseDisability?.trim() || null, disabilityCategory, school]
        );
        await refreshChildCompleteness(pool, result.insertId);
        
        console.log('Child draft added with ID:', result.insertId);

        res.status(201).json({ 
            message: 'Child draft saved. Complete its configured requirements before submission.',
            child_id: result.insertId,
            status: 'draft'
        });
    } catch (error) {
        if (error.status === 400) return res.status(400).json({ error: error.message });
        console.error('Failed to add child:', error);
        res.status(500).json({ error: 'Failed to add child' });
    }
});

app.post('/api/children/:childId/submit', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [[child]] = await connection.query(
            'SELECT Child_ID, P_No_O_No, Status FROM dependent_children WHERE Child_ID = ? FOR UPDATE',
            [Number(req.params.childId)]
        );
        if (!child || child.P_No_O_No !== req.user.pNoONo) {
            const error = new Error('Child record not found'); error.status = 404; error.publicCode = 'CHILD_NOT_FOUND'; throw error;
        }
        if (!['draft', 'changes_required'].includes(child.Status)) {
            const error = new Error('This child registration has already been submitted.'); error.status = 409; error.publicCode = 'CHILD_ALREADY_SUBMITTED'; throw error;
        }
        const workspace = await loadDocumentWorkspace(connection, 'child', child.Child_ID);
        const missing = missingRequiredUploads(workspace);
        if (missing.length) {
            const error = new Error(`Complete the required uploads before submission: ${missing.map(item => item.name).join(', ')}.`);
            error.status = 409; error.publicCode = 'REQUIRED_DOCUMENTS_MISSING'; throw error;
        }
        await connection.query("UPDATE dependent_children SET Status = 'pending' WHERE Child_ID = ?", [child.Child_ID]);
        await connection.query(
            `INSERT INTO scms_audit_events (action, entity_type, entity_id, correlation_id, details)
             VALUES ('child_registration.submitted', 'child', ?, UUID(), JSON_OBJECT('parent', ?))`,
            [String(child.Child_ID), req.user.pNoONo]
        );
        await connection.commit();
        res.json({ status: 'pending', message: 'Child registration submitted for staff review.' });
    } catch (error) {
        await connection.rollback();
        res.status(Number(error.status) || 500).json({ error: error.publicCode ? error.message : 'Unable to submit child registration', code: error.publicCode });
    } finally { connection.release(); }
});

app.get('/api/children', authenticateToken, async (req, res) => {
    try {
        const [children] = await pool.execute(
            `SELECT Child_ID, Child_Name, Age, CNIC_BForm_No, Disease_Disability, 
                    Disability_Category, Parent_Selected_Category, Approved_Category,
                    School, Disability_Certificate_No, Authority, Status
             FROM dependent_children 
             WHERE P_No_O_No = ? 
             ORDER BY Child_ID DESC`,
            [req.user.pNoONo]
        );
        
        // Transform the data to match the frontend expectations
        const transformedChildren = children.map(child => ({
            child_id: child.Child_ID,
            child_name: child.Child_Name,
            age: child.Age,
            cnic_bform_no: child.CNIC_BForm_No,
            disease_disability: child.Disease_Disability,
            disability_category: child.Approved_Category || child.Parent_Selected_Category,
            parent_selected_category: child.Parent_Selected_Category,
            approved_category: child.Approved_Category,
            school: child.School,
            status: child.Status,
            assessment_performa: null, // These would be stored in separate tables
            application_form: null,
            disability_certificate: child.Disability_Certificate_No,
            identity_proof: null
        }));
        
        res.json(transformedChildren || []);
    } catch (error) {
        console.error('Failed to fetch children:', error);
        res.status(500).json({ error: 'Failed to fetch children' });
    }
});

// GET: Check if CNIC/B-Form already exists
app.get('/api/children/check-cnic', authenticateToken, async (req, res) => {
    const { cnic } = req.query;
    if (!cnic) {
        return res.status(400).json({ error: 'CNIC required' });
    }

    try {
        const [existing] = await pool.execute(
            'SELECT Child_ID FROM dependent_children WHERE CNIC_BForm_No = ?',
            [cnic]
        );
        res.json({ found: existing.length > 0 });
    } catch (error) {
        res.status(500).json({ error: 'Failed to check CNIC' });
    }
});

// POST: Admin update child status
app.post('/api/admin/update-child-status/:childId', authenticateToken, async (req, res) => {
    try {
        const { childId } = req.params;
        const { status } = req.body;
        
        if (!['pending', 'approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        // Update child status
        await pool.execute(
            'UPDATE dependent_children SET Status = ? WHERE Child_ID = ?',
            [status, childId]
        );
        
        res.json({ 
            message: `Child status updated to ${status} successfully`,
            child_id: childId,
            status: status
        });
        
    } catch (error) {
        console.error('Failed to update child status:', error);
        res.status(500).json({ error: 'Failed to update child status' });
    }
});

// GET: Admin get all children with status
app.get('/api/admin/children', authenticateToken, async (req, res) => {
    try {
        const [children] = await pool.execute(
            `SELECT dc.*, pb.Parent_Name 
             FROM dependent_children dc 
             LEFT JOIN parent_beneficiary pb ON dc.P_No_O_No = pb.P_No_O_No 
             ORDER BY dc.Created_At DESC`
        );
        
        res.json(children);
    } catch (error) {
        console.error('Failed to fetch children:', error);
        res.status(500).json({ error: 'Failed to fetch children' });
    }
});

// Retired fixed-type upload path. The configurable, versioned document endpoint replaces it.
app.post('/api/children/:childId/documents', authenticateToken, (_req, res) => {
    res.status(410).json({ error: 'This upload workflow has been retired. Reload the portal to use configured document requirements.' });
});

// Legacy implementation retained temporarily for data-migration reference; unreachable because of the 410 route above.
app.post('/api/children/:childId/documents', authenticateToken, upload.single('file'), async (req, res) => {
    const { childId } = req.params;
    const { documentType, identifier } = req.body;
    
    // Use authenticated user's P_No_O_No from JWT (most reliable)
    const pNoONo = req.user.pNoONo;
    
    // Debug logging
    console.log('Upload request received:');
    console.log('req.body:', req.body);
    console.log('pNoONo from JWT:', pNoONo);
    console.log('documentType:', documentType);
    console.log('identifier:', identifier);
    console.log('req.file:', req.file ? { path: req.file.path, filename: req.file.filename } : 'No file');
    
    // Validate required fields
    if (!documentType || !identifier) {
        return res.status(400).json({ 
            error: 'Missing required fields',
            details: { documentType, identifier }
        });
    }
    
    const validTypes = ['assessment_performa', 'application_form', 'disability_certificate', 'identity_proof'];
    if (!validTypes.includes(documentType)) {
        return res.status(400).json({ error: 'Invalid document type' });
    }

    try {
        // Verify child belongs to this parent
        const [children] = await pool.execute(
            'SELECT P_No_O_No FROM dependent_children WHERE Child_ID = ?',
            [childId]
        );
        if (children.length === 0 || children[0].P_No_O_No !== pNoONo) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Move file from temp to correct PN folder
        const targetDir = path.join(UPLOAD_DIR, pNoONo);
        await fs.mkdir(targetDir, { recursive: true });
        
        const sourcePath = req.file.path;
        const targetPath = path.join(targetDir, req.file.filename);
        
        console.log('Moving file from:', sourcePath, 'to:', targetPath);
        await fs.rename(sourcePath, targetPath);
        
        // Update req.file.path to reflect new location
        req.file.path = targetPath;

        const filePath = `/scmsForms/${pNoONo}/${req.file.filename}`;

        // Upsert document record
        await pool.execute(
            `INSERT INTO parent_document_files (P_No_O_No, Doc_Type, Original_File_Name, Stored_File_Name, Mime_Type, File_Size_Bytes, Storage_Path) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [pNoONo, documentType, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, filePath]
        );

        res.json({ 
            success: true, 
            documentType,
            filePath,
            fileName: req.file.filename
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// GET: Documents for a child
app.get('/api/children/:childId/documents', async (req, res) => {
    const { childId } = req.params;
    console.log('Portal: Documents request for childId:', childId);
    console.log('Portal: Request headers:', req.headers);
    
    // Check for API key authentication (for admin server)
    const apiKey = req.headers['x-api-key'];
    console.log('Portal: API key received:', apiKey);
    console.log('Portal: Expected API key:', process.env.ADMIN_API_KEY);
    
    const useApiKey = apiKey === process.env.ADMIN_API_KEY;
    console.log('Portal: Using API key auth:', useApiKey);
    
    // If not using API key, check for JWT authentication
    if (!useApiKey) {
        console.log('Portal: Checking JWT authentication...');
        // Use a proper JWT authentication check
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            console.log('Portal: No token provided');
            return res.status(401).json({ error: 'Access denied' });
        }
        
        try {
            const decoded = jwt.verify(token, process.env.PORTAL_JWT_SECRET);
            req.user = decoded;
            console.log('Portal: JWT authenticated successfully');
        } catch (err) {
            console.log('Portal: JWT authentication failed:', err.message);
            return res.status(401).json({ error: 'Access denied' });
        }
    } else {
        console.log('Portal: API key authentication successful');
    }
    
    try {
        // First get the child's P_No_O_No from dependent_children
        const [children] = await pool.execute(
            'SELECT P_No_O_No FROM dependent_children WHERE Child_ID = ?',
            [childId]
        );
        
        if (children.length === 0) {
            console.log('Portal: No child found with ID:', childId);
            return res.json([]);
        }
        
        const pNoONo = children[0].P_No_O_No;
        if (!useApiKey && req.user?.pNoONo !== pNoONo) {
            return res.status(404).json({ error: 'Documents not found' });
        }
        console.log('Portal: Found P_No_O_No:', pNoONo, 'for childId:', childId);
        
        // Query documents from parent_document_files using P_No_O_No
        const [docs] = await pool.execute(
            `SELECT Doc_Type as document_type, Storage_Path as file_path, Original_File_Name as original_name, Uploaded_At as uploaded_at  
              FROM parent_document_files WHERE P_No_O_No = ?`,
            [pNoONo]
        );
        console.log('Portal: Documents found:', docs.length);
        console.log('Portal: Documents data:', docs);
        res.json(docs);
    } catch (error) {
        console.error('Portal: Failed to fetch documents:', error);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

// GET: Serve document image (for popup/view)
app.get('/api/documents/view', async (req, res) => {
    const { path: filePath } = req.query;
    console.log('Portal: Document view request for path:', filePath);
    
    // Check for API key authentication (for admin server)
    const apiKey = req.headers['x-api-key'];
    const useApiKey = apiKey === process.env.ADMIN_API_KEY;
    
    // If not using API key, check for JWT authentication
    if (!useApiKey) {
        console.log('Portal: Checking JWT authentication for document view...');
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            console.log('Portal: No token provided for document view');
            return res.status(401).json({ error: 'Access denied' });
        }
        
        try {
            const decoded = jwt.verify(token, process.env.PORTAL_JWT_SECRET);
            req.user = decoded;
            console.log('Portal: JWT authenticated successfully for document view');
        } catch (err) {
            console.log('Portal: JWT authentication failed for document view:', err.message);
            return res.status(401).json({ error: 'Access denied' });
        }
    } else {
        console.log('Portal: API key authentication successful for document view');
    }
    
    if (!filePath) return res.status(400).json({ error: 'Path required' });

    if (!useApiKey) {
        const [ownedFiles] = await pool.execute(
            'SELECT Document_File_ID FROM parent_document_files WHERE P_No_O_No = ? AND Storage_Path = ?',
            [req.user.pNoONo, filePath]
        );
        if (ownedFiles.length === 0) return res.status(404).json({ error: 'Document not found' });
    }
    
    // Security: ensure path is within UPLOAD_DIR
    // Try PN folder first (new structure)
    const pnFolder = path.basename(path.dirname(filePath));
    const fileName = path.basename(filePath);
    const fullPath = path.join(UPLOAD_DIR, pnFolder, fileName);
    
    console.log('Portal: Looking for file at:', fullPath);
    
    try {
        await fs.access(fullPath);
        console.log('Portal: File found in PN folder, sending:', fullPath);
        return res.sendFile(fullPath);
    } catch (error) {
        console.log('Portal: File not in PN folder, checking temp...');
    }
    
    // Fall back to temp folder (legacy files)
    const tempPath = path.join(UPLOAD_DIR, 'temp', fileName);
    console.log('Portal: Checking temp folder:', tempPath);
    
    try {
        await fs.access(tempPath);
        console.log('Portal: File found in temp folder, sending:', tempPath);
        return res.sendFile(tempPath);
    } catch (error) {
        console.log('Portal: File not found in temp either:', tempPath);
        res.status(404).json({ error: 'File not found' });
    }
});

// ==================== PROFILE & STATUS ====================

app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const [users] = await pool.execute(
            `SELECT P_No_O_No, Parent_Name, Email, Rank_Rate, Unit,
                    Admin_Authority, Contact_No, Parent_CNIC, Service_Status, Status, Origin,
                    Default_Password_Changed, Created_At, Approved_At, Address,
                    Record_State, Missing_Fields, Is_Provisional, Block_Reason
             FROM parent_beneficiary WHERE P_No_O_No = ?`,
            [req.user.pNoONo]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];
        const [changeRequests] = await pool.execute(
            `SELECT id, proposed_values, status, parent_message, review_reason, submitted_at, reviewed_at
             FROM scms_parent_change_requests WHERE parent_p_no_o_no = ?
             ORDER BY submitted_at DESC LIMIT 10`,
            [req.user.pNoONo]
        );
        const missingFields = typeof user.Missing_Fields === 'string' ? JSON.parse(user.Missing_Fields) : user.Missing_Fields || [];
        res.json({
            // snake_case keys (used by Profile.jsx)
            user_id: user.P_No_O_No,
            email: user.Email,
            parent_name: user.Parent_Name,
            p_no_o_no: user.P_No_O_No,
            rank_rate: user.Rank_Rate,
            unit: user.Unit,
            admin_authority: user.Admin_Authority,
            contact_no: user.Contact_No,
            cnic: user.Parent_CNIC,
            service_status: user.Service_Status,
            status: user.Status,
            origin: user.Origin,
            default_password_changed: user.Default_Password_Changed,
            created_at: user.Created_At,
            approved_at: user.Approved_At,
            address: user.Address,
            record_state: user.Record_State,
            missing_fields: missingFields,
            is_provisional: Boolean(user.Is_Provisional),
            block_reason: user.Block_Reason,
            change_requests: changeRequests.map(request => ({
                id: request.id,
                proposedValues: request.proposed_values,
                status: request.status,
                parentMessage: request.parent_message || '',
                reviewReason: request.review_reason || '',
                submittedAt: request.submitted_at,
                reviewedAt: request.reviewed_at
            })),
            tag: user.Origin === 'admin_created' ? 'Admin Created' : 'New User',
            tagColor: user.Origin === 'admin_created' ? '#1976d2' : '#ed6c02',
            // camelCase aliases (used by AccountManagement.jsx)
            pNoONo: user.P_No_O_No,
            parentName: user.Parent_Name,
            contactNo: user.Contact_No,
            rankRate: user.Rank_Rate,
            unit: user.Unit,
            adminAuthority: user.Admin_Authority,
            serviceStatus: user.Service_Status,
            createdAt: user.Created_At,
            approvedAt: user.Approved_At
        });

    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ error: 'Failed to load profile' });
    }
});

app.get('/api/profile/configuration', authenticateToken, async (_req, res) => {
    try {
        const policies = await loadParentFieldPolicies(pool);
        const [rows] = await pool.execute(
            `SELECT item_type, code, name FROM scms_reference_items
             WHERE is_active = TRUE ORDER BY item_type, sort_order, name`
        );
        const references = Object.fromEntries(REFERENCE_TYPES.map(type => [type, []]));
        for (const row of rows) {
            if (references[row.item_type]) references[row.item_type].push({ code: row.code, name: row.name });
        }
        res.json({ policies, references });
    } catch (error) {
        console.error('Profile configuration fetch failed:', error);
        res.status(500).json({ error: 'Profile configuration is unavailable' });
    }
});

app.get('/api/status', authenticateToken, async (req, res) => {
    try {
        const [user] = await pool.execute(
            'SELECT Status, Approved_At, Block_Reason FROM parent_beneficiary WHERE P_No_O_No = ?',
            [req.user.pNoONo]
        );
        const [registrationRequests] = await pool.execute(
            `SELECT id, request_type, status, admin_response, created_at, processed_at
             FROM Approval_Requests WHERE user_id = ? ORDER BY created_at DESC`,
            [req.user.pNoONo]
        );
        const [changeRequests] = await pool.execute(
            `SELECT id, status, proposed_values, parent_message, review_reason,
                    submitted_at AS created_at, reviewed_at AS processed_at
             FROM scms_parent_change_requests WHERE parent_p_no_o_no = ? ORDER BY submitted_at DESC`,
            [req.user.pNoONo]
        );
        res.json({ 
            accountStatus: { 
                status: user[0]?.Status || 'unknown', 
                admin_notes: user[0]?.Block_Reason || '',
                approved_at: user[0]?.Approved_At || null
            }, 
            requests: [
                ...registrationRequests,
                ...changeRequests.map(request => ({ ...request, request_type: 'parent_field_change', admin_response: request.review_reason }))
            ]
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch status' });
    }
});

// NOTE: Duplicate /api/profile route removed — merged into the single handler above

// PUT: Update profile information
app.put('/api/profile/update', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const pNoONo = req.user.pNoONo;
        const policies = await loadParentFieldPolicies(connection);
        await connection.beginTransaction();
        const [parentRows] = await connection.query('SELECT * FROM parent_beneficiary WHERE P_No_O_No = ? FOR UPDATE', [pNoONo]);
        const parent = parentRows[0];
        if (!parent) {
            const error = new Error('Parent account not found');
            error.status = 404;
            throw error;
        }

        const directChanges = {};
        const approvalChanges = {};
        const currentApprovalValues = {};
        for (const policy of policies) {
            if (!Object.prototype.hasOwnProperty.call(req.body, policy.fieldCode)) continue;
            const column = PARENT_FIELD_COLUMNS[policy.fieldCode];
            if (!column || policy.updateMode === 'locked') continue;
            const normalized = typeof req.body[policy.fieldCode] === 'string' ? req.body[policy.fieldCode].trim() : '';
            if (policy.isRequired && !normalized) {
                const error = new Error(`${policy.label} is required`);
                error.status = 400;
                throw error;
            }
            if (policy.fieldCode === 'cnic' && normalized && !/^\d{13}$/.test(normalized.replace(/\D/g, ''))) {
                const error = new Error('CNIC must contain exactly 13 digits');
                error.status = 400;
                throw error;
            }
            if (policy.fieldCode === 'email' && normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
                const error = new Error('Enter a valid email address');
                error.status = 400;
                throw error;
            }
            if (policy.referenceType) await assertConfiguredValue(policy.referenceType, normalized, { optional: !policy.isRequired });
            if (String(parent[column] || '') === normalized) continue;
            if (policy.updateMode === 'direct') directChanges[policy.fieldCode] = normalized || null;
            if (policy.updateMode === 'approval') {
                approvalChanges[policy.fieldCode] = normalized || null;
                currentApprovalValues[policy.fieldCode] = parent[column] ?? null;
            }
        }
        if (Object.keys(directChanges).length === 0 && Object.keys(approvalChanges).length === 0) {
            const error = new Error('No fields to update');
            error.status = 400;
            throw error;
        }

        if (Object.keys(directChanges).length > 0) {
            const entries = Object.entries(directChanges);
            await connection.query(
                `UPDATE parent_beneficiary SET ${entries.map(([field]) => `${PARENT_FIELD_COLUMNS[field]} = ?`).join(', ')} WHERE P_No_O_No = ?`,
                [...entries.map(([, value]) => value), pNoONo]
            );
        }

        let requestId = null;
        if (Object.keys(approvalChanges).length > 0) {
            const [existing] = await connection.query(
                `SELECT id FROM scms_parent_change_requests
                 WHERE parent_p_no_o_no = ? AND status = 'pending' FOR UPDATE`,
                [pNoONo]
            );
            if (existing.length > 0) {
                const error = new Error('A profile change request is already pending review.');
                error.status = 409;
                throw error;
            }
            const [result] = await connection.query(
                `INSERT INTO scms_parent_change_requests
                  (parent_p_no_o_no, current_values, proposed_values, parent_message)
                 VALUES (?, ?, ?, ?)`,
                [pNoONo, JSON.stringify(currentApprovalValues), JSON.stringify(approvalChanges), String(req.body.parentMessage || '').trim().slice(0, 1000) || null]
            );
            requestId = Number(result.insertId);
            if (parent.Status === 'changes_required') {
                await connection.query("UPDATE parent_beneficiary SET Status = 'pending' WHERE P_No_O_No = ?", [pNoONo]);
            }
        }
        await refreshParentCompleteness(connection, pNoONo);
        await connection.commit();
        res.json({
            message: requestId ? 'Direct fields were saved and controlled changes were submitted for review.' : 'Profile updated successfully.',
            directFields: Object.keys(directChanges),
            requestId
        });
    } catch (error) {
        await connection.rollback();
        if (error.status) return res.status(error.status).json({ error: error.message });
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That email or identifier is already used by another account.' });
        console.error('Profile update error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    } finally {
        connection.release();
    }
});

// POST: Change password
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const pNoONo = req.user.pNoONo;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current password and new password are required' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters' });
        }

        // Get current user with password
        const [users] = await pool.execute(
            'SELECT Password_Hash FROM parent_beneficiary WHERE P_No_O_No = ?',
            [pNoONo]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];

        // If user doesn't have a password (admin created), set the new password
        if (!user.Password_Hash) {
            const hashedPassword = await bcrypt.hash(newPassword, 12);
            await pool.execute(
                `UPDATE parent_beneficiary SET Password_Hash = ?, Default_Password_Changed = true,
                 Must_Change_Password = false, Temporary_Password_Expires_At = NULL,
                 Credential_Version = Credential_Version + 1 WHERE P_No_O_No = ?`,
                [hashedPassword, pNoONo]
            );
            res.json({ message: 'Password set successfully' });
            return;
        }

        // If user has a password, verify current password first
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.Password_Hash);
        if (!isCurrentPasswordValid) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // Hash and update new password
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await pool.execute(
            `UPDATE parent_beneficiary SET Password_Hash = ?, Default_Password_Changed = true,
             Must_Change_Password = false, Temporary_Password_Expires_At = NULL,
             Credential_Version = Credential_Version + 1 WHERE P_No_O_No = ?`,
            [hashedPassword, pNoONo]
        );
        await pool.execute(
            `INSERT INTO scms_parent_credential_events (p_no_o_no, event_type)
             VALUES (?, 'password_changed')`,
            [pNoONo]
        );

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Password change error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

// ==================== BANKING DETAILS ====================

app.get('/api/parent/banking', authenticateToken, async (req, res) => {
    try {
        const [banking] = await pool.execute(
            'SELECT * FROM banking_details WHERE P_No_O_No = ? AND Is_Archived = FALSE',
            [req.user.pNoONo]
        );
        res.json(banking);
    } catch (error) {
        console.error('Failed to fetch banking details:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/parent/banking/add', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const values = normalizeBankingPayload(req.body, { parentPNo: req.user.pNoONo });
        await connection.beginTransaction();
        const [[existing]] = await connection.query(
            'SELECT Account_ID FROM banking_details WHERE P_No_O_No = ? AND Is_Archived = FALSE FOR UPDATE',
            [req.user.pNoONo]
        );
        if (existing) throw bankingError('Banking details already exist. Update the existing record instead.', 409, 'BANKING_RECORD_EXISTS');
        const [result] = await connection.query(
            `INSERT INTO banking_details
              (P_No_O_No, Bank_Name, Account_Title, Account_Number, Branch_Code, Branch_Address,
               IBAN, Routing_Number, CNIC_of_Account_Holder, Bank_Name_Branch, Verification_Status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_evidence')`,
            [values.P_No_O_No, values.Bank_Name, values.Account_Title, values.Account_Number,
                values.Branch_Code, values.Branch_Address, values.IBAN, values.Routing_Number,
                values.CNIC_of_Account_Holder, values.Bank_Name_Branch]
        );
        const [[record]] = await connection.query('SELECT * FROM banking_details WHERE Account_ID = ?', [result.insertId]);
        await appendBankingHistory(connection, record, { action: 'created', actorType: 'parent', actorId: req.user.pNoONo });
        await connection.query(
            `INSERT INTO scms_audit_events (action, entity_type, entity_id, correlation_id, details)
             VALUES ('banking.created', 'banking', ?, UUID(), JSON_OBJECT('parent', ?))`,
            [String(result.insertId), req.user.pNoONo]
        );
        await connection.commit();
        res.status(201).json(record);
    } catch (error) {
        await connection.rollback();
        console.error('Failed to add banking details:', error);
        res.status(error.status || 500).json({ message: error.status ? error.message : 'Unable to save banking details.' });
    } finally {
        connection.release();
    }
});

app.put('/api/parent/banking/update', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const values = normalizeBankingPayload(req.body, { parentPNo: req.user.pNoONo });
        await connection.beginTransaction();
        const [[existing]] = await connection.query(
            'SELECT * FROM banking_details WHERE P_No_O_No = ? AND Is_Archived = FALSE FOR UPDATE',
            [req.user.pNoONo]
        );
        if (!existing) throw bankingError('No banking details were found to update.', 404, 'BANKING_NOT_FOUND');
        await connection.query(
            `UPDATE banking_details SET Bank_Name = ?, Account_Title = ?, Account_Number = ?, Branch_Code = ?,
             Branch_Address = ?, IBAN = ?, Routing_Number = ?, CNIC_of_Account_Holder = ?, Bank_Name_Branch = ?,
             Verification_Status = 'pending_evidence', Review_Reason = NULL, Verified_By = NULL,
             Verified_At = NULL, Submitted_At = NULL, Evidence_Required_From = CURRENT_TIMESTAMP(3),
             Row_Version = Row_Version + 1
             WHERE Account_ID = ?`,
            [values.Bank_Name, values.Account_Title, values.Account_Number, values.Branch_Code,
                values.Branch_Address, values.IBAN, values.Routing_Number, values.CNIC_of_Account_Holder,
                values.Bank_Name_Branch, existing.Account_ID]
        );
        const [[updated]] = await connection.query('SELECT * FROM banking_details WHERE Account_ID = ?', [existing.Account_ID]);
        await appendBankingHistory(connection, updated, { action: 'details_updated', actorType: 'parent', actorId: req.user.pNoONo });
        await connection.query(
            `INSERT INTO scms_audit_events (action, entity_type, entity_id, correlation_id, details)
             VALUES ('banking.details_updated', 'banking', ?, UUID(), JSON_OBJECT('parent', ?))`,
            [String(existing.Account_ID), req.user.pNoONo]
        );
        await connection.commit();
        res.json(updated);
    } catch (error) {
        await connection.rollback();
        console.error('Failed to update banking details:', error);
        res.status(error.status || 500).json({ message: error.status ? error.message : 'Unable to update banking details.' });
    } finally {
        connection.release();
    }
});

app.post('/api/parent/banking/submit', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [[record]] = await connection.query(
            'SELECT * FROM banking_details WHERE P_No_O_No = ? AND Is_Archived = FALSE FOR UPDATE',
            [req.user.pNoONo]
        );
        if (!record) throw bankingError('Add banking details before submitting evidence.', 404, 'BANKING_NOT_FOUND');
        if (!['pending_evidence', 'changes_required'].includes(record.Verification_Status)) {
            throw bankingError('This banking record is already submitted or verified.', 409, 'BANKING_ALREADY_SUBMITTED');
        }
        const [requirements] = await connection.query(
            `SELECT r.document_type_id FROM scms_document_requirements r
             INNER JOIN scms_document_types t ON t.id = r.document_type_id
             WHERE t.entity_scope = 'banking' AND t.status = 'published'
               AND r.is_active = TRUE AND r.is_required = TRUE
               AND r.effective_from <= CURDATE()
               AND (r.effective_to IS NULL OR r.effective_to >= CURDATE())`
        );
        if (requirements.length === 0) {
            throw bankingError('Banking evidence is not configured yet. Contact the office.', 409, 'BANKING_EVIDENCE_NOT_CONFIGURED');
        }
        for (const requirement of requirements) {
            const [[file]] = await connection.query(
                `SELECT id FROM scms_document_files
                 WHERE document_type_id = ? AND owner_type = 'banking' AND owner_id = ?
                   AND status IN ('pending_review', 'verified')
                   AND uploaded_at >= COALESCE(?, '1970-01-01')
                 ORDER BY version_number DESC LIMIT 1`,
                [requirement.document_type_id, String(record.Account_ID), record.Evidence_Required_From]
            );
            if (!file) throw bankingError('Upload every required banking evidence file before submitting.', 409, 'BANKING_EVIDENCE_INCOMPLETE');
        }
        await connection.query(
            `UPDATE banking_details SET Verification_Status = 'pending_review', Submitted_At = CURRENT_TIMESTAMP(3),
             Review_Reason = NULL, Row_Version = Row_Version + 1 WHERE Account_ID = ?`,
            [record.Account_ID]
        );
        const [[updated]] = await connection.query('SELECT * FROM banking_details WHERE Account_ID = ?', [record.Account_ID]);
        await appendBankingHistory(connection, updated, { action: 'submitted', actorType: 'parent', actorId: req.user.pNoONo });
        await connection.query(
            `INSERT INTO scms_audit_events (action, entity_type, entity_id, correlation_id, details)
             VALUES ('banking.submitted', 'banking', ?, UUID(), JSON_OBJECT('parent', ?))`,
            [String(record.Account_ID), req.user.pNoONo]
        );
        await connection.commit();
        res.json(updated);
    } catch (error) {
        await connection.rollback();
        res.status(error.status || 500).json({ message: error.status ? error.message : 'Unable to submit banking evidence.' });
    } finally {
        connection.release();
    }
});

app.delete('/api/parent/banking/delete', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [[record]] = await connection.query(
            'SELECT * FROM banking_details WHERE P_No_O_No = ? AND Is_Archived = FALSE FOR UPDATE', [req.user.pNoONo]
        );
        if (!record) throw bankingError('Banking details not found.', 404, 'BANKING_NOT_FOUND');
        if (record.Verification_Status === 'verified') {
            throw bankingError('A verified banking record cannot be removed online. Contact the office to replace it safely.', 409, 'VERIFIED_BANKING_PROTECTED');
        }
        await connection.query(
            `UPDATE banking_details SET Is_Archived = TRUE, Verification_Status = 'archived',
             Row_Version = Row_Version + 1 WHERE Account_ID = ?`, [record.Account_ID]
        );
        const [[updated]] = await connection.query('SELECT * FROM banking_details WHERE Account_ID = ?', [record.Account_ID]);
        await appendBankingHistory(connection, updated, { action: 'archived', actorType: 'parent', actorId: req.user.pNoONo });
        await connection.query(
            `INSERT INTO scms_audit_events (action, entity_type, entity_id, correlation_id, details)
             VALUES ('banking.archived', 'banking', ?, UUID(), JSON_OBJECT('parent', ?))`,
            [String(record.Account_ID), req.user.pNoONo]
        );
        await connection.commit();
        res.json({ message: 'Banking details archived successfully.' });
    } catch (error) {
        await connection.rollback();
        console.error('Failed to delete banking details:', error);
        res.status(error.status || 500).json({ message: error.status ? error.message : 'Unable to archive banking details.' });
    } finally {
        connection.release();
    }
});

// ==================== ADMIN BRIDGE (Called by Main System) ====================

app.post('/api/sync/admin-created-parent', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { pNoONo, parentName, rankRate, unit, contactNo, cnic, serviceStatus, adminId, email } = req.body;

    try {
        const [existing] = await pool.execute(
            'SELECT P_No_O_No FROM parent_beneficiary WHERE P_No_O_No = ?',
            [pNoONo]
        );

        const oneTimePassword = generateOneTimePassword();
        const hashedPassword = await hashPassword(oneTimePassword);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        if (existing.length > 0) {
            await pool.execute(
                `UPDATE parent_beneficiary SET 
                 Parent_Name = ?, Rank_Rate = ?, Unit = ?, Contact_No = ?,
                 Service_Status = ?, Email = ?, Password_Hash = ?, Status = 'approved', 
                 Origin = 'admin_created', Default_Password_Changed = FALSE,
                 Must_Change_Password = TRUE, Temporary_Password_Expires_At = ?,
                 Credential_Version = Credential_Version + 1,
                 Approved_At = NOW()
                 WHERE P_No_O_No = ?`,
                [parentName, rankRate, unit, contactNo, serviceStatus, email || `${pNoONo}@system.local`,
                 hashedPassword, expiresAt, pNoONo]
            );
            await syncParentIdentifiers(pool, pNoONo, cnic, { source: 'staff_activation', verified: true });
            await refreshParentCompleteness(pool, pNoONo);
            await pool.execute(
                `INSERT INTO scms_parent_credential_events (p_no_o_no, event_type, actor_user_id, expires_at)
                 VALUES (?, 'one_time_password_issued', ?, ?)`,
                [pNoONo, adminId || null, expiresAt]
            );
            
            return res.json({ 
                message: 'Parent updated in portal', 
                loginId: pNoONo,
                oneTimePassword,
                expiresAt
            });
        }

        await pool.execute(
            `INSERT INTO parent_beneficiary 
             (P_No_O_No, Parent_Name, Rank_Rate, Unit, Contact_No, Parent_CNIC,
              Service_Status, Email, Password_Hash, Status, Origin,
              Default_Password_Changed, Must_Change_Password, Temporary_Password_Expires_At, Approved_At)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'admin_created', FALSE, TRUE, ?, NOW())`,
            [pNoONo, parentName, rankRate, unit, contactNo, cnic,
             serviceStatus, email || `${pNoONo}@system.local`, hashedPassword, expiresAt]
        );
        await syncParentIdentifiers(pool, pNoONo, cnic, { source: 'staff_activation', verified: true });
        await refreshParentCompleteness(pool, pNoONo);
        await pool.execute(
            `INSERT INTO scms_parent_credential_events (p_no_o_no, event_type, actor_user_id, expires_at)
             VALUES (?, 'one_time_password_issued', ?, ?)`,
            [pNoONo, adminId || null, expiresAt]
        );

        res.status(201).json({
            message: 'Parent created in portal',
            loginId: pNoONo,
            oneTimePassword,
            expiresAt,
            note: 'This password is shown once, expires in 24 hours, and must be changed at first login.'
        });

    } catch (error) {
        console.error('Admin sync error:', error);
        res.status(500).json({ error: 'Sync failed' });
    }
});

app.post('/api/sync/reset-parent-password', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.ADMIN_API_KEY) return res.status(401).json({ error: 'Unauthorized' });

    const { pNoONo, actorUserId } = req.body;
    if (!pNoONo) return res.status(400).json({ error: 'P.No/O.No is required' });

    try {
        const [parents] = await pool.execute(
            'SELECT P_No_O_No FROM parent_beneficiary WHERE P_No_O_No = ?',
            [pNoONo]
        );
        if (parents.length === 0) return res.status(404).json({ error: 'Parent account not found' });

        const oneTimePassword = generateOneTimePassword();
        const passwordHash = await hashPassword(oneTimePassword);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await pool.execute(
            `UPDATE parent_beneficiary SET Password_Hash = ?, Must_Change_Password = TRUE,
             Default_Password_Changed = FALSE, Temporary_Password_Expires_At = ?,
             Credential_Version = Credential_Version + 1 WHERE P_No_O_No = ?`,
            [passwordHash, expiresAt, pNoONo]
        );
        await pool.execute(
            `INSERT INTO scms_parent_credential_events (p_no_o_no, event_type, actor_user_id, expires_at)
             VALUES (?, 'one_time_password_issued', ?, ?)`,
            [pNoONo, actorUserId || null, expiresAt]
        );
        res.json({ loginId: pNoONo, oneTimePassword, expiresAt });
    } catch (error) {
        console.error('Parent password reset failed:', error);
        res.status(500).json({ error: 'Unable to issue a one-time password' });
    }
});

app.get('/api/sync/pending', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Fetch parent registration requests (exclude child_addition since we use dependent_children table)
        const [requests] = await pool.execute(
            `SELECT r.*, p.Email as email, p.Parent_Name as parent_name, p.P_No_O_No as p_no_o_no,
                    p.Parent_CNIC as cnic, p.Origin as origin, p.Rank_Rate as rank_rate, p.Unit as unit,
                    p.Service_Status as service_status, p.Admin_Authority as admin_authority
             FROM Approval_Requests r
             JOIN parent_beneficiary p ON r.user_id = p.P_No_O_No
             WHERE r.request_type != 'child_addition'
             ORDER BY r.created_at DESC`
        );
        
        // Fetch children with all statuses
        const [children] = await pool.execute(
            `SELECT * FROM dependent_children ORDER BY Child_ID DESC`
        );
        const [fieldChanges] = await pool.execute(
            `SELECT c.*, p.Parent_Name, p.Email, p.Parent_CNIC, p.Origin,
                    p.Rank_Rate, p.Unit, p.Service_Status
             FROM scms_parent_change_requests c
             INNER JOIN parent_beneficiary p ON p.P_No_O_No = c.parent_p_no_o_no
             ORDER BY c.submitted_at DESC`
        );
        
        // Fetch all parents for matching
        const [parents] = await pool.execute(
            `SELECT P_No_O_No, Parent_Name, Email, Parent_CNIC FROM parent_beneficiary`
        );
        
        // Create a lookup map for parents (with and without P- prefix)
        const parentMap = new Map();
        parents.forEach(parent => {
            const pn = parent.P_No_O_No;
            const pnWithoutPrefix = pn?.startsWith('P-') ? pn.substring(2) : pn;
            
            // Store both versions
            if (pn) parentMap.set(pn, parent);
            if (pnWithoutPrefix && pnWithoutPrefix !== pn) parentMap.set(pnWithoutPrefix, parent);
        });

        // Transform children to match request format with parent name lookup
        const childrenAsRequests = children.map(child => {
            const childPN = child.P_No_O_No;
            const matchingParent = parentMap.get(childPN);
            
            return {
                id: child.Child_ID,
                user_id: child.P_No_O_No,
                request_type: 'child_addition',
                payload: {
                    childId: child.Child_ID,
                    childName: child.Child_Name,
                    age: child.Age,
                    cnicBformNo: child.CNIC_BForm_No,
                    school: child.School,
                    diseaseDisability: child.Disease_Disability,
                    disabilityCategory: child.Parent_Selected_Category || child.Disability_Category,
                    parentSelectedCategory: child.Parent_Selected_Category,
                    approvedCategory: child.Approved_Category,
                    parentName: matchingParent?.Parent_Name
                },
                status: child.Status,
                created_at: child.Created_At,
                p_no_o_no: child.P_No_O_No,
                email: matchingParent?.Email,
                parent_name: matchingParent?.Parent_Name,
                cnic: matchingParent?.Parent_CNIC,
                origin: 'self_registered'
            };
        });
        
        // Combine parent requests and child requests
        const fieldChangeRequests = fieldChanges.map(change => ({
            id: change.id,
            user_id: change.parent_p_no_o_no,
            request_type: 'parent_field_change',
            payload: {
                currentValues: change.current_values,
                proposedValues: change.proposed_values,
                parentMessage: change.parent_message
            },
            status: change.status,
            created_at: change.submitted_at,
            processed_at: change.reviewed_at,
            admin_response: change.review_reason,
            p_no_o_no: change.parent_p_no_o_no,
            email: change.Email,
            parent_name: change.Parent_Name,
            cnic: change.Parent_CNIC,
            origin: change.Origin,
            rank_rate: change.Rank_Rate,
            unit: change.Unit,
            service_status: change.Service_Status
        }));

        const allRequests = [...requests, ...childrenAsRequests, ...fieldChangeRequests];
        
        res.json(allRequests);
    } catch (error) {
        console.error('Sync pending error:', error);
        res.status(500).json({ error: 'Failed to fetch pending requests', details: error.message });
    }
});

// GET: ALL requests (for admin history/viewing all tabs)
app.get('/api/sync/all-requests', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const [requests] = await pool.execute(
            `SELECT r.*, p.Email as email, p.Parent_Name as parent_name, p.P_No_O_No as p_no_o_no, 
                    p.Parent_CNIC as cnic, p.Origin as origin, p.Rank_Rate as rank_rate, p.Unit as unit, 
                    p.Service_Status as service_status
             FROM Approval_Requests r
             JOIN parent_beneficiary p ON r.user_id = p.P_No_O_No
             ORDER BY r.created_at DESC`
        );
        res.json(requests);
    } catch (error) {
        console.error('Sync all-requests error:', error);
        res.status(500).json({ error: 'Failed to fetch requests', details: error.message });
    }
});

app.post('/api/sync/approval', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { requestId, requestType, action, adminNotes, mainDbChildId, approvedCategory } = req.body;

    try {
        // First try to find in Approval_Requests table
        let requests = [];
        if (requestType !== 'child_addition') {
            [requests] = await pool.execute(
                'SELECT * FROM Approval_Requests WHERE id = ?',
                [requestId]
            );
        }

        let request = requests[0];
        let isChildFromChildrenTable = false;

        // If not found and it might be a child addition, check dependent_children
        if (!request && requestType !== 'parent_registration') {
            const [children] = await pool.execute(
                'SELECT * FROM dependent_children WHERE Child_ID = ?',
                [requestId]
            );
            
            if (children.length > 0) {
                // Create a synthetic request object for child
                const child = children[0];
                request = {
                    id: child.Child_ID,
                    request_type: 'child_addition',
                    user_id: child.P_No_O_No,
                    status: child.Status
                };
                isChildFromChildrenTable = true;
            }
        }

        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }

        if (action === 'approve') {
            if (request.request_type === 'parent_registration') {
                await pool.execute(
                    'UPDATE parent_beneficiary SET Status = ?, Approved_At = NOW() WHERE P_No_O_No = ?',
                    ['approved', request.user_id]
                );
            } else if (request.request_type === 'child_addition') {
                // Update the child status in dependent_children
                console.log('Sync: Updating child status to approved for ID:', requestId);
                await pool.execute(
                    `UPDATE dependent_children SET Status = 'approved', Approved_Category = ?,
                     Disability_Category = ?, Category = ? WHERE Child_ID = ?`,
                    [approvedCategory || null, approvedCategory || null, approvedCategory || null, requestId]
                );
                console.log('Child addition sync completed for request ID:', requestId, 'Main DB Child ID:', mainDbChildId);
            }
        } else if (action === 'changes_required') {
            if (request.request_type === 'parent_registration') {
                await pool.execute("UPDATE parent_beneficiary SET Status = 'changes_required' WHERE P_No_O_No = ?", [request.user_id]);
            } else if (request.request_type === 'child_addition') {
                await pool.execute("UPDATE dependent_children SET Status = 'changes_required' WHERE Child_ID = ?", [requestId]);
            }
        } else if (action === 'block') {
            if (request.request_type === 'parent_registration') {
                await pool.execute(
                    `UPDATE parent_beneficiary SET Status = 'blocked', Block_Reason = ?, Blocked_At = NOW(),
                     Credential_Version = Credential_Version + 1
                     WHERE P_No_O_No = ?`,
                    [adminNotes || 'Contact the office', request.user_id]
                );
            } else if (request.request_type === 'child_addition') {
                await pool.execute("UPDATE dependent_children SET Status = 'rejected' WHERE Child_ID = ?", [requestId]);
            }
        } else {
            if (request.request_type === 'parent_registration') {
                await pool.execute(
                    'UPDATE parent_beneficiary SET Status = ? WHERE P_No_O_No = ?',
                    ['rejected', request.user_id]
                );
            } else if (request.request_type === 'child_addition') {
                await pool.execute(
                    'UPDATE dependent_children SET Status = ? WHERE Child_ID = ?',
                    ['rejected', requestId]
                );
            }
        }

        // Only update Approval_Requests if it exists there (not for children from dependent_children)
        if (!isChildFromChildrenTable) {
            await pool.execute(
                `UPDATE Approval_Requests SET status = ?, admin_response = ?, processed_by = ?, processed_at = NOW()
                 WHERE id = ?`,
                [action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : action, adminNotes || null, 'admin', requestId]
            );
        }

        res.json({ success: true });

    } catch (error) {
        console.error('Sync approval error:', error);
        console.error('Error details:', error.message);
        res.status(500).json({ error: 'Sync failed', details: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'parent-portal', database: 'scms_portal' });
});

const PORT = process.env.PORTAL_PORT || 4000;
const HOST = process.env.PORTAL_HOST || '127.0.0.1';

app.listen(PORT, HOST, () => {
    console.log(`========================================`);
    console.log(`🚀 Parent Portal API running`);
    console.log(`📡 URL: http://${HOST}:${PORT}`);
    console.log(`🗄️  Database: ${process.env.PORTAL_DB_NAME}`);
    console.log(`🔒 Mode: ${process.env.PORTAL_JWT_SECRET ? 'SECURED' : 'UNSECURED'}`);
    console.log(`========================================`);
});
