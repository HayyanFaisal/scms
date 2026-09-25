import 'dotenv/config';
import { pool } from '../server/database.js';
import { runMigrations } from '../server/migrations.js';
import { hashPassword } from '../server/security.js';

const username = String(process.env.SCMS_BOOTSTRAP_USERNAME || '').trim();
const password = String(process.env.SCMS_BOOTSTRAP_PASSWORD || '');
const displayName = String(process.env.SCMS_BOOTSTRAP_DISPLAY_NAME || 'SCMS Director').trim();
const email = String(process.env.SCMS_BOOTSTRAP_EMAIL || '').trim() || null;

if (!username || password.length < 12) {
  console.error('Set SCMS_BOOTSTRAP_USERNAME and a SCMS_BOOTSTRAP_PASSWORD of at least 12 characters.');
  process.exitCode = 1;
} else {
  try {
    await runMigrations();
    const normalizedUsername = username.toLocaleLowerCase('en-US');
    const [existingDirectors] = await pool.query(
      `SELECT u.id
       FROM scms_users u
       INNER JOIN scms_user_roles ur ON ur.user_id = u.id
       INNER JOIN scms_roles r ON r.id = ur.role_id
       WHERE r.name = 'Director' AND u.is_active = TRUE`
    );

    if (existingDirectors.length > 0) {
      throw new Error('An active Director already exists. Create additional users through the secured application workflow.');
    }

    const passwordHash = await hashPassword(password);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.query(
        `INSERT INTO scms_users
          (username, normalized_username, display_name, email, password_hash,
           must_change_password, temporary_password_expires_at)
         VALUES (?, ?, ?, ?, ?, TRUE, ?)`,
        [username, normalizedUsername, displayName, email, passwordHash, new Date(Date.now() + 24 * 60 * 60_000)]
      );
      await connection.query(
        `INSERT INTO scms_user_roles (user_id, role_id)
         SELECT ?, id FROM scms_roles WHERE name = 'Director'`,
        [result.insertId]
      );
      await connection.query(
        `INSERT INTO scms_audit_events
          (actor_user_id, action, entity_type, entity_id, correlation_id, details)
         VALUES (?, 'users.bootstrap_director', 'user', ?, UUID(), JSON_OBJECT('username', ?))`,
        [result.insertId, String(result.insertId), username]
      );
      await connection.commit();
      console.log(`Director account '${username}' created. Remove bootstrap credentials from the environment now.`);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
