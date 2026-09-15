---
name: Compact DPR equipment entry
description: Approved responsive interaction rules for editable DPR equipment rows.
---

Equipment identity, deployment/usage type, operator, and diesel source must remain directly visible in Guided and Edit DPR forms; do not restore an auto-collapsing setup disclosure after machine selection.

**Why:** The user rejected that disclosure because selecting equipment immediately hid the controls and duplicated identity before the actual entry fields.

**How to apply:** Keep one identity presentation above those setup controls. The compact completed-machine summary remains separate from setup visibility. Meter availability must not depend on commercial hire basis.

Editable DPR equipment lists use one expanded active machine with later completed machines collapsed into concise summaries. Laptop and tablet assignment segments place the BOQ selector, start, end, duration, and remove action on one row; mobile keeps the selector full-width and uses comfortable touch controls. Opening and closing meter readings, usage times, fuel tank readings, Diesel issued, confirmation state, assignment totals, warnings, and active breakdowns must remain easy to find.

**Why:** Repeating full-width Fuel, Work Assignment, and Breakdown sections for every machine made daily entry excessively tall. The user approved compact grouping and progressive disclosure, but explicitly rejected shrinking all text or hiding required evidence.

**How to apply:** Treat collapsing as presentation only. Keep controlled editors mounted so their existing normalization and exact-match reuse behavior does not change, use at least 44px editable targets on mobile, retain readable desktop controls, and never change calculations, validation, legacy-conversion, or payload semantics as part of layout work.