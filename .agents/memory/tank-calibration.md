---
name: Tank Calibration
description: Per-plant tank dimension config that auto-generates dip charts; 3 shapes, 4 slots, full backend + UI complete
---

# Tank Calibration Feature

## What was built
- `shared/tank-calibration.ts` — PlantTankConfig type (bitumen1/2, ldo1/2 slots), 3 shapes: `horizontal_cylinder`, `vertical_cylinder`, `vertical_cone_top`. Math functions: `calculateVolumeAtDepth`, `calculateUsableVolume`, `generateChartPreview`, `getTankCapacity`, `parseTankConfig`. `TANK_SHAPE_LABELS` and `TANK_SLOT_LABELS` constants exported.
- `shared/schema.ts` — `plant_settings` table gained `tankConfig text` and `primaryPartyId integer` columns. DB pushed.
- `server/storage.ts` — upsertPlantSettings/renamePlantSettings pass new fields; `_syncShiftLogReadings` uses per-plant `bitumenVolForTank` helper; falls back to hardcoded dip charts when tankConfig null.
- `server/routes.ts` — PUT endpoint accepts tankConfig+primaryPartyId; `pSettings/pTankConfig/bitumenVolForTank` moved to outer scope before consumption-summary block so PDF tank-status section also sees them.
- `client/src/pages/Plant.tsx` — `TankSlotEditor` component (enable toggle, shape, dimensions, dead stock, live chart preview); `PlantTypeConfigSection` gained `Tanks` + `Party` buttons per row; Tank Calibration Dialog with 4 slot editors; Primary Party Dialog; Add Plant Dialog includes party selector; all existing mutations preserve tankConfig+primaryPartyId.

## Key design decisions
**Why:** Existing plants (HLC) had hardcoded BITUMEN_DIP_CHART / getLdoVolumeAtDepth lookups. New plants or tanks with different geometry need accurate math-based charts.
**Fallback:** When `tankConfig` is null, all existing behavior is unchanged — fallback to hardcoded charts. Zero risk to live data.
**How to apply:** When `pTankConfig` is available in routes.ts PDF section, use `calcTankVol(cfg, depth)` instead of `getVolumeAtDepth(depth)`. In storage `_syncShiftLogReadings`, use `bitumenVolForTank(1|2, depth)` helper.
