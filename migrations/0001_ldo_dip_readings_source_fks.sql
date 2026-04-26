-- Task #310: Add source FK columns to ldo_dip_readings
-- Tracks which plant shift log or bitumen heating session auto-created each LDO dip reading.
-- Mirrors the same pattern used on ldo_flow_readings and bitumen_dip_readings.

ALTER TABLE ldo_dip_readings
  ADD COLUMN IF NOT EXISTS source_shift_log_id INTEGER
    REFERENCES plant_shift_logs(id) ON DELETE SET NULL;

ALTER TABLE ldo_dip_readings
  ADD COLUMN IF NOT EXISTS source_heating_session_id INTEGER
    REFERENCES bitumen_heating_sessions(id) ON DELETE SET NULL;
