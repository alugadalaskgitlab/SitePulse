-- Add partial unique constraint on ldo_flow_readings for meter-slot reading types
-- (opening / closing). Receipt rows are intentionally excluded because multiple
-- valid LDO deliveries can arrive for the same date/tank/plant.
-- First, remove duplicate slot rows keeping only the earliest id per slot.
DELETE FROM ldo_flow_readings
WHERE id NOT IN (
  SELECT MIN(id)
  FROM ldo_flow_readings
  WHERE reading_type NOT IN ('receipt')
  GROUP BY date, tank_number, reading_type, plant_name
)
AND reading_type NOT IN ('receipt');

-- Now add the partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS "ldo_flow_readings_slot_uq"
  ON "ldo_flow_readings" ("date", "tank_number", "reading_type", "plant_name")
  WHERE reading_type NOT IN ('receipt');
