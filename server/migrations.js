import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { pool } from './database.js';

const migrationsDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function runMigrations() {
  const connection = await pool.getConnection();

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS scms_schema_migrations (
        version VARCHAR(160) PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB
    `);

    const migrationFiles = (await fs.readdir(migrationsDirectory))
      .filter(file => /^\d+.*\.js$/.test(file))
      .sort((left, right) => left.localeCompare(right));

    for (const file of migrationFiles) {
      const source = await fs.readFile(path.join(migrationsDirectory, file));
      const checksum = crypto.createHash('sha256').update(source).digest('hex');
      const [rows] = await connection.query(
        'SELECT checksum FROM scms_schema_migrations WHERE version = ?',
        [file]
      );

      if (rows.length > 0) {
        if (rows[0].checksum !== checksum) {
          throw new Error(`Applied migration ${file} has been modified`);
        }
        continue;
      }

      const migration = await import(pathToFileURL(path.join(migrationsDirectory, file)).href);
      if (typeof migration.up !== 'function') throw new Error(`Migration ${file} does not export up()`);

      await migration.up(connection);
      await connection.query(
        'INSERT INTO scms_schema_migrations (version, checksum) VALUES (?, ?)',
        [file, checksum]
      );
      console.log(`[Migration] Applied ${file}`);
    }
  } finally {
    connection.release();
  }
}
