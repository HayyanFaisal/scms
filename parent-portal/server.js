// parent-portal/server.js
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// Security middleware
app.use(helmet());
app.use(express.json({ limit: '10mb' }));

// CORS
app.use(cors({
    origin: process.env.PARENT_PORTAL_URL || 'http://127.0.0.1:5173',
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later' }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true
});

// Database pool
const pool = mysql.createPool({
    host: process.env.PORTAL_DB_HOST || '127.0.0.1',
    user: process.env.PORTAL_DB_USER || 'root',
    password: process.env.PORTAL_DB_PASSWORD || '',
    database: process.env.PORTAL_DB_NAME || 'scms_portal',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Verify database connection
pool.getConnection()
    .then(conn => {
        console.log('✅ Connected to portal database:', process.env.PORTAL_DB_NAME);
        conn.release();
    })
    .catch(err => {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1);
    });

// JWT middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: 'Access denied' });
    
    jwt.verify(token, process.env.PORTAL_JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

const requireApproved = async (req, res, next) => {
    const [users] = await pool.execute(
        'SELECT status FROM Portal_Users WHERE user_id = ?',
        [req.user.userId]
    );
    if (users[0]?.status !== 'approved') {
        return res.status(403).json({ error: 'Account pending approval' });
    }
    next();
};

// Password utilities
const hashPassword = async (password) => bcrypt.hash(password, 12);
const verifyPassword = async (password, hash) => bcrypt.compare(password, hash);
const generateDefaultPassword = (pNoONo) => `password@${pNoONo}`;

// ==================== AUTH ROUTES ====================

// Self-registration (New User)
app.post('/api/auth/signup', authLimiter, async (req, res) => {
    const { email, password, parentName, pNoONo, rankRate, unit, contactNo, cnic, serviceStatus } = req.body;
    
    try {
        if (!email || !password || !parentName || !pNoONo || !cnic) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const [existing] = await pool.execute(
            'SELECT user_id, status, origin FROM Portal_Users WHERE p_no_o_no = ?',
            [pNoONo]
        );
        
        if (existing.length > 0) {
            return res.status(409).json({ 
                error: 'This P.No/O.No is already registered. Please login instead.' 
            });
        }

        const hashedPassword = await hashPassword(password);
        const verificationToken = crypto.randomBytes(32).toString('hex');

        const [result] = await pool.execute(
            `INSERT INTO Portal_Users 
             (email, password_hash, parent_name, p_no_o_no, rank_rate, unit, 
              contact_no, cnic, service_status, verification_token, status, origin)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'self_registered')`,
            [email, hashedPassword, parentName, pNoONo, rankRate, unit, 
             contactNo, cnic, serviceStatus, verificationToken]
        );

        await pool.execute(
            `INSERT INTO Approval_Requests (user_id, request_type, payload) 
             VALUES (?, 'parent_registration', ?)`,
            [result.insertId, JSON.stringify({
                email, parentName, pNoONo, rankRate, unit, adminAuthority, contactNo, cnic, serviceStatus,
                origin: 'self_registered'
            })]
        );

        res.status(201).json({ 
            message: 'Registration submitted for admin approval',
            userId: result.insertId,
            loginId: pNoONo
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Email or CNIC already registered' });
        }
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Registration failed' });
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
            `SELECT user_id, email, password_hash, status, parent_name, p_no_o_no,
                    origin, default_password_changed
             FROM Portal_Users WHERE p_no_o_no = ?`,
            [pNoONo]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid P.No/O.No or password' });
        }

        const user = users[0];
        const validPassword = await verifyPassword(password, user.password_hash);

        if (!validPassword) {
            await pool.execute(
                `INSERT INTO Portal_Audit_Log (user_id, action, ip_address, details) 
                 VALUES (?, ?, ?, ?)`,
                [user.user_id, 'LOGIN_FAILED', req.ip, JSON.stringify({ reason: 'invalid_password' })]
            );
            return res.status(401).json({ error: 'Invalid P.No/O.No or password' });
        }

        if (user.status === 'pending') {
            return res.status(403).json({ error: 'Account pending admin approval', status: 'pending' });
        }

        if (user.status === 'rejected') {
            return res.status(403).json({ error: 'Account was rejected. Contact admin.', status: 'rejected' });
        }

        await pool.execute(
            `INSERT INTO Portal_Audit_Log (user_id, action, ip_address, details) 
             VALUES (?, ?, ?, ?)`,
            [user.user_id, 'LOGIN_SUCCESS', req.ip, JSON.stringify({ origin: user.origin })]
        );

        const token = jwt.sign(
            { 
                userId: user.user_id, 
                pNoONo: user.p_no_o_no,
                email: user.email,
                status: user.status,
                origin: user.origin
            },
            process.env.PORTAL_JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            token,
            user: {
                id: user.user_id,
                pNoONo: user.p_no_o_no,
                email: user.email,
                name: user.parent_name,
                status: user.status,
                origin: user.origin,
                defaultPasswordChanged: user.default_password_changed,
                isFirstLogin: user.origin === 'admin_created' && !user.default_password_changed
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Force password change on first login
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: 'Invalid password data' });
    }

    try {
        const [users] = await pool.execute(
            'SELECT password_hash FROM Portal_Users WHERE user_id = ?',
            [req.user.userId]
        );

        const validCurrent = await verifyPassword(currentPassword, users[0].password_hash);
        if (!validCurrent) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        const newHash = await hashPassword(newPassword);
        
        await pool.execute(
            `UPDATE Portal_Users SET password_hash = ?, default_password_changed = TRUE WHERE user_id = ?`,
            [newHash, req.user.userId]
        );

        await pool.execute(
            `INSERT INTO Portal_Audit_Log (user_id, action, ip_address, details) VALUES (?, ?, ?, ?)`,
            [req.user.userId, 'PASSWORD_CHANGED', req.ip, '{}']
        );

        res.json({ message: 'Password updated successfully' });

    } catch (error) {
        res.status(500).json({ error: 'Failed to change password' });
    }
});

// ==================== CHILD MANAGEMENT ====================

app.post('/api/children', authenticateToken, requireApproved, async (req, res) => {
    const { childName, age, cnicBformNo, diseaseDisability, disabilityCategory, school } = req.body;

    try {
        const [result] = await pool.execute(
            `INSERT INTO Portal_Children 
             (user_id, child_name, age, cnic_bform_no, disease_disability, disability_category, school)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.user.userId, childName, age, cnicBformNo, diseaseDisability, disabilityCategory, school]
        );

        await pool.execute(
            `INSERT INTO Approval_Requests (user_id, request_type, payload) VALUES (?, 'child_addition', ?)`,
            [req.user.userId, JSON.stringify({
                childId: result.insertId, childName, age, cnicBformNo, diseaseDisability, disabilityCategory, school
            })]
        );

        res.status(201).json({ message: 'Child added, pending admin approval', childId: result.insertId });

    } catch (error) {
        res.status(500).json({ error: 'Failed to add child' });
    }
});

app.get('/api/children', authenticateToken, requireApproved, async (req, res) => {
    try {
        const [children] = await pool.execute(
            `SELECT child_id, child_name, age, cnic_bform_no, disease_disability, 
                    disability_category, school, sync_status, main_db_child_id
             FROM Portal_Children WHERE user_id = ?`,
            [req.user.userId]
        );
        res.json(children);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch children' });
    }
});

// ==================== PROFILE & STATUS ====================

app.get('/api/profile', authenticateToken, requireApproved, async (req, res) => {
    try {
        const [users] = await pool.execute(
            `SELECT user_id, email, parent_name, p_no_o_no, rank_rate, unit,
                    contact_no, cnic, service_status, status, origin,
                    default_password_changed, created_at, approved_at
             FROM Portal_Users WHERE user_id = ?`,
            [req.user.userId]
        );

        const user = users[0];
        res.json({
            ...user,
            tag: user.origin === 'admin_created' ? 'Admin Created' : 'New User',
            tagColor: user.origin === 'admin_created' ? '#1976d2' : '#ed6c02'
        });

    } catch (error) {
        res.status(500).json({ error: 'Failed to load profile' });
    }
});

app.get('/api/status', authenticateToken, async (req, res) => {
    try {
        const [user] = await pool.execute(
            'SELECT status, admin_notes, approved_at FROM Portal_Users WHERE user_id = ?',
            [req.user.userId]
        );

        const [requests] = await pool.execute(
            `SELECT request_id, request_type, status, admin_response, requested_at, responded_at
             FROM Approval_Requests WHERE user_id = ? ORDER BY requested_at DESC`,
            [req.user.userId]
        );

        res.json({ accountStatus: user[0], requests });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch status' });
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
            'SELECT user_id FROM Portal_Users WHERE p_no_o_no = ?',
            [pNoONo]
        );

        const defaultPassword = generateDefaultPassword(pNoONo);
        const hashedPassword = await hashPassword(defaultPassword);

        if (existing.length > 0) {
            await pool.execute(
                `UPDATE Portal_Users SET 
                 parent_name = ?, rank_rate = ?, unit = ?, contact_no = ?,
                 service_status = ?, email = ?, password_hash = ?, status = 'approved', 
                 origin = 'admin_created', created_by_admin_id = ?, default_password_changed = FALSE,
                 approved_at = NOW(), approved_by = ?
                 WHERE p_no_o_no = ?`,
                [parentName, rankRate, unit, contactNo, serviceStatus, email || `${pNoONo}@system.local`, 
                 hashedPassword, adminId, `admin_${adminId}`, pNoONo]
            );
            
            return res.json({ 
                message: 'Parent updated in portal', 
                loginId: pNoONo,
                defaultPassword
            });
        }

        const [result] = await pool.execute(
            `INSERT INTO Portal_Users 
             (email, password_hash, parent_name, p_no_o_no, rank_rate, unit, 
              contact_no, cnic, service_status, status, origin, 
              created_by_admin_id, default_password_changed, approved_at, approved_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'admin_created', ?, FALSE, NOW(), ?)`,
            [email || `${pNoONo}@system.local`, hashedPassword, parentName, pNoONo, 
             rankRate, unit, contactNo, cnic, serviceStatus, adminId, `admin_${adminId}`]
        );

        res.status(201).json({
            message: 'Parent created in portal',
            portalUserId: result.insertId,
            loginId: pNoONo,
            defaultPassword,
            note: 'Parent must change password on first login'
        });

    } catch (error) {
        console.error('Admin sync error:', error);
        res.status(500).json({ error: 'Sync failed' });
    }
});

app.get('/api/sync/pending', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const [requests] = await pool.execute(
            `SELECT r.*, u.email, u.parent_name, u.p_no_o_no, u.cnic, u.origin
             FROM Approval_Requests r
             JOIN Portal_Users u ON r.user_id = u.user_id
             WHERE r.status = 'pending'
             ORDER BY r.requested_at ASC`
        );
        res.json(requests);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pending requests' });
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
            `SELECT r.*, u.email, u.parent_name, u.p_no_o_no, u.cnic, u.origin, u.rank_rate, u.unit, u.service_status
             FROM Approval_Requests r
             JOIN Portal_Users u ON r.user_id = u.user_id
             ORDER BY r.requested_at DESC`
        );
        res.json(requests);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

app.post('/api/sync/approval', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { requestId, action, adminNotes, mainDbChildId } = req.body;

    try {
        const [requests] = await pool.execute(
            'SELECT * FROM Approval_Requests WHERE request_id = ?',
            [requestId]
        );

        if (requests.length === 0) {
            return res.status(404).json({ error: 'Request not found' });
        }

        const request = requests[0];

        if (action === 'approve') {
            if (request.request_type === 'parent_registration') {
                await pool.execute(
                    'UPDATE Portal_Users SET status = ?, approved_at = NOW(), admin_notes = ? WHERE user_id = ?',
                    ['approved', adminNotes, request.user_id]
                );
            } else if (request.request_type === 'child_addition') {
                await pool.execute(
                    'UPDATE Portal_Children SET sync_status = ?, main_db_child_id = ? WHERE user_id = ?',
                    ['synced', mainDbChildId, request.user_id]
                );
            }
        } else {
            await pool.execute(
                'UPDATE Portal_Users SET status = ?, admin_notes = ? WHERE user_id = ?',
                ['rejected', adminNotes, request.user_id]
            );
        }

        await pool.execute(
            'UPDATE Approval_Requests SET status = ?, admin_response = ?, responded_at = NOW() WHERE request_id = ?',
            [action === 'approve' ? 'approved' : 'rejected', adminNotes, requestId]
        );

        res.json({ success: true });

    } catch (error) {
        res.status(500).json({ error: 'Sync failed' });
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