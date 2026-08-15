---
name: Diesel plant-stock sufficiency guard
description: How plant-stock diesel issues are floor-guarded at zero and how routes/clients surface the shortage
---

# Diesel plant-stock sufficiency guard (06M-B)

**Rule:** any deduction of Diesel from plant stock (DPR equipment logs, Equipment & Fleet usage) must go through `_adjustStockBalance` with the optional `guard` param. The guard runs AFTER the FOR UPDATE lock and throws `InsufficientPlantStockError` (code `INSUFFICIENT_PLANT_STOCK`, payload material/source/materialId/requestedQty/availableQty/shortageQty) when the balance would go below zero — aborting the whole transaction, so no partial writes.

**Why:** recorded diesel stock used to go negative silently; the DPR path even ran an UNLOCKED select/update (double-spend race). Both fixed by routing through the shared locked helper.

**How to apply:**
- New plant-stock deduction sites must pass the guard; restores/receipts (positive delta) and direct_purchase/contractor paths never get one.
- Edits validate only the NET additional litres (equipment-usage plant→plant passes `-dieselDiff`). DPR versions/edits are safe because `cleanupDprEquipmentDieselLedger` restores old litres in the SAME tx before re-deduction.
- Routes map the error via `handleInsufficientPlantStock(err,res)` → 409 structured payload (wired into DPR create/draft/submit/version/clone + equipment-usage POST/PUT). Any new route that can trigger a deduction needs this in its catch or the user gets a generic 500.
- Client: `client/src/components/InsufficientDieselDialog.tsx` exports `parseInsufficientPlantStock` + dialog with "GO TO MATERIAL RECEIPT" (`/plant/material-receipts?autoOpen=1&materialId=N`). Wired into SiteEntry (both render branches — showPreview trap), SiteEdit (draft/submit/version), GuidedDpr, DprDetails (clone), PlantEquipmentUsage. New DPR-submitting surfaces must wire it too.
