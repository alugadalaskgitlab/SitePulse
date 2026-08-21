-- Instruction 06S: an unset procurement route is deliberately unconfigured.
-- It must never be coerced to Stores by a database default.
ALTER TABLE plant_materials
  ALTER COLUMN procurement_route DROP DEFAULT;