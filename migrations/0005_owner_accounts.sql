-- Building-owner accounts (spec 2026-10-10-owner-accounts §3).

CREATE TABLE owners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT,
  phone TEXT,
  consent_terms_at INTEGER,
  consent_privacy_at INTEGER,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

-- Only the SHA-256 of the emailed token is stored; a database leak yields no usable links.
CREATE TABLE owner_login_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);

-- NULL owner_id = created by the admin. Existing rows stay public ('active').
ALTER TABLE spaces ADD COLUMN owner_id INTEGER REFERENCES owners(id);
ALTER TABLE spaces ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'rejected'));
ALTER TABLE spaces ADD COLUMN reject_reason TEXT;
-- JSON array of R2 keys for owner-uploaded photos (admin-only to view).
ALTER TABLE spaces ADD COLUMN photo_keys TEXT;
CREATE INDEX spaces_owner ON spaces (owner_id);

CREATE TABLE candidate_marks (
  owner_id INTEGER NOT NULL REFERENCES owners(id),
  application_id INTEGER NOT NULL REFERENCES applications(id),
  starred INTEGER NOT NULL DEFAULT 0 CHECK (starred IN (0, 1)),
  memo TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, application_id)
);

-- Rate limiting for owner link requests and failed admin logins.
CREATE TABLE auth_attempts (
  key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX auth_attempts_key ON auth_attempts (key, created_at);
