---
name: Incidental and No Site Work
description: Durable classification rules for physical non-BOQ work versus days with no physical execution.
---

Incidental / Non-BOQ work is a physical historical record: retain chainage, dimensions, quantity, photos, and programme context, but award zero BOQ/RA or programme-progress credit. It must not create BOQ overlap warnings.

No Site Work is a separate non-physical classification. It requires its own reason, persists no physical measurements when saved, and never becomes progress, coverage, or an overlap candidate.

**Why:** Reusing one classification or filtering only the main Progress Report caused physical incidental records to leak into downstream programme totals and made No Site Work lose its distinct operational meaning.

**How to apply:** Carry the classification through every overlap-candidate mapping and every BOQ/programme aggregation seam. Conversion of already credited work to incidental requires explicit confirmation. Report-to-edit flows must return to the exact reviewed overlap without saving from the report itself.

Equipment incidental task text is documentation, not the progress-entry classification above. “Not payable progress” does not waive an otherwise valid equipment hire charge.

**Why:** The user restored a description for unpriced site work, not a new equipment billing exemption or a non-BOQ allocation type.

**How to apply:** Keep task text independent of BOQ segments and quantities. Billing may retain it as descriptive metadata, but changing the text alone must not change quantity, rate, or contractual eligibility.