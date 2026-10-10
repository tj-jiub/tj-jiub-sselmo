-- Space cover photo / avatar (spec 2026-10-10-admin-redesign §2).
-- R2 key of the chosen cover; NULL = no photo (avatar falls back to the 동 initial).
ALTER TABLE spaces ADD COLUMN cover_key TEXT;
-- Default cover = the first uploaded photo.
UPDATE spaces SET cover_key = json_extract(photo_keys, '$[0]') WHERE photo_keys IS NOT NULL AND json_valid(photo_keys);
