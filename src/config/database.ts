import knex from "knex";
import path from "path";

// Support both development and production environments
const isProduction = process.env['NODE_ENV'] === 'production';
const dbPath = process.env['DB_PATH'] ||
  (isProduction
    ? path.join(__dirname, "..", "..", "data", "database.db")
    : path.join(__dirname, "..", "..", "data", "database.db")
  );

const db = knex({
  client: "sqlite3",
  connection: {
    filename: dbPath
  },
  useNullAsDefault: true
});

export default db;