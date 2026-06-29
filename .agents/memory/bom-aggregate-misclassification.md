---
name: BOM Aggregate Misclassification
description: normaliseKeyMaterialName() in planningEngine.ts was wrongly renaming aggregates to "Bitumen VG-30/40" for DBM/BC items, making them vanish from the Materials tab.
---

## The Rule

In `normaliseKeyMaterialName()` (shared/planningEngine.ts), the VG-grade detection MUST be guarded by `rawIsBinder` before checking the item description. Without this guard, any item whose *description* contains "bituminous" (e.g. "bituminous macadam") causes ALL its materials — including aggregates like "10/12MM", "DUST", "6MM DOWN" — to be renamed to "Bitumen VG-30".

**How to apply:** Always look like this:
```ts
const rawIsBinder = /bitumen|vg[\s-]?\d+|binder|emulsion/i.test(raw);
if (/vg\s*-?\s*40|vg40/i.test(raw) || (rawIsBinder && /vg\s*-?\s*40|vg40/i.test(desc))) return "Bitumen VG-40";
if (/bitumen|vg\s*-?\s*30|vg30/i.test(raw) || (rawIsBinder && /vg\s*-?\s*30|vg30/i.test(desc))) return "Bitumen VG-30";
```

**Why:** Without `rawIsBinder`, `desc.includes("bituminous")` fires for every material in a DBM/BC item, collapsing all aggregate demand into the bitumen row and making aggregates disappear from the BOM Materials tab.
