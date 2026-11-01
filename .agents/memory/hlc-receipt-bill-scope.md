---
name: HLC receipt bill scope
description: Preserve the boundary between equipment-only bill pulls and plant-receipt ownership.
---

Resolve HLC ownership only for auto-bill pulls that can include plant receipts; equipment-only pulls must remain independent of the HLC party master.

**Why:** A receipt ownership check must not make unrelated equipment-only bill pulls depend on the HLC party master.

**How to apply:** When changing vendor-bill auto-item pulls, resolve HLC only for material, transport, and all-type pulls; skip it for equipment-only pulls.
