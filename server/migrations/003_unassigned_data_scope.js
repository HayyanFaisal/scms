export async function up(connection) {
  await connection.query(
    `INSERT INTO scms_data_scopes
      (name, scope_type, configuration, is_builtin, is_active)
     VALUES ('Unassigned records', 'no_authority', NULL, TRUE, TRUE)
     ON DUPLICATE KEY UPDATE
       scope_type = VALUES(scope_type), is_builtin = TRUE, is_active = TRUE`
  );
}
