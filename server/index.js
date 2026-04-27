import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import path from 'path';
import multer from 'multer';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { pool, query, transaction, ensureSchema } from './database.js';

const app = express();
const port = Number(process.env.PORT || 3001);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.join(__dirname, 'uploads');
const parentDocUploadDir = path.join(uploadsRoot, 'parent-docs');

// ===== ADD THESE IMPORTS AT THE TOP (after existing imports) =====
import axios from 'axios';

// Portal sync configuration
const PORTAL_API_URL = process.env.PORTAL_API_URL || 'http://127.0.0.1:4000';
const PORTAL_API_KEY = process.env.PORTAL_API_KEY;


await fs.mkdir(parentDocUploadDir, { recursive: true });

const allowedImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff']);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, parentDocUploadDir);
    },
    filename: (_req, file, callback) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const safeExt = ext || '.jpg';
      const uniquePart = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      callback(null, `${uniquePart}${safeExt}`);
    }
  }),
  limits: {
    fileSize: 8 * 1024 * 1024
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedImageMimeTypes.has(file.mimetype)) {
      callback(new Error('Only image files are allowed (jpeg, png, webp, gif, tiff)'));
      return;
    }
    callback(null, true);
  }
});

app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(uploadsRoot));

function sendError(res, error, fallbackMessage = 'Request failed') {
  console.error(error);
  const sqlCode = error && typeof error === 'object' ? error.code : undefined;

  if (sqlCode === 'ER_DUP_ENTRY') {
    res.status(409).json({
      message: 'Duplicate value violates a unique field',
      error: error.sqlMessage || (error instanceof Error ? error.message : 'Duplicate entry')
    });
    return;
  }

  if (sqlCode === 'ER_NO_REFERENCED_ROW_2' || sqlCode === 'ER_ROW_IS_REFERENCED_2') {
    res.status(400).json({
      message: 'Request violates a relationship constraint',
      error: error.sqlMessage || (error instanceof Error ? error.message : 'Constraint error')
    });
    return;
  }

  res.status(500).json({ message: fallbackMessage, error: error instanceof Error ? error.message : 'Unknown error' });
}

async function getBootstrap() {
  const [parents, documents, banking, children, grants, gadgets] = await Promise.all([
    query('SELECT * FROM Parent_Beneficiary ORDER BY Parent_Name'),
    query('SELECT * FROM Document_Tracking ORDER BY Doc_ID'),
    query('SELECT * FROM Banking_Details ORDER BY Account_ID'),
    query('SELECT * FROM Dependent_Children ORDER BY Child_ID'),
    query('SELECT * FROM Monthly_Grants ORDER BY Grant_ID'),
    query('SELECT * FROM Child_Gadgets ORDER BY Gadget_ID')
  ]);

  return { parents, documents, banking, children, grants, gadgets };
}

async function getParentRecord(pNo) {
  const rows = await query('SELECT * FROM Parent_Beneficiary WHERE P_No_O_No = ?', [pNo]);
  return rows[0] || null;
}

async function getDocumentRecord(docId) {
  const rows = await query('SELECT * FROM Document_Tracking WHERE Doc_ID = ?', [docId]);
  return rows[0] || null;
}

async function getScannedDocumentRecord(documentFileId) {
  const rows = await query('SELECT * FROM Parent_Document_Files WHERE Document_File_ID = ?', [documentFileId]);
  return rows[0] || null;
}

async function getBankingRecord(accountId) {
  const rows = await query('SELECT * FROM Banking_Details WHERE Account_ID = ?', [accountId]);
  return rows[0] || null;
}

async function getChildRecord(childId) {
  const rows = await query('SELECT * FROM Dependent_Children WHERE Child_ID = ?', [childId]);
  return rows[0] || null;
}

async function getGrantRecord(grantId) {
  const rows = await query('SELECT * FROM Monthly_Grants WHERE Grant_ID = ?', [grantId]);
  return rows[0] || null;
}

