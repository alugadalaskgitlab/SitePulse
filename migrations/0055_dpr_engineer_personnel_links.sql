-- SR-01: optional links from user accounts and DPR headers to personnel.
-- Existing text names remain unchanged; this migration does not backfill rows.

ALTER TABLE users
  ADD COLUMN personnel_id integer,
  ADD CONSTRAINT users_personnel_id_fk
    FOREIGN KEY (personnel_id) REFERENCES personnel(id);

CREATE UNIQUE INDEX users_personnel_id_uq
  ON users (personnel_id)
  WHERE personnel_id IS NOT NULL;

ALTER TABLE dprs
  ADD COLUMN engineer_personnel_id integer,
  ADD CONSTRAINT dprs_engineer_personnel_id_fk
    FOREIGN KEY (engineer_personnel_id) REFERENCES personnel(id);

CREATE INDEX dprs_engineer_personnel_id_idx
  ON dprs (engineer_personnel_id);
