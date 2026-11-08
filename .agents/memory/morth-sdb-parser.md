---
name: MoRTH SDB workbook parsing
description: Context-sensitive resource sections and review safeguards for the MoRTH SDB workbook.
---

**Rule:** Parse Labour, Machinery, and Material sections from their headings rather than fixed column order, while retaining chapter, item, and case context. Numeric `a x b` quantities are products; “or” equipment is an alternative note on the primary row; tonne.km remains carrying-by-lead and never enters equipment-hour demand. Empty grading children inherit missing resource categories from their method parent.

**Why:** The workbook repeats codes and labels across cases, and section order can vary. Treating alternatives or transport coefficients as machine hours inflates equipment demand, while ignoring grading inheritance leaves valid work items incomplete.

**How to apply:** Keep WBM 4.9-A/B, 12.8 C–H Cases I/II, 4.12, 3.16, and grading children in 4.1, 5.6, and 5.8 as parser regressions. Verify equipment, labour, and material rows, then review the development-only diff before applying a source reload. A large diff against a differently versioned existing book requires review, not automatic application.

**Rule:** Keep uppercase Roman sections distinct from lowercase Roman sub-cases (for example, `I` is not `(i)`) when building nested workbook item paths. A sub-case's unit and output should come from its nearest heading with those values.

**Why:** The same visible Roman numeral can represent different levels in the workbook. Case-folding it flattens the path, loses the leaf's identity, and can prevent reliable validation or matching.

**How to apply:** Preserve the original case of chapter markers when normalizing codes; regression-test multi-level paths, inherited unit/output, and nonzero resource rows before reload.

**Rule:** Compare parsed norm quantities at PostgreSQL `REAL` precision; otherwise a successful reload can keep appearing changed due to float32 storage rounding.

**Why:** Workbook calculations are JavaScript doubles, while SNL norm columns use `REAL`. Tiny representation differences are not meaningful workbook changes, but cause repeated reload diffs if compared exactly.

**How to apply:** Normalize numeric values to stored `REAL` precision in preview comparison only; preserve the source values for display and save.

**Rule:** Exact “Same as item X (Y)” references inherit that source item’s unit/output and machine, labour, and material rows unchanged. Cost-only percentage differences are notes on the item; uncertain quantity adjustments remain Needs check. MoRTH reloads are applied only through the Owner review UI.

**Why:** Rescaling copied rows to a destination’s local rate denominator changes the referenced norm, while treating cost adjustments as physical quantities distorts demand. Owner review is the required guard before persisted standards change.

**How to apply:** Resolve only explicit item/case references, preserve unrelated notes when writing source/cost annotations, show “Uses item …” and the cost note in preview, and leave ambiguous or quantity-changing adjustments unapplied.

**Rule:** MoRTH 2.5 has only three workbook sub-items: 2.5-I-A, 2.5-I-B, and 2.5-II-A. Do not create or copy a 2.5-II-B norm.

**Why:** The workbook’s mechanical section lists only the bituminous-course case; the user confirmed that inventing a granular mechanical norm would be unsupported.

**How to apply:** Keep the missing 2.5-II-B absent from parsed reload data and do not copy the mechanical A quantities into a B case.
