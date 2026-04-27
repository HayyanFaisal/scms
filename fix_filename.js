import mysql from 'mysql2/promise';

async function fixFilename() {
    const connection = await mysql.createConnection({
        host: '127.0.0.1',
        user: 'root',
        password: 'Hayyan',
        database: 'scms_portal'
    });

    try {
        const [result] = await connection.execute(
            `UPDATE Child_Documents 
             SET file_path = '/scmsForms/9090/assessment_performa_122.jpg' 
             WHERE child_id = 12 AND document_type = 'assessment_performa'`
        );
        
        console.log('Updated', result.affectedRows, 'rows');
        
        // Verify the update
        const [rows] = await connection.execute(
            'SELECT document_type, file_path FROM Child_Documents WHERE child_id = 12'
        );
        console.log('Current documents:', rows);
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await connection.end();
    }
}

fixFilename();
