CREATE TABLE IF NOT EXISTS registration_requests (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT,
  normalized_email TEXT,
  approval_question TEXT,
  approval_answer TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewed_by TEXT,
  reject_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_registration_requests_status_created
  ON registration_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_registration_requests_username
  ON registration_requests(username);

CREATE INDEX IF NOT EXISTS idx_registration_requests_email
  ON registration_requests(normalized_email);
