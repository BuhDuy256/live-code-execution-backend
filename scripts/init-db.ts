import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

// Resolve paths to absolute
const rawDbPath = process.env['DB_PATH'] || './data/database.db';
const DB_PATH = path.isAbsolute(rawDbPath) ? rawDbPath : path.resolve(process.cwd(), rawDbPath);
const SQL_PATH = path.resolve(process.cwd(), 'db', 'db.sql');

console.log(`[Init DB] Database path: ${DB_PATH}`);
console.log(`[Init DB] SQL schema path: ${SQL_PATH}`);

// Check if --force flag is provided to drop existing tables
const forceReset = process.argv.includes('--force');

try {
  const sql = fs.readFileSync(SQL_PATH, 'utf-8');
  const db = new Database(DB_PATH);

  if (forceReset) {
    console.log('Force reset: Dropping existing tables...');
    db.exec(`
      DROP TABLE IF EXISTS code_executions;
      DROP TABLE IF EXISTS code_sessions;
      DROP TABLE IF EXISTS code_templates;
    `);
    console.log('Existing tables dropped.');
  }

  console.log('Creating database tables...');
  db.exec(sql);

  console.log('Database initialized successfully!');
  console.log(`Database created at: ${DB_PATH}`);

  db.close();
} catch (error) {
  console.error('Error initializing database:', error);
  process.exit(1);
}
