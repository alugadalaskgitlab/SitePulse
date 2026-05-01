-- Task #344: Add LDO dip-stick depth fields to plant_shift_logs
-- Mirrors the existing bitumen dip columns; _syncShiftLogReadings converts
-- these depths → volume → weight and writes rows into ldo_dip_readings.

ALTER TABLE plant_shift_logs
  ADD COLUMN IF NOT EXISTS ldo_tank1_opening_dip REAL;

ALTER TABLE plant_shift_logs
  ADD COLUMN IF NOT EXISTS ldo_tank1_closing_dip REAL;

ALTER TABLE plant_shift_logs
  ADD COLUMN IF NOT EXISTS ldo_tank2_opening_dip REAL;

ALTER TABLE plant_shift_logs
  ADD COLUMN IF NOT EXISTS ldo_tank2_closing_dip REAL;
