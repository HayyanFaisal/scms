const mysql = require('mysql2/promise');

async function checkParentTable() {
  const pool = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'Hayyan',
    database: 'pnba'
  });
  
  console.log('=== parent_beneficiary table structure ===');
  const [columns] = await pool.execute('DESCRIBE parent_beneficiary');
  columns.forEach(col => console.log(`${col.Field}: ${col.Type}`));
  
  console.log('\nTotal columns:', columns.length);
  
  await pool.end();
}

checkParentTable().catch(console.error);
