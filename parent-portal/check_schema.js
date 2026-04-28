const mysql = require('mysql2/promise');

async function checkSchema() {
  const pool = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'pnba'
  });
  
  console.log('\n=== parent_beneficiary table structure ===');
  const [columns] = await pool.execute('DESCRIBE parent_beneficiary');
  columns.forEach(col => console.log(col));
  
  await pool.end();
}

checkSchema().catch(console.error);
