import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const DB_PATH = path.join(__dirname, '..', 'database.db');
const SQL_PATH = path.join(__dirname, '..', 'db', 'db.sql');

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
