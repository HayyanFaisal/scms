import mysql from 'mysql2/promise';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not configured');
}

export const pool = mysql.createPool(connectionString);

export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

export async function transaction(callback) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );

  return rows.length > 0;
}

async function addColumnIfMissing(connection, tableName, columnName, definition) {
  const exists = await columnExists(connection, tableName, columnName);
  if (!exists) {
    await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

export async function ensureSchema() {
  const connection = await pool.getConnection();

  try {
    await addColumnIfMissing(connection, 'Parent_Beneficiary', 'No_of_Disabled_Children', 'INT DEFAULT 0');
    await addColumnIfMissing(connection, 'Document_Tracking', 'Total_No_of_Children', 'INT NULL');
    await addColumnIfMissing(connection, 'Banking_Details', 'CNIC_of_Account_Holder', 'VARCHAR(20) NULL');

    await addColumnIfMissing(connection, 'Dependent_Children', 'Disability_Category', "CHAR(1) NULL");
    await addColumnIfMissing(connection, 'Dependent_Children', 'Disability_Certificate_No', 'VARCHAR(100) NULL');
    await addColumnIfMissing(connection, 'Dependent_Children', 'Authority', 'VARCHAR(100) NULL');
    await addColumnIfMissing(connection, 'Dependent_Children', 'Category_Allotted_By', 'VARCHAR(100) NULL');

    await addColumnIfMissing(connection, 'Monthly_Grants', 'Monthly_Amount', 'DECIMAL(10,2) NULL');
    await addColumnIfMissing(connection, 'Monthly_Grants', 'Total_CFY_Amount', 'DECIMAL(10,2) NULL');

    await addColumnIfMissing(connection, 'Child_Gadgets', 'Base_Cost', 'DECIMAL(10,2) NULL');
    await addColumnIfMissing(connection, 'Child_Gadgets', 'Tax_18_Percent', 'DECIMAL(10,2) GENERATED ALWAYS AS (Base_Cost * 0.18) STORED');
    await addColumnIfMissing(connection, 'Child_Gadgets', 'Total_Cost', 'DECIMAL(10,2) GENERATED ALWAYS AS (Base_Cost * 1.18) STORED');
    await addColumnIfMissing(connection, 'Child_Gadgets', 'Acquisition_Type', "ENUM('Off the Shelf', 'Customized', 'Reimbursed') NULL");
  } finally {
    connection.release();
  }
}
