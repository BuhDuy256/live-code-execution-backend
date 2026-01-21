import knex from "knex";
import path from "path";

// Resolve DB_PATH to absolute path
// If DB_PATH is relative, resolve it from cwd; if absolute, use as-is
const rawPath = process.env['DB_PATH'] || './data/database.db';
const dbPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);

console.log(`[Database] Using database at: ${dbPath}`);

const db = knex({
  client: "sqlite3",
  connection: {
    filename: dbPath
  },
  useNullAsDefault: true
});

export default db;