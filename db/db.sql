CREATE TABLE code_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  language TEXT NOT NULL,
  title TEXT,
  source_code TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_code_sessions_user_id ON code_sessions(user_id);
CREATE INDEX idx_code_sessions_created_at ON code_sessions(created_at DESC);

CREATE TABLE code_executions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  source_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  stdout TEXT,
  stderr TEXT,
  exit_code INTEGER,
  error_message TEXT,
  execution_time_ms INTEGER,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  queued_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES code_sessions(id) ON DELETE CASCADE,
  CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'TIMEOUT'))
);

CREATE INDEX idx_code_executions_session_id ON code_executions(session_id);
CREATE INDEX idx_code_executions_status ON code_executions(status);
CREATE INDEX idx_code_executions_queued_at ON code_executions(queued_at DESC);

-- Enforce only 1 active execution (QUEUED or RUNNING) per session
-- This prevents race conditions when multiple requests try to create executions simultaneously
CREATE UNIQUE INDEX idx_active_execution_per_session 
ON code_executions(session_id) 
WHERE status IN ('QUEUED', 'RUNNING');

CREATE TRIGGER update_code_sessions_timestamp 
AFTER UPDATE ON code_sessions
BEGIN
  UPDATE code_sessions SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER update_code_executions_timestamp 
AFTER UPDATE ON code_executions
BEGIN
  UPDATE code_executions SET updated_at = datetime('now') WHERE id = NEW.id;
END;
