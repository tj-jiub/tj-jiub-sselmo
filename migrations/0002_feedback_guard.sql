-- Paid written feedback exists only after the applicant requested it on the
-- result page. Mirrors saveFeedback's WHERE clause at the database level.

CREATE TRIGGER applications_feedback_requires_request_update
BEFORE UPDATE ON applications
WHEN NEW.feedback_requested_at IS NULL
  AND (NEW.payment_confirmed = 1 OR NEW.feedback_sent = 1 OR NEW.feedback IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'feedback not requested');
END;

CREATE TRIGGER applications_feedback_requires_request_insert
BEFORE INSERT ON applications
WHEN NEW.feedback_requested_at IS NULL
  AND (NEW.payment_confirmed = 1 OR NEW.feedback_sent = 1 OR NEW.feedback IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'feedback not requested');
END;