async function getGadgetRecord(gadgetId) {
  const rows = await query('SELECT * FROM Child_Gadgets WHERE Gadget_ID = ?', [gadgetId]);
  return rows[0] || null;
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, 'Database connection failed');
  }
});

app.get('/api/bootstrap', async (_req, res) => {
  try {
    res.json(await getBootstrap());
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/parents', async (_req, res) => {
  try {
    res.json(await query('SELECT * FROM Parent_Beneficiary ORDER BY Parent_Name'));
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/parents/:pNo', async (req, res) => {
  try {
    const parent = await getParentRecord(req.params.pNo);
    if (!parent) {
      res.status(404).json({ message: 'Parent not found' });
      return;
    }
    res.json(parent);
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/parents', async (req, res) => {
  try {
    const { P_No_O_No, Parent_Name, Rank_Rate, Unit, Admin_Authority, Service_Status, Parent_CNIC } = req.body;
    await query(
      `INSERT INTO Parent_Beneficiary
        (P_No_O_No, Parent_Name, Rank_Rate, Unit, Admin_Authority, Service_Status, Parent_CNIC)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [P_No_O_No, Parent_Name, Rank_Rate, Unit, Admin_Authority || null, Service_Status, Parent_CNIC]
    );
    res.status(201).json(await getParentRecord(P_No_O_No));
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/parents/:pNo', async (req, res) => {
  try {
    const pNo = req.params.pNo;
    const { Parent_Name, Rank_Rate, Unit, Admin_Authority, Service_Status, Parent_CNIC } = req.body;
    await query(
      `UPDATE Parent_Beneficiary
       SET Parent_Name = ?, Rank_Rate = ?, Unit = ?, Admin_Authority = ?, Service_Status = ?, Parent_CNIC = ?
       WHERE P_No_O_No = ?`,
      [Parent_Name, Rank_Rate, Unit, Admin_Authority || null, Service_Status, Parent_CNIC, pNo]
    );
    res.json(await getParentRecord(pNo));
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/parents/:pNo', async (req, res) => {
  try {
    const pNo = req.params.pNo;

    const scannedDocs = await query('SELECT Storage_Path FROM Parent_Document_Files WHERE P_No_O_No = ?', [pNo]);

    await transaction(async (connection) => {
      const [childRows] = await connection.query('SELECT Child_ID FROM Dependent_Children WHERE P_No_O_No = ?', [pNo]);
      const childIds = childRows.map((row) => row.Child_ID);

      if (childIds.length > 0) {
        await connection.query('DELETE FROM Child_Gadgets WHERE Child_ID IN (?)', [childIds]);
        await connection.query('DELETE FROM Monthly_Grants WHERE Child_ID IN (?)', [childIds]);
      }

      await connection.query('DELETE FROM Document_Tracking WHERE P_No_O_No = ?', [pNo]);
      await connection.query('DELETE FROM Banking_Details WHERE P_No_O_No = ?', [pNo]);
      await connection.query('DELETE FROM Dependent_Children WHERE P_No_O_No = ?', [pNo]);
      await connection.query('DELETE FROM Parent_Beneficiary WHERE P_No_O_No = ?', [pNo]);
    });

    for (const record of scannedDocs) {
      const relativePath = String(record.Storage_Path || '').replace(/^\/uploads\//, '');
      if (!relativePath) continue;
      const filePath = path.join(uploadsRoot, relativePath);
      await fs.unlink(filePath).catch(() => undefined);
    }

    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/documents', async (_req, res) => {
  try {
    res.json(await query('SELECT * FROM Document_Tracking ORDER BY Doc_ID'));
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/documents', async (req, res) => {
  try {
    const { P_No_O_No, Letter_Reference, Contact_No, Almirah_No, File_No } = req.body;
    const result = await query(
      `INSERT INTO Document_Tracking
        (P_No_O_No, Letter_Reference, Contact_No, Almirah_No, File_No)
       VALUES (?, ?, ?, ?, ?)`,
      [P_No_O_No, Letter_Reference, Contact_No, Almirah_No, File_No]
    );
    res.status(201).json(await getDocumentRecord(result.insertId));
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/documents/:docId', async (req, res) => {
  try {
    const docId = Number(req.params.docId);
    const { P_No_O_No, Letter_Reference, Contact_No, Almirah_No, File_No } = req.body;
    await query(
      `UPDATE Document_Tracking
       SET P_No_O_No = ?, Letter_Reference = ?, Contact_No = ?, Almirah_No = ?, File_No = ?
       WHERE Doc_ID = ?`,
      [P_No_O_No, Letter_Reference, Contact_No, Almirah_No, File_No, docId]
    );
    res.json(await getDocumentRecord(docId));
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/documents/:docId', async (req, res) => {
  try {
    await query('DELETE FROM Document_Tracking WHERE Doc_ID = ?', [Number(req.params.docId)]);
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/parents/:pNo/scanned-documents', async (req, res) => {
  try {
    const pNo = req.params.pNo;
    res.json(
      await query(
        `SELECT *
         FROM Parent_Document_Files
         WHERE P_No_O_No = ?
         ORDER BY Uploaded_At DESC, Document_File_ID DESC`,
        [pNo]
      )
    );
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/parents/:pNo/scanned-documents', (req, res) => {
  upload.single('file')(req, res, async (uploadError) => {
    if (uploadError) {
      res.status(400).json({
        message: 'Upload failed',
        error: uploadError instanceof Error ? uploadError.message : 'Invalid upload request'
      });
      return;
    }

    try {
      const pNo = req.params.pNo;
      const parent = await getParentRecord(pNo);
      if (!parent) {
        res.status(404).json({ message: 'Parent not found' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ message: 'No file received' });
        return;
      }

      const docType = typeof req.body.docType === 'string' ? req.body.docType.trim() : '';
      const storagePath = `/uploads/parent-docs/${req.file.filename}`;

      const result = await query(
        `INSERT INTO Parent_Document_Files
          (P_No_O_No, Doc_Type, Original_File_Name, Stored_File_Name, Mime_Type, File_Size_Bytes, Storage_Path)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          pNo,
          docType || null,
          req.file.originalname,
          req.file.filename,
          req.file.mimetype,
          req.file.size,
          storagePath
        ]
      );

      res.status(201).json(await getScannedDocumentRecord(result.insertId));
    } catch (error) {
      if (req.file?.path) {
        await fs.unlink(req.file.path).catch(() => undefined);
      }
      sendError(res, error);
    }
  });
});

