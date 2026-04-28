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
import path from 'path';
import fs from 'fs/promises';
import dotenv from 'dotenv';
dotenv.config();

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
const generateDefaultPassword = (pNoONo) => `password@${pNoONo}`;

// ==================== AUTH ROUTES ====================

// Self-registration (New User)
app.post('/api/auth/signup', authLimiter, async (req, res) => {
    const { email, password, parentName, pNoONo, rankRate, unit, contactNo, cnic, serviceStatus } = req.body;
    
    // Ensure all optional fields have default values
    const safeRankRate = rankRate || null;
    const safeUnit = unit || null;
    const safeContactNo = contactNo || null;
    const safeServiceStatus = serviceStatus || 'Serving';
    
    try {
        if (!email || !password || !parentName || !pNoONo || !cnic) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const [existing] = await pool.execute(
            'SELECT P_No_O_No, Email FROM parent_beneficiary WHERE P_No_O_No = ? OR Email = ?',
            [pNoONo, email]
        );
        
        if (existing.length > 0) {
            const existingUser = existing[0];
            if (existingUser.P_No_O_No === pNoONo) {
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

        // Insert new user into parent_beneficiary
        const [result] = await pool.execute(
            `INSERT INTO parent_beneficiary 
             (P_No_O_No, Parent_Name, Parent_CNIC, Email, Password_Hash, Status, Origin, Created_At)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [pNoONo, parentName, cnic, email, hashedPassword, 'pending', 'self_registered']
        );

        // Create approval request
        await pool.execute(
            `INSERT INTO Approval_Requests (user_id, request_type, payload, status, created_at) 
             VALUES (?, 'parent_registration', ?, 'pending', NOW())`,
            [pNoONo, JSON.stringify({
                email, parentName, pNoONo, rankRate: safeRankRate, unit: safeUnit, contactNo: safeContactNo, cnic, serviceStatus: safeServiceStatus,
                origin: 'self_registered',
                adminAuthority: 'HQ COMNOR'
            })]
        );

        res.status(201).json({ 
            message: 'Registration submitted for admin approval',
            userId: result.insertId,
            loginId: pNoONo
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Email or P.No/O.No already registered' });
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
            'SELECT P_No_O_No, Parent_Name, Email, Rank_Rate, Unit, Contact_No, Parent_CNIC, Service_Status, Status, Origin, Password_Hash, Default_Password_Changed FROM parent_beneficiary WHERE P_No_O_No = ?',
            [pNoONo]
        );

        const user = users[0];
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check if user has password set
        if (!user.Password_Hash) {
            return res.status(401).json({ error: 'Account not set up for login. Please contact admin.' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.Password_Hash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (user.Status === 'pending') {
            return res.status(403).json({ error: 'Account pending admin approval', status: 'pending' });
        }

        if (user.Status === 'rejected') {
            return res.status(403).json({ error: 'Account was rejected. Contact admin.', status: 'rejected' });
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
                parentName: user.Parent_Name
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
                origin: user.Origin
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
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
            'SELECT Password_Hash FROM parent_beneficiary WHERE P_No_O_No = ?',
            [req.user.pNoONo]
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
            `INSERT INTO dependent_children (P_No_O_No, Child_Name, Age, CNIC_B_Form_No, Disease_Disability, Disability_Category, School)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.user.pNoONo, childName, age, cnicBformNo, diseaseDisability, disabilityCategory, school]
        );

        res.status(201).json({ 
            message: 'Child added successfully',
            child_id: result.insertId 
        });
    } catch (error) {
        console.error('Failed to add child:', error);
        res.status(500).json({ error: 'Failed to add child' });
    }
});

app.get('/api/children', authenticateToken, requireApproved, async (req, res) => {
    try {
        const [children] = await pool.execute(
            `SELECT Child_ID, Child_Name, Age, CNIC_B_Form_No, Disease_Disability, 
                    Disability_Category, School, Disability_Certificate_No, Authority
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
            cnic_bform_no: child.CNIC_B_Form_No,
            disease_disability: child.Disease_Disability,
            disability_category: child.Disability_Category,
            school: child.School,
            assessment_performa: null, // These would be stored in separate tables
            application_form: null,
            disability_certificate: child.Disability_Certificate_No,
            identity_proof: null
        }));
        
        res.json(transformedChildren);
    } catch (error) {
        console.error('Failed to fetch children:', error);
        res.status(500).json({ error: 'Failed to fetch children' });
    }
});

// GET: Check if CNIC/B-Form already exists
app.get('/api/children/check-cnic', async (req, res) => {
    const { cnic } = req.query;
    if (!cnic) {
        return res.status(400).json({ error: 'CNIC required' });
    }

    try {
        const [existing] = await pool.execute(
            'SELECT child_id FROM Portal_Children WHERE cnic_bform_no = ?',
            [cnic]
        );
        res.json({ found: existing.length > 0 });
    } catch (error) {
        res.status(500).json({ error: 'Failed to check CNIC' });
    }
});

// POST: Upload child document (4 types)
app.post('/api/children/:childId/documents', authenticateToken, upload.single('file'), async (req, res) => {
    const { childId } = req.params;
    const { documentType, pNoONo, identifier } = req.body;
    
    // Debug logging
    console.log('Upload request received:');
    console.log('req.body:', req.body);
    console.log('pNoONo:', pNoONo);
    console.log('documentType:', documentType);
    console.log('identifier:', identifier);
    
    // Validate required fields
    if (!pNoONo || !documentType || !identifier) {
        return res.status(400).json({ 
            error: 'Missing required fields',
            details: { pNoONo, documentType, identifier }
        });
    }
    
    const validTypes = ['assessment_performa', 'application_form', 'disability_certificate', 'identity_proof'];
    if (!validTypes.includes(documentType)) {
        return res.status(400).json({ error: 'Invalid document type' });
    }

    try {
        // Verify child belongs to this parent
        const [children] = await pool.execute(
            'SELECT user_id FROM Portal_Children WHERE child_id = ?',
            [childId]
        );
        if (children.length === 0 || children[0].user_id !== req.user.userId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const filePath = `/scmsForms/${pNoONo}/${req.file.filename}`;

        // Upsert document record
        await pool.execute(
            `INSERT INTO Child_Documents (child_id, document_type, file_path, original_name, file_size) 
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
             file_path = VALUES(file_path),
             original_name = VALUES(original_name),
             file_size = VALUES(file_size),
             uploaded_at = CURRENT_TIMESTAMP`,
            [childId, documentType, filePath, req.file.originalname, req.file.size]
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
        console.log('Portal: Querying Child_Documents for childId:', childId);
        const [docs] = await pool.execute(
            `SELECT document_type, file_path, original_name, uploaded_at  
              FROM Child_Documents WHERE child_id = ?`,
            [childId]
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
    
    // Security: ensure path is within UPLOAD_DIR
    const fullPath = path.join(UPLOAD_DIR, path.basename(path.dirname(filePath)), path.basename(filePath));
    console.log('Portal: Full file path:', fullPath);
    
    try {
        await fs.access(fullPath);
        console.log('Portal: File found, sending:', fullPath);
        res.sendFile(fullPath);
    } catch (error) {
        console.log('Portal: File not found:', fullPath);
        res.status(404).json({ error: 'File not found' });
    }
});

// ==================== PROFILE & STATUS ====================

app.get('/api/profile', authenticateToken, requireApproved, async (req, res) => {
    try {
        const [users] = await pool.execute(
            `SELECT P_No_O_No, Parent_Name, Email, Rank_Rate, Unit,
                    Contact_No, CNIC, Service_Status, Status, Origin,
                    Default_Password_Changed, Created_At
             FROM parent_beneficiary WHERE P_No_O_No = ?`,
            [req.user.pNoONo]
        );

        const user = users[0];
        res.json({
            user_id: user.P_No_O_No,
            email: user.Email,
            parent_name: user.Parent_Name,
            p_no_o_no: user.P_No_O_No,
            rank_rate: user.Rank_Rate,
            unit: user.Unit,
            contact_no: user.Contact_No,
            cnic: user.CNIC,
            service_status: user.Service_Status,
            status: user.Status,
            origin: user.Origin,
            default_password_changed: user.Default_Password_Changed,
            created_at: user.Created_At,
            approved_at: user.Created_At, // Using Created_At as approved_at for now
            tag: user.Origin === 'admin_created' ? 'Admin Created' : 'New User',
            tagColor: user.Origin === 'admin_created' ? '#1976d2' : '#ed6c02'
        });

    } catch (error) {
        res.status(500).json({ error: 'Failed to load profile' });
    }
});

app.get('/api/status', authenticateToken, async (req, res) => {
    try {
        const [user] = await pool.execute(
            'SELECT Status FROM parent_beneficiary WHERE P_No_O_No = ?',
            [req.user.pNoONo]
        );

        // For now, return empty requests since Approval_Requests table may not exist in main DB
        res.json({ 
            accountStatus: { 
                status: user[0]?.Status || 'unknown', 
                admin_notes: '', 
                approved_at: null 
            }, 
            requests: [] 
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch status' });
    }
});

// ==================== BANKING DETAILS ====================

app.get('/api/parent/banking', authenticateToken, async (req, res) => {
    try {
        const [banking] = await pool.execute(
            'SELECT * FROM banking_details WHERE P_No_O_No = ?',
            [req.user.pNoONo]
        );
        res.json(banking);
    } catch (error) {
        console.error('Failed to fetch banking details:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/parent/banking/add', authenticateToken, async (req, res) => {
    try {
        const { bank_name, account_title, account_number, branch_code, branch_address, iban, routing_number } = req.body;
        
        // Check if banking details already exist for this parent
        const [existing] = await pool.execute(
            'SELECT COUNT(*) as count FROM banking_details WHERE P_No_O_No = ?',
            [req.user.pNoONo]
        );
        
        if (existing[0].count > 0) {
            return res.status(400).json({ message: 'Banking details already exist. You can only have one banking record.' });
        }
        
        const [result] = await pool.execute(
            `INSERT INTO banking_details (P_No_O_No, Bank_Name, Account_Title, Account_Number, Branch_Code, Branch_Address, IBAN, Routing_Number)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.pNoONo, bank_name, account_title, account_number, branch_code, branch_address, iban, routing_number]
        );
        
        // Fetch the newly created banking details to return to frontend
        const [newBankingDetails] = await pool.execute(
            'SELECT * FROM banking_details WHERE Account_ID = ?',
            [result.insertId]
        );
        
        res.status(201).json(newBankingDetails[0]);
    } catch (error) {
        console.error('Failed to add banking details:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/parent/banking/update', authenticateToken, async (req, res) => {
    try {
        const { bank_name, account_title, account_number, branch_code, branch_address, iban, routing_number } = req.body;
        
        console.log('Updating banking details for user:', req.user.pNoONo);
        console.log('Update data:', { bank_name, account_title, account_number, branch_code, branch_address, iban, routing_number });
        
        // First check if banking details exist for this user
        const [existing] = await pool.execute(
            'SELECT COUNT(*) as count FROM banking_details WHERE P_No_O_No = ?',
            [req.user.pNoONo]
        );
        
        console.log('Existing records count:', existing[0].count);
        
        if (existing[0].count === 0) {
            return res.status(404).json({ message: 'No banking details found to update. Please add banking details first.' });
        }
        
        const [result] = await pool.execute(
            `UPDATE banking_details 
             SET Bank_Name = ?, Account_Title = ?, Account_Number = ?, Branch_Code = ?, Branch_Address = ?, IBAN = ?, Routing_Number = ?
             WHERE P_No_O_No = ?`,
            [bank_name, account_title, account_number, branch_code, branch_address, iban, routing_number, req.user.pNoONo]
        );
        
        console.log('Update result:', result);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Banking details not found' });
        }
        
        // Fetch the updated banking details to return to frontend
        const [updatedBankingDetails] = await pool.execute(
            'SELECT * FROM banking_details WHERE P_No_O_No = ?',
            [req.user.pNoONo]
        );
        
        console.log('Updated banking details:', updatedBankingDetails[0]);
        
        res.json(updatedBankingDetails[0]);
    } catch (error) {
        console.error('Failed to update banking details:', error);
        console.error('Error details:', error.message);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

app.delete('/api/parent/banking/delete', authenticateToken, async (req, res) => {
    try {
        const [result] = await pool.execute(
            'DELETE FROM banking_details WHERE P_No_O_No = ?',
            [req.user.pNoONo]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Banking details not found' });
        }
        
        res.json({ message: 'Banking details deleted successfully' });
    } catch (error) {
        console.error('Failed to delete banking details:', error);
        res.status(500).json({ message: 'Server error' });
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
            `SELECT r.*, p.Email as email, p.Parent_Name as parent_name, p.P_No_O_No as p_no_o_no, 
                    p.Parent_CNIC as cnic, p.Origin as origin
             FROM Approval_Requests r
             JOIN parent_beneficiary p ON r.user_id = p.P_No_O_No
             WHERE r.status = 'pending'
             ORDER BY r.created_at ASC`
        );
        res.json(requests);
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