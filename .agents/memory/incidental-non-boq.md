---
name: Incidental and No Site Work
description: Durable classification rules for physical non-BOQ work versus days with no physical execution.
---

Incidental / Non-BOQ work is a physical historical record: retain chainage, dimensions, quantity, photos, and programme context, but award zero BOQ/RA or programme-progress credit. It must not create BOQ overlap warnings.

No Site Work is a separate non-physical classification. It requires its own reason, persists no physical measurements when saved, and never becomes progress, coverage, or an overlap candidate.

**Why:** Reusing one classification or filtering only the main Progress Report caused physical incidental records to leak into downstream programme totals and made No Site Work lose its distinct operational meaning.

**How to apply:** Carry the classification through every overlap-candidate mapping and every BOQ/programme aggregation seam. Conversion of already credited work to incidental requires explicit confirmation. Report-to-edit flows must return to the exact reviewed overlap without saving from the report itself.