---
name: Diesel plant-stock sufficiency
description: Durable stock-source and zero-floor rules for Diesel/HSD writers
---

# Diesel/HSD plant-stock sufficiency

**Rule:** every exact Diesel/HSD plant-stock deduction, including maintenance and rebuild writers, must use the locked sufficiency guard. Missing source is never Plant Stock, and direct purchases never deduct stock. Edits, deletions, and reversals restore the original ledger's material and party bucket; current canonical fuel is only for a genuinely new issue.

**Why:** non-interactive writers can recreate negative stock even when API paths are guarded. Fuel identity and ownership can also change over time, so current defaults can credit a different bucket from the one originally deducted.

**How to apply:** classify source before new deductions and treat the historical ledger as authoritative for corrections. Lock and validate before deducting; validate a rebuild's net balance effect before changing rows.
