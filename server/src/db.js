const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { DB } = require('./config');
const SCHEMA = require('./schema');
const TRIGGERS = require('./triggers');

// ISO strings from the app ("2026-10-05T10:04:48.256Z") are stored as UTC DATETIME values.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const prep = (p = []) => p.map((v) => (typeof v === 'string' && ISO.test(v) ? v.replace('T', ' ').replace('Z', '') : v));

const pool = mysql.createPool({
  host: DB.host, port: DB.port, user: DB.user, password: DB.password, database: DB.name,
  waitForConnections: true, connectionLimit: 10, charset: 'utf8mb4', decimalNumbers: true,
  // DATETIME columns come back as ISO strings (UTC) so the rest of the app is unchanged
  typeCast(field, next) {
    if (field.type === 'DATE') return field.string();   // 'YYYY-MM-DD'
    if (field.type === 'DATETIME' || field.type === 'TIMESTAMP') {
      const v = field.string();
      return v ? v.replace(' ', 'T') + 'Z' : null;
    }
    return next();
  },
});
pool.pool.on('connection', (c) => c.query("SET time_zone = '+00:00'"));

const api = (exec) => ({
  all: async (sql, params) => (await exec.query(sql, prep(params)))[0],
  one: async (sql, params) => (await exec.query(sql, prep(params)))[0][0],
  run: async (sql, params) => (await exec.query(sql, prep(params)))[0], // { insertId, affectedRows }
});

// Existing databases (created by an older version) get the new columns automatically — nothing to import.
const MIGRATIONS = [
  ['leads', 'import_label', 'VARCHAR(255) NULL'],
  ['leads', 'inbox_date', 'DATE NULL'],
  ['leads', 'inbox_pinned', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['leads', 'shared_from', 'INT UNSIGNED NULL'],
  ['leads', 'shared_at', 'DATETIME(3) NULL'],
  ['leads', 'shared_note', 'VARCHAR(300) NULL'],
  ['leads', 'interested_at', 'DATETIME(3) NULL'],
  ['users', 'zoom_link', 'VARCHAR(500) NULL'],
  ['leads', 'executive_name', 'VARCHAR(120) NULL AFTER executive_id'],
  ['calls', 'executive_name', 'VARCHAR(120) NULL AFTER executive_id'],
];
async function migrate() {
  for (const [table, col, ddl] of MIGRATIONS) {
    const [r] = await pool.query('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?', [DB.name, table, col]);
    if (!r.length) { await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${ddl}`); console.log(`Database updated: ${table}.${col} added`); }
  }
  const [ix] = await pool.query("SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME='leads' AND INDEX_NAME='idx_leads_inbox'", [DB.name]);
  if (!ix.length) await pool.query('ALTER TABLE leads ADD KEY idx_leads_inbox (call_count, executive_id, inbox_date)');

  // Login name must be unique too (mobile number already is). If old data has two people with the same name, tell the admin.
  const [nx] = await pool.query("SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME='users' AND INDEX_NAME='uq_users_name'", [DB.name]);
  if (!nx.length) {
    try { await pool.query('ALTER TABLE users ADD UNIQUE KEY uq_users_name (name)'); console.log('Database updated: users.name is now unique'); }
    catch (e) { console.warn('[!] Two users have the same name, so names could not be made unique. Rename one of them in Admin -> Executives, then restart.'); }
  }

  // executive name next to every id (triggers keep it in sync), then fill the old rows once
  for (const [name, ddl] of TRIGGERS) {
    try { await pool.query(`DROP TRIGGER IF EXISTS ${name}`); await pool.query(ddl); }
    catch (e) { console.warn(`Could not create trigger ${name}: ${e.message}`); }
  }
  await pool.query('UPDATE leads l JOIN users u ON u.id=l.executive_id SET l.executive_name=u.name WHERE l.executive_name IS NULL OR l.executive_name<>u.name');
  await pool.query('UPDATE calls c JOIN users u ON u.id=c.executive_id SET c.executive_name=u.name WHERE c.executive_name IS NULL OR c.executive_name<>u.name');
}

// The old separate import tables (import_batches / import_sources) are retired: clients live only in `leads`,
// connected Google Sheets move to server/data/sheet-sources.json, import history comes from activity_log.
async function retireImportTables() {
  const [t] = await pool.query("SELECT TABLE_NAME n FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME IN ('import_sources','import_batches')", [DB.name]);
  const has = (n) => t.some((x) => x.n === n);
  if (has('import_sources')) {
    const sources = require('./sheetSources');
    const [rows] = await pool.query('SELECT * FROM import_sources');
    for (const r of rows) {
      if (!sources.findByUrl(r.url)) sources.upsert({ label: r.label, url: r.url, name_col: r.name_col, phone_col: r.phone_col,
        auto_sync: r.auto_sync ? 1 : 0, last_synced_at: r.last_synced_at ? String(r.last_synced_at) : null, last_result: null });
    }
    await pool.query('DROP TABLE import_sources');
    console.log(`Database cleaned: import_sources removed (${rows.length} connected sheet(s) kept in server/data/sheet-sources.json)`);
  }
  if (has('import_batches')) { await pool.query('DROP TABLE import_batches'); console.log('Database cleaned: import_batches removed (history is in the Activity Log)'); }
}

const db = {
  ...api(pool),
  async tx(fn) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const out = await fn(api(conn));
      await conn.commit();
      return out;
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  },

  // Creates the database + all tables if they do not exist, and the first admin login.
  async init() {
    // 1. Try to create database if not exists (works on local XAMPP / root).
    // On cPanel shared hosting, database is pre-created in cPanel UI and user lacks global CREATE privilege.
    try {
      const c = await mysql.createConnection({ host: DB.host, port: DB.port, user: DB.user, password: DB.password });
      try {
        await c.query(`CREATE DATABASE IF NOT EXISTS \`${DB.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      } catch (createErr) {
        // Ignored if user lacks global CREATE privilege (cPanel)
      }
      await c.end();
    } catch (e) {
      // Connecting without a database name may be disallowed on some hosts; continue to test the pool directly
    }

    // 2. Test pool connection to verify DB exists and credentials are correct
    try {
      const conn = await pool.getConnection();
      conn.release();
    } catch (e) {
      const hint = e.code === 'ECONNREFUSED' ? 'MySQL is not running.'
        : (e.code === 'ER_ACCESS_DENIED_ERROR' || e.code === 'ER_DBACCESS_DENIED_ERROR') ? 'Wrong MySQL user, password, or database name. Check DB_USER, DB_PASSWORD, and DB_NAME in server/.env.'
        : (e.code === 'ER_BAD_DB_ERROR') ? `Database '${DB.name}' does not exist. Please create it first in cPanel MySQL Databases.` : e.message;
      throw new Error(`Cannot connect to MySQL at ${DB.host}:${DB.port} — ${hint}`);
    }
    for (const ddl of SCHEMA) await pool.query(ddl);
    await migrate();
    try { await retireImportTables(); } catch (e) { console.warn('Could not remove the old import tables:', e.message); }
    const { c } = await db.one('SELECT COUNT(*) c FROM users');
    if (c === 0) {
      await db.run('INSERT INTO users (name, phone, password_hash, role) VALUES (?,?,?,?)',
        ['Admin', '9999999999', bcrypt.hashSync('admin123', 10), 'admin']);
      console.log('First run: admin created -> mobile 9999999999 / password admin123 (change it after login)');
    }
  },
};

module.exports = db;
