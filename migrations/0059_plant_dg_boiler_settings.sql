ALTER TABLE plant_settings
  ADD COLUMN IF NOT EXISTS dg_production_equipment_ids text,
  ADD COLUMN IF NOT EXISTS boiler_fuel_meter_mode text NOT NULL DEFAULT 'working';
