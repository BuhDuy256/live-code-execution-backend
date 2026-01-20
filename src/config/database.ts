import knex from "knex";
import path from "path";

const db = knex({
  client: "sqlite3",
  connection: {
    filename: path.join(__dirname, "..", "..", "database.db")
  },
  useNullAsDefault: true
});

export default db;