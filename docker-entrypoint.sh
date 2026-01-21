#!/bin/sh
set -e

echo "Starting Live Code Execution Backend..."

# Check if database exists
if [ ! -f "/app/data/database.db" ]; then
  echo "Database not found. Initializing database..."
  node dist/scripts/init-db.js
  echo "Database initialized successfully"
else
  echo "Database already exists"
fi

# Execute the main command
echo "Starting application: $@"
exec "$@"
