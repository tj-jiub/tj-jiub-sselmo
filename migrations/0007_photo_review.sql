-- Photo changes on an already-public (active) space wait for the operator (user decision 2026-10-10).
-- The proposal is the owner's full intended photo list and cover; NULL = nothing waiting.
ALTER TABLE spaces ADD COLUMN pending_photo_keys TEXT;
ALTER TABLE spaces ADD COLUMN pending_cover_key TEXT;
