-- Add unique constraint on bitumen_dip_readings (date, tank_number, reading_type, plant_name)
-- to prevent duplicate entries for the same dip slot.
-- First, remove duplicates keeping only the earliest id per slot.
DELETE FROM bitumen_dip_readings
WHERE id NOT IN (
  SELECT MIN(id)
  FROM bitumen_dip_readings
  GROUP BY date, tank_number, reading_type, plant_name
);

-- Now add the unique index
CREATE UNIQUE INDEX IF NOT EXISTS "bitumen_dip_readings_date_tank_type_plant_uq"
  ON "bitumen_dip_readings" ("date", "tank_number", "reading_type", "plant_name");
