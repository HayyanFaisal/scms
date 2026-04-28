const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function debugSignup() {
  const pool = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'Hayyan',
    database: 'pnba'
  });
  
  try {
    const hashedPassword = await bcrypt.hash('test123', 12);
    
    console.log('Testing INSERT with parameters:');
    const params = [
      'TEST-003', // P_No_O_No
      'Debug User', // Parent_Name
      'debug@test.com', // Email
      null, // Contact_No
      '1234567890123', // Parent_CNIC
      null, // Rank_Rate
      null, // Unit
      'HQ COMNOR', // Admin_Authority
      'Serving', // Service_Status
      hashedPassword, // Password_Hash
      'pending', // Status
      'self_registered' // Origin
    ];
    
    console.log('Parameters:', params.map((p, i) => `${i}: ${p}`));
    
    const [result] = await pool.execute(
      `INSERT INTO parent_beneficiary 
       (P_No_O_No, Parent_Name, Email, Contact_No, Parent_CNIC, Rank_Rate, Unit, 
        Admin_Authority, Service_Status, Password_Hash, Status, Origin, Created_At)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      params
    );
    
    console.log('✅ Insert successful, ID:', result.insertId);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

debugSignup().catch(console.error);
