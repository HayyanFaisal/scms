const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function debugSignupFinal() {
  const pool = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'Hayyan',
    database: 'pnba'
  });
  
  try {
    console.log('=== Testing INSERT with exact column count ===');
    
    // Get exact column count
    const [columns] = await pool.execute('DESCRIBE parent_beneficiary');
    console.log('Total columns in table:', columns.length);
    
    // Test with minimal required columns first
    const minimalSQL = `INSERT INTO parent_beneficiary 
      (P_No_O_No, Parent_Name, Parent_CNIC, Email, Password_Hash, Status, Origin, Created_At)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`;
    
    const minimalParams = ['TEST-007', 'Debug User', '1234567890123', 'debug@test.com', 
      await bcrypt.hash('test123', 12), 'pending', 'self_registered'];
    
    console.log('Minimal INSERT columns: 8');
    console.log('Minimal INSERT parameters:', minimalParams.length);
    
    const [result] = await pool.execute(minimalSQL, minimalParams);
    console.log('✅ Minimal INSERT successful, ID:', result.insertId);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

debugSignupFinal().catch(console.error);
