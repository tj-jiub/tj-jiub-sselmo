-- District (구) of a space, used by the founder matching flow (/find).
-- Nullable: rows created before this migration are backfilled when their
-- neighborhood starts with a "...구" token, otherwise left for the admin to fill.
ALTER TABLE spaces ADD COLUMN district TEXT;

UPDATE spaces
SET district = substr(neighborhood, 1, instr(neighborhood || ' ', ' ') - 1)
WHERE substr(neighborhood, 1, instr(neighborhood || ' ', ' ') - 1) LIKE '%구';
