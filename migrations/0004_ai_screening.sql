-- AI screening, owner page and 쓸모 track (spec 2026-10-10 §4).

ALTER TABLE spaces ADD COLUMN location_notes TEXT;
ALTER TABLE spaces ADD COLUMN owner_token TEXT;
ALTER TABLE spaces ADD COLUMN margin_pct INTEGER CHECK (margin_pct BETWEEN 1 AND 90);
ALTER TABLE spaces ADD COLUMN scale_factor REAL NOT NULL DEFAULT 1 CHECK (scale_factor > 0);
-- SQLite cannot add a UNIQUE column, so uniqueness is an index (NULLs stay allowed).
CREATE UNIQUE INDEX spaces_owner_token ON spaces (owner_token);

ALTER TABLE applications ADD COLUMN track TEXT NOT NULL DEFAULT 'general' CHECK (track IN ('ssulmo', 'general'));
-- Required by the parser for new applications; NULL only on rows from before this migration.
ALTER TABLE applications ADD COLUMN consent_ai_at INTEGER;
ALTER TABLE applications ADD COLUMN consent_consulting_at INTEGER;
ALTER TABLE applications ADD COLUMN ai_status TEXT NOT NULL DEFAULT 'pending' CHECK (ai_status IN ('pending', 'done', 'failed'));
ALTER TABLE applications ADD COLUMN ai_score INTEGER CHECK (ai_score BETWEEN 0 AND 100);
ALTER TABLE applications ADD COLUMN ai_report TEXT;
ALTER TABLE applications ADD COLUMN ai_model TEXT;
ALTER TABLE applications ADD COLUMN ai_evaluated_at INTEGER;
ALTER TABLE applications ADD COLUMN ai_error TEXT;
ALTER TABLE applications ADD COLUMN result_mailed_at INTEGER;

-- Monthly self-reported figures for 쓸모 트랙 founders. Recording only; nothing is charged.
CREATE TABLE consulting_months (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id),
  month TEXT NOT NULL,
  revenue_krw INTEGER NOT NULL CHECK (revenue_krw >= 0),
  profit_krw INTEGER NOT NULL,
  fee_krw INTEGER NOT NULL CHECK (fee_krw >= 0),
  created_at INTEGER NOT NULL,
  UNIQUE (application_id, month)
);

-- Last line of defence: 일반 트랙 applications never get a consulting log.
CREATE TRIGGER consulting_months_require_ssulmo_track
BEFORE INSERT ON consulting_months
WHEN (SELECT track FROM applications WHERE id = NEW.application_id) IS NOT 'ssulmo'
BEGIN
  SELECT RAISE(ABORT, 'consulting months require the ssulmo track');
END;

CREATE TABLE educator_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id),
  organization TEXT NOT NULL,
  educator_name TEXT NOT NULL,
  connected_on TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
