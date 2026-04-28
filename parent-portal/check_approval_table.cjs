const mysql = require('mysql2/promise');

async function checkApprovalTable() {
  const pool = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'Hayyan',
    database: 'pnba'
  });
  
  console.log('=== Approval_Requests table structure ===');
  const [columns] = await pool.execute('DESCRIBE approval_requests');
  columns.forEach(col => console.log(`${col.Field}: ${col.Type}`));
  
  await pool.end();
}

checkApprovalTable().catch(console.error);
