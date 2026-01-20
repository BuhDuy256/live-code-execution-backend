import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const DB_PATH = path.join(__dirname, '..', 'database.db');
const SQL_PATH = path.join(__dirname, '..', 'db', 'db.sql');

try {
  const sql = fs.readFileSync(SQL_PATH, 'utf-8');
  const db = new Database(DB_PATH);

  console.log('Creating database tables...');
  db.exec(sql);

  console.log('Database initialized successfully!');
  console.log(`Database created at: ${DB_PATH}`);

  db.close();
} catch (error) {
  console.error('Error initializing database:', error);
  process.exit(1);
}
