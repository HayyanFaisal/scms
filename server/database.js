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
    // Create core tables first so follow-up FKs always have valid targets.
    await connection.query(
      `CREATE TABLE IF NOT EXISTS Parent_Beneficiary (
        P_No_O_No VARCHAR(50) PRIMARY KEY,
        Parent_Name VARCHAR(100) NOT NULL,
        Rank_Rate VARCHAR(50),
        Unit VARCHAR(100),
        Admin_Authority VARCHAR(100),
        Service_Status ENUM('Serving', 'Retired', 'Expired'),
        Parent_CNIC VARCHAR(20)
      )`
    );

    await connection.query(
      `CREATE TABLE IF NOT EXISTS Document_Tracking (
        Doc_ID INT PRIMARY KEY AUTO_INCREMENT,
        P_No_O_No VARCHAR(50),
        Letter_Reference VARCHAR(255),
        Contact_No VARCHAR(50),
        Almirah_No VARCHAR(20),
        File_No VARCHAR(20),
        FOREIGN KEY (P_No_O_No) REFERENCES Parent_Beneficiary(P_No_O_No)
      )`
    );

    await connection.query(
      `CREATE TABLE IF NOT EXISTS Banking_Details (
        Account_ID INT PRIMARY KEY AUTO_INCREMENT,
        P_No_O_No VARCHAR(50),
        Account_Title VARCHAR(100),
        IBAN VARCHAR(50) UNIQUE,
        Bank_Name_Branch VARCHAR(255),
        FOREIGN KEY (P_No_O_No) REFERENCES Parent_Beneficiary(P_No_O_No)
      )`
    );

    await connection.query(
      `CREATE TABLE IF NOT EXISTS Dependent_Children (
        Child_ID INT PRIMARY KEY AUTO_INCREMENT,
        P_No_O_No VARCHAR(50),
        Child_Name VARCHAR(100),
        Age DECIMAL(4,1),
        CNIC_BForm_No VARCHAR(20) UNIQUE,
        Disease_Disability TEXT,
        Disability_Category CHAR(1),
        School VARCHAR(100),
        FOREIGN KEY (P_No_O_No) REFERENCES Parent_Beneficiary(P_No_O_No)
      )`
    );

    await connection.query(
      `CREATE TABLE IF NOT EXISTS Monthly_Grants (
        Grant_ID INT PRIMARY KEY AUTO_INCREMENT,
        Child_ID INT,
        Monthly_Amount DECIMAL(10,2),
        Total_CFY_Amount DECIMAL(10,2),
        Approved_From DATE,
        Approved_To DATE,
        FOREIGN KEY (Child_ID) REFERENCES Dependent_Children(Child_ID)
      )`
    );

    await connection.query(
      `CREATE TABLE IF NOT EXISTS Child_Gadgets (
        Gadget_ID INT PRIMARY KEY AUTO_INCREMENT,
        Child_ID INT,
        Detail_of_Gadgets VARCHAR(255),
        Base_Cost DECIMAL(10,2),
        Tax_18_Percent DECIMAL(10,2) AS (Base_Cost * 0.18),
        Total_Cost DECIMAL(10,2) AS (Base_Cost * 1.18),
        Acquisition_Type ENUM('Off the Shelf', 'Customized', 'Reimbursed'),
        FOREIGN KEY (Child_ID) REFERENCES Dependent_Children(Child_ID)
      )`
    );

    await connection.query(
      `CREATE TABLE IF NOT EXISTS Parent_Document_Files (
        Document_File_ID INT AUTO_INCREMENT PRIMARY KEY,
        P_No_O_No VARCHAR(50) NOT NULL,
        Doc_Type VARCHAR(120) NULL,
        Original_File_Name VARCHAR(255) NOT NULL,
        Stored_File_Name VARCHAR(255) NOT NULL,
        Mime_Type VARCHAR(120) NOT NULL,
        File_Size_Bytes INT NOT NULL,
        Storage_Path VARCHAR(500) NOT NULL,
        Uploaded_At TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_parent_document_files_parent (P_No_O_No),
        CONSTRAINT fk_parent_document_files_parent
          FOREIGN KEY (P_No_O_No)
          REFERENCES Parent_Beneficiary(P_No_O_No)
          ON DELETE CASCADE
      )`
    );

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