app.delete('/api/scanned-documents/:documentFileId', async (req, res) => {
  try {
    const documentFileId = Number(req.params.documentFileId);
    const existing = await getScannedDocumentRecord(documentFileId);

    if (!existing) {
      res.status(404).json({ message: 'Document file not found' });
      return;
    }

    await query('DELETE FROM Parent_Document_Files WHERE Document_File_ID = ?', [documentFileId]);

    const relativePath = String(existing.Storage_Path || '').replace(/^\/uploads\//, '');
    if (relativePath) {
      const filePath = path.join(uploadsRoot, relativePath);
      await fs.unlink(filePath).catch(() => undefined);
    }

    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/banking', async (_req, res) => {
  try {
    res.json(await query('SELECT * FROM Banking_Details ORDER BY Account_ID'));
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/banking', async (req, res) => {
  try {
    const { P_No_O_No, Account_Title, IBAN, Bank_Name_Branch } = req.body;
    const result = await query(
      `INSERT INTO Banking_Details
        (P_No_O_No, Account_Title, IBAN, Bank_Name_Branch)
       VALUES (?, ?, ?, ?)`,
      [P_No_O_No, Account_Title, IBAN, Bank_Name_Branch]
    );
    res.status(201).json(await getBankingRecord(result.insertId));
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/banking/:accountId', async (req, res) => {
  try {
    const accountId = Number(req.params.accountId);
    const { P_No_O_No, Account_Title, IBAN, Bank_Name_Branch } = req.body;
    await query(
      `UPDATE Banking_Details
       SET P_No_O_No = ?, Account_Title = ?, IBAN = ?, Bank_Name_Branch = ?
       WHERE Account_ID = ?`,
      [P_No_O_No, Account_Title, IBAN, Bank_Name_Branch, accountId]
    );
    res.json(await getBankingRecord(accountId));
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/banking/:accountId', async (req, res) => {
  try {
    await query('DELETE FROM Banking_Details WHERE Account_ID = ?', [Number(req.params.accountId)]);
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/children', async (_req, res) => {
  try {
    res.json(await query('SELECT * FROM Dependent_Children ORDER BY Child_ID'));
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/children/by-parent/:pNo', async (req, res) => {
  try {
    res.json(await query('SELECT * FROM Dependent_Children WHERE P_No_O_No = ? ORDER BY Child_Name', [req.params.pNo]));
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/children', async (req, res) => {
  try {
    const { P_No_O_No, Child_Name, Age, CNIC_BForm_No, Disease_Disability, Disability_Category, School } = req.body;
    const result = await query(
      `INSERT INTO Dependent_Children
        (P_No_O_No, Child_Name, Age, CNIC_BForm_No, Disease_Disability, Disability_Category, School)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [P_No_O_No, Child_Name, Age, CNIC_BForm_No, Disease_Disability, Disability_Category, School]
    );
    const child = await getChildRecord(result.insertId);
    if (child) {
      await syncChildToPortal(child);
    }
    res.status(201).json(child);
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/children/:childId', async (req, res) => {
  try {
    const childId = Number(req.params.childId);
    const { P_No_O_No, Child_Name, Age, CNIC_BForm_No, Disease_Disability, Disability_Category, School } = req.body;
    await query(
      `UPDATE Dependent_Children
       SET P_No_O_No = ?, Child_Name = ?, Age = ?, CNIC_BForm_No = ?, Disease_Disability = ?, Disability_Category = ?, School = ?
       WHERE Child_ID = ?`,
      [P_No_O_No, Child_Name, Age, CNIC_BForm_No, Disease_Disability, Disability_Category, School, childId]
    );
    const child = await getChildRecord(childId);
    if (child) {
      await syncChildToPortal(child);
    }
    res.json(child);
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/children/:childId', async (req, res) => {
  try {
    const childId = Number(req.params.childId);
    const existing = await getChildRecord(childId);
    await transaction(async (connection) => {
      await connection.query('DELETE FROM Child_Gadgets WHERE Child_ID = ?', [childId]);
      await connection.query('DELETE FROM Monthly_Grants WHERE Child_ID = ?', [childId]);
      await connection.query('DELETE FROM Dependent_Children WHERE Child_ID = ?', [childId]);
    });
    if (existing) {
      await deleteChildFromPortal(existing.Child_ID);
    }
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/grants', async (_req, res) => {
  try {
    res.json(await query('SELECT * FROM Monthly_Grants ORDER BY Grant_ID'));
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/grants', async (req, res) => {
  try {
    const { Child_ID, Monthly_Amount, Total_CFY_Amount, Approved_From, Approved_To } = req.body;
    const result = await query(
      `INSERT INTO Monthly_Grants
        (Child_ID, Monthly_Amount, Total_CFY_Amount, Approved_From, Approved_To)
       VALUES (?, ?, ?, ?, ?)`,
      [Child_ID, Monthly_Amount, Total_CFY_Amount, Approved_From, Approved_To]
    );
    res.status(201).json(await getGrantRecord(result.insertId));
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/grants/:grantId', async (req, res) => {
  try {
    const grantId = Number(req.params.grantId);
    const { Child_ID, Monthly_Amount, Total_CFY_Amount, Approved_From, Approved_To } = req.body;
    await query(
      `UPDATE Monthly_Grants
       SET Child_ID = ?, Monthly_Amount = ?, Total_CFY_Amount = ?, Approved_From = ?, Approved_To = ?
       WHERE Grant_ID = ?`,
      [Child_ID, Monthly_Amount, Total_CFY_Amount, Approved_From, Approved_To, grantId]
    );
    res.json(await getGrantRecord(grantId));
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/grants/:grantId', async (req, res) => {
  try {
    await query('DELETE FROM Monthly_Grants WHERE Grant_ID = ?', [Number(req.params.grantId)]);
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/gadgets', async (_req, res) => {
  try {
    res.json(await query('SELECT * FROM Child_Gadgets ORDER BY Gadget_ID'));
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/gadgets', async (req, res) => {
  try {
    const { Child_ID, Detail_of_Gadgets, Base_Cost, Acquisition_Type } = req.body;
    const result = await query(
      `INSERT INTO Child_Gadgets
        (Child_ID, Detail_of_Gadgets, Base_Cost, Acquisition_Type)
       VALUES (?, ?, ?, ?)`,
      [Child_ID, Detail_of_Gadgets, Base_Cost, Acquisition_Type]
    );
    res.status(201).json(await getGadgetRecord(result.insertId));
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/gadgets/:gadgetId', async (req, res) => {
  try {
    const gadgetId = Number(req.params.gadgetId);
    const { Child_ID, Detail_of_Gadgets, Base_Cost, Acquisition_Type } = req.body;
    await query(
      `UPDATE Child_Gadgets
       SET Child_ID = ?, Detail_of_Gadgets = ?, Base_Cost = ?, Acquisition_Type = ?
       WHERE Gadget_ID = ?`,
      [Child_ID, Detail_of_Gadgets, Base_Cost, Acquisition_Type, gadgetId]
    );
    res.json(await getGadgetRecord(gadgetId));
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/gadgets/:gadgetId', async (req, res) => {
  try {
    await query('DELETE FROM Child_Gadgets WHERE Gadget_ID = ?', [Number(req.params.gadgetId)]);
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/seed-sample', async (_req, res) => {
  try {
    const existingParents = await query('SELECT COUNT(*) AS count FROM Parent_Beneficiary');
    if (existingParents[0].count > 0) {
      res.json({ seeded: false, message: 'Sample data already exists' });
      return;
    }

    const today = new Date();
    const futureDate = new Date();
    futureDate.setFullYear(today.getFullYear() + 1);

    const expiringSoon = new Date();
    expiringSoon.setDate(today.getDate() + 15);

    const parents = [
      ['P-12345', 'Muhammad Ahmad Khan', 'Captain', '5th Infantry Battalion', 'GHQ Rawalpindi', 'Serving', '35201-1234567-1'],
      ['P-12346', 'Ali Hassan Shah', 'Major', '10th Artillery Regiment', 'GHQ Rawalpindi', 'Retired', '35201-2345678-2'],
      ['P-12347', 'Fatima Bibi', 'Lieutenant Colonel', 'Medical Corps', 'CMH Lahore', 'Serving', '35201-3456789-3'],
      ['P-12348', 'Imranullah Khan', 'Naib Subedar', 'Frontier Force Regiment', 'Peshawar Garrison', 'Expired', '35201-4567890-4']
    ];

    const documents = [
      ['P-12345', 'GHQ/2024/1234', '0300-1234567', 'A-01', 'F-1001'],
      ['P-12346', 'GHQ/2024/1235', '0300-2345678', 'A-02', 'F-1002'],
      ['P-12347', 'CMH/2024/567', '0300-3456789', 'B-01', 'F-2001'],
      ['P-12348', 'PG/2024/890', '0300-4567890', 'A-03', 'F-1003']
    ];

    const banking = [
      ['P-12345', 'Muhammad Ahmad Khan', 'PK36SCBL0000001123456701', 'Standard Chartered Bank, Lahore'],
      ['P-12346', 'Ali Hassan Shah', 'PK36SCBL0000001123456702', 'Standard Chartered Bank, Islamabad'],
      ['P-12347', 'Fatima Bibi', 'PK36SCBL0000001123456703', 'HBL Bank, Lahore'],
      ['P-12348', 'Imranullah Khan', 'PK36SCBL0000001123456704', 'UBL Bank, Peshawar']
    ];

    const children = [
      ['P-12345', 'Ahmad Khan Jr.', 8, '35201-1234567-0001', 'Autism Spectrum Disorder', 'A', 'Special Education School Lahore'],
      ['P-12345', 'Sara Khan', 12, '35201-1234567-0002', 'Cerebral Palsy', 'B', 'Rehabilitation Center Islamabad'],
      ['P-12346', 'Hassan Shah', 6, '35201-2345678-0001', 'Down Syndrome', 'A', 'Special Children Academy'],
      ['P-12347', 'Ayesha Bibi', 15, '35201-3456789-0001', 'Hearing Impairment', 'C', 'Deaf Reach School'],
      ['P-12348', 'Kamran Khan', 10, '35201-4567890-0001', 'Visual Impairment', 'B', 'Blind School Peshawar']
    ];

    await transaction(async (connection) => {
      for (const parent of parents) {
        await connection.query(
          `INSERT INTO Parent_Beneficiary
            (P_No_O_No, Parent_Name, Rank_Rate, Unit, Admin_Authority, Service_Status, Parent_CNIC)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          parent
        );
      }

      for (const document of documents) {
        await connection.query(
          `INSERT INTO Document_Tracking
            (P_No_O_No, Letter_Reference, Contact_No, Almirah_No, File_No)
           VALUES (?, ?, ?, ?, ?)`,
          document
        );
      }

      for (const record of banking) {
        await connection.query(
          `INSERT INTO Banking_Details
            (P_No_O_No, Account_Title, IBAN, Bank_Name_Branch)
           VALUES (?, ?, ?, ?)`,
          record
        );
      }

      for (const child of children) {
        await connection.query(
          `INSERT INTO Dependent_Children
            (P_No_O_No, Child_Name, Age, CNIC_BForm_No, Disease_Disability, Disability_Category, School)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          child
        );
      }

      const childRows = await connection.query('SELECT Child_ID, P_No_O_No FROM Dependent_Children ORDER BY Child_ID');
      const [rows] = childRows;
      const childIds = rows.map((row) => row.Child_ID);

      for (let index = 0; index < childIds.length; index += 1) {
        const childId = childIds[index];
        const approvedTo = index === 2 || index === 4 ? expiringSoon : futureDate;
        const amount = [25000, 35000, 28000, 15000, 22000][index];
        await connection.query(
          `INSERT INTO Monthly_Grants
            (Child_ID, Monthly_Amount, Total_CFY_Amount, Approved_From, Approved_To)
           VALUES (?, ?, ?, ?, ?)`,
          [childId, amount, amount * 12, today.toISOString().split('T')[0], approvedTo.toISOString().split('T')[0]]
        );
      }

      const gadgetRecords = [
        [1, 'Communication Tablet with AAC Software', 85000, 'Off the Shelf'],
        [2, 'Motorized Wheelchair', 150000, 'Customized'],
        [3, 'Educational Tablet', 45000, 'Reimbursed'],
        [4, 'Hearing Aids (Pair)', 120000, 'Off the Shelf'],
        [5, 'Braille Display Device', 95000, 'Reimbursed']
      ];

      for (const gadget of gadgetRecords) {
        const [childId, detail, cost, acquisition] = gadget;
        await connection.query(
          `INSERT INTO Child_Gadgets
            (Child_ID, Detail_of_Gadgets, Base_Cost, Acquisition_Type)
           VALUES (?, ?, ?, ?)`,
          [childId, detail, cost, acquisition]
        );
      }
    });

    res.json({ seeded: true });
  } catch (error) {
    sendError(res, error);
  }
});

await ensureSchema();


// =============================================================================
// PARENT PORTAL SYNC - Admin Approval Bridge
// =============================================================================

// AllApproval:
const getAllApprovals = async () => {
    try {
        const response = await axios.get(`${PORTAL_API_URL}/api/sync/all-requests`, {
            headers: { 'x-api-key': PORTAL_API_KEY },
            timeout: 5000
        });
        return response.data;
    } catch (error) {
        console.error('[Portal Sync] Failed to fetch approvals:', error.message);
        return [];
    }
};

// getPendingApprovals for the approve action 
const getPendingApprovals = async () => {
    try {
        const response = await axios.get(`${PORTAL_API_URL}/api/sync/pending`, {
            headers: { 'x-api-key': PORTAL_API_KEY },
            timeout: 5000
        });
        return response.data;
    } catch (error) {
        console.error('[Portal Sync] Failed to fetch pending:', error.message);
        return [];
    }
};

// Helper: sync admin-created parent TO portal
const syncParentToPortal = async (parentData, adminId) => {
    try {
        const response = await axios.post(
            `${PORTAL_API_URL}/api/sync/admin-created-parent`,
            {
                pNoONo: parentData.P_No_O_No,
                parentName: parentData.Parent_Name,
                rankRate: parentData.Rank_Rate,
                unit: parentData.Unit,
                contactNo: parentData.Contact_No || null,
                cnic: parentData.Parent_CNIC,
                serviceStatus: parentData.Service_Status,
                email: parentData.Email || `${parentData.P_No_O_No}@system.local`,
                adminId: adminId || 1
            },
            {
                headers: { 'x-api-key': PORTAL_API_KEY },
                timeout: 5000
            }
        );
        return response.data;
    } catch (error) {
        console.error('[Portal Sync] Failed to sync parent:', error.message);
        throw new Error('Portal sync failed');
    }
};

const syncChildToPortal = async (childData) => {
  try {
    await axios.post(
      `${PORTAL_API_URL}/api/sync/admin-child`,
      {
        mainDbChildId: childData.Child_ID,
        pNoONo: childData.P_No_O_No,
        childName: childData.Child_Name,
        age: childData.Age,
        cnicBformNo: childData.CNIC_BForm_No,
        diseaseDisability: childData.Disease_Disability,
        disabilityCategory: childData.Disability_Category,
        school: childData.School
      },
      {
        headers: { 'x-api-key': PORTAL_API_KEY },
        timeout: 5000
      }
    );
  } catch (error) {
    console.error('[Portal Sync] Failed to sync child:', error.message);
  }
};

const deleteChildFromPortal = async (childId) => {
  try {
    await axios.delete(`${PORTAL_API_URL}/api/sync/admin-child/${childId}`, {
      headers: { 'x-api-key': PORTAL_API_KEY },
      timeout: 5000
    });
  } catch (error) {
    console.error('[Portal Sync] Failed to delete child:', error.message);
  }
};

// GET: List pending approval requests from parent portal
app.get('/api/admin/pending-approvals', async (req, res) => {
    try {
        const approvals = await getAllApprovals();
        res.json(approvals);
    } catch (error) {
        sendError(res, error, 'Failed to fetch approvals');
    }
});

// POST: Approve or reject a request
app.post('/api/admin/approve-request', async (req, res) => {
    const { requestId, action, notes } = req.body;

    if (!requestId || !['approve', 'reject'].includes(action)) {
        res.status(400).json({ message: 'Invalid request. Need requestId and action (approve/reject)' });
        return;
    }

    try {
        // Get fresh pending list to find the request
        const approvals = await getPendingApprovals();
        const request = approvals.find(a => a.request_id === Number(requestId));

        if (!request) {
            res.status(404).json({ message: 'Request not found or already processed' });
            return;
        }

        const parsedPayload = (rawPayload) => {
          if (!rawPayload) {
            return {};
          }

          if (typeof rawPayload === 'string') {
            try {
              return JSON.parse(rawPayload);
            } catch {
              return {};
            }
          }

          return rawPayload;
        };

        let mainDbChildId = null;

        if (action === 'approve') {
            // Insert into MAIN database (pnba) - this is the only write path
            if (request.request_type === 'parent_registration') {
                // Check if parent already exists in main DB
                const existing = await query(
                    'SELECT P_No_O_No FROM Parent_Beneficiary WHERE P_No_O_No = ?',
                    [request.p_no_o_no]
                );

                if (existing.length === 0) {
                    const payload = parsedPayload(request.payload);
                    await query(
                        `INSERT INTO Parent_Beneficiary 
                         (P_No_O_No, Parent_Name, Rank_Rate, Unit, Admin_Authority, Service_Status, Parent_CNIC)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [
                            request.p_no_o_no,
                            payload.parentName,
                            payload.rankRate,
                            payload.unit,
                            payload.adminAuthority || null, // Admin_Authority not in portal payload
                            payload.serviceStatus,
                            payload.cnic
                        ]
                    );
                }
                    } else if (request.request_type === 'child_addition') {
                      const payload = parsedPayload(request.payload);
                const result = await query(
                    `INSERT INTO Dependent_Children 
                     (P_No_O_No, Child_Name, Age, CNIC_BForm_No, Disease_Disability, 
                      Disability_Category, School)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        request.p_no_o_no,
                        payload.childName,
                        payload.age,
                        payload.cnicBformNo,
                        payload.diseaseDisability,
                        payload.disabilityCategory,
                        payload.school
                    ]
                );
                mainDbChildId = result.insertId;
                const insertedChild = await getChildRecord(mainDbChildId);
                if (insertedChild) {
                  await syncChildToPortal(insertedChild);
                }
            }
        }

        // Notify portal system of the decision
        await axios.post(
            `${PORTAL_API_URL}/api/sync/approval`,
            {
                requestId: Number(requestId),
                action,
                adminNotes: notes || '',
                mainDbChildId
            },
            {
                headers: { 'x-api-key': PORTAL_API_KEY },
                timeout: 5000
            }
        );

        res.json({ success: true, message: `Request ${action}d successfully` });

    } catch (error) {
        sendError(res, error, 'Approval processing failed');
    }
});

// POST: Create parent in main DB + sync to portal (admin action)
app.post('/api/admin/parents-with-portal', async (req, res) => {
    try {
        const { P_No_O_No, Parent_Name, Rank_Rate, Unit, Admin_Authority, Service_Status, Parent_CNIC, Email } = req.body;

        // Insert into main DB first
        await query(
            `INSERT INTO Parent_Beneficiary
             (P_No_O_No, Parent_Name, Rank_Rate, Unit, Admin_Authority, Service_Status, Parent_CNIC)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [P_No_O_No, Parent_Name, Rank_Rate, Unit, Admin_Authority || null, Service_Status, Parent_CNIC]
        );

        // Sync to portal (creates login credentials)
        let portalData = null;
        try {
            portalData = await syncParentToPortal({
                P_No_O_No, Parent_Name, Rank_Rate, Unit,
                Contact_No: null, Parent_CNIC, Service_Status, Email
            }, 1); // adminId = 1 for now, replace with req.user.id when you have auth
        } catch (syncErr) {
            console.error('[Portal Sync] Error:', syncErr.message);
        }

        const newParent = await getParentRecord(P_No_O_No);

        res.status(201).json({
            ...newParent,
            portalAccess: portalData ? {
                loginId: P_No_O_No,
                defaultPassword: portalData.defaultPassword,
                note: 'Share these credentials securely with the parent'
            } : {
                note: 'Portal sync failed - retry from admin panel'
            }
        });

    } catch (error) {
        sendError(res, error);
    }
});

// GET: Check portal connection health
app.get('/api/admin/portal-health', async (_req, res) => {
    try {
        const response = await axios.get(`${PORTAL_API_URL}/health`, { timeout: 3000 });
        res.json({ connected: true, portal: response.data });
    } catch (error) {
        res.status(503).json({ connected: false, error: error.message });
    }
});
//===============================================================================================================

app.listen(port, () => {
  console.log(`API server running at http://localhost:${port}`);
  console.log(`[Portal Sync] Connected to: ${PORTAL_API_URL}`);
});

