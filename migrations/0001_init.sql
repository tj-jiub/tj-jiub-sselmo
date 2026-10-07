-- Timestamps are Unix epoch milliseconds. Booleans are 0/1 integers.

CREATE TABLE spaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_consent INTEGER NOT NULL DEFAULT 0 CHECK (owner_consent IN (0, 1)),
  consent_file_key TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE survey_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER NOT NULL REFERENCES spaces(id),
  answers TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX survey_responses_device ON survey_responses (space_id, device_hash, created_at);

-- Deliberately not linked to survey_responses: contact details are collected
-- separately from the answers and cannot be joined back to them.
CREATE TABLE survey_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER NOT NULL REFERENCES spaces(id),
  contact TEXT NOT NULL,
  privacy_consented_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER NOT NULL REFERENCES spaces(id),
  result_token TEXT NOT NULL UNIQUE,
  business_type TEXT NOT NULL,
  plan_text TEXT NOT NULL,
  plan_file_key TEXT,
  est_cost_manwon INTEGER NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  consent_privacy_at INTEGER NOT NULL,
  consent_intro_terms_at INTEGER NOT NULL,
  consent_broker_intro INTEGER NOT NULL DEFAULT 0 CHECK (consent_broker_intro IN (0, 1)),
  consent_broker_intro_at INTEGER,
  -- Free review result, shown at /result/:token.
  result_verdict TEXT CHECK (result_verdict IN ('fit', 'improve', 'rethink')),
  result_summary TEXT,
  result_sent INTEGER NOT NULL DEFAULT 0 CHECK (result_sent IN (0, 1)),
  reference_score INTEGER CHECK (reference_score BETWEEN 0 AND 100),
  -- Paid written feedback: exists only after the applicant requests it.
  feedback_requested_at INTEGER,
  consent_fee_terms_at INTEGER,
  payment_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (payment_confirmed IN (0, 1)),
  feedback TEXT,
  feedback_sent INTEGER NOT NULL DEFAULT 0 CHECK (feedback_sent IN (0, 1)),
  created_at INTEGER NOT NULL
);

-- No fee or commission columns by design.
CREATE TABLE broker_intros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id),
  broker_name TEXT NOT NULL,
  introduced_on TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Last line of defence: an introduction can never be logged without consent.
CREATE TRIGGER broker_intros_require_consent
BEFORE INSERT ON broker_intros
WHEN (SELECT consent_broker_intro FROM applications WHERE id = NEW.application_id) IS NOT 1
BEGIN
  SELECT RAISE(ABORT, 'broker introduction consent missing');
END;
