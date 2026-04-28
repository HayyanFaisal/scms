const mysql = require('mysql2/promise');

async function checkOtherTables() {
  const pool = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'Hayyan',
    database: 'pnba'
  });
  
  console.log('\n=== Checking for additional needed tables ===');
  
  const neededTables = [
    'Portal_Users',
    'Portal_Login_History', 
    'Approval_Requests',
    'dependent_children'
  ];
  
  for (const table of neededTables) {
    try {
      const [result] = await pool.execute(`SHOW TABLES LIKE '${table}'`);
      if (result.length > 0) {
        console.log(`✅ Table '${table}' exists`);
        const [columns] = await pool.execute(`DESCRIBE ${table}`);
        console.log(`   Columns: ${columns.map(c => c.Field).join(', ')}`);
      } else {
        console.log(`❌ Table '${table}' missing`);
      }
    } catch (error) {
      console.log(`❌ Error checking table '${table}': ${error.message}`);
    }
  }
  
  console.log('\n=== Creating missing tables (if needed) ===');
  
  // Create Portal_Login_History table
  console.log('\n-- Create Portal_Login_History table:');
  console.log(`CREATE TABLE IF NOT EXISTS Portal_Login_History (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    login_status ENUM('LOGIN_SUCCESS', 'LOGIN_FAILED') NOT NULL,
    ip_address VARCHAR(45),
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
  );`);

  // Create Approval_Requests table  
  console.log('\n-- Create Approval_Requests table:');
  console.log(`CREATE TABLE IF NOT EXISTS Approval_Requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    request_type ENUM('parent_registration', 'banking_update', 'child_addition') NOT NULL,
    payload JSON,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    processed_by VARCHAR(100),
    processed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_request_type (request_type)
  );`);
  
  await pool.end();
}

checkOtherTables().catch(console.error);
