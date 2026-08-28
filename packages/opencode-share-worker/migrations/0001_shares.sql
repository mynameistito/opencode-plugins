CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'expired', 'deleted'))
);
CREATE INDEX IF NOT EXISTS shares_expiry_idx ON shares (expires_at);
