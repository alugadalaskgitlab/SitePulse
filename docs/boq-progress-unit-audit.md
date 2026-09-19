# BOQ progress unit audit

## Production read-only findings — 2026-09-19

Queries used the managed production read replica. No production or workspace
data was changed for this audit.

- Alladurg clearing/grubbing BOQ item 13 (project 2): saved and canonical unit
  `Sqm`, contract quantity 6,960, client rate ₹4.04, no measurement-method
  override, saved DPR conversion factor 0.0001.
- DPR 338 dated 2026-08-16, progress row 587, and DPR 349 dated 2026-08-17,
  progress row 561: each stores quantity 2,400, UOM SQM, length 1,600 m and
  width 1.5 m, source `calculated`, no conversion/source note.
- Both DPRs are submitted, not superseded/cancelled/deleted; neither row is
  incidental/no-site-work or marked for chainage review.
- The only other BOQ item with a nonidentity saved factor is item 1, whose
  contractual unit is genuinely Ha; its 0.0001 factor is valid for SQM input.
- No production progress row contains the legacy `UOM override` source note.
  No structure row has a nonidentity row-level conversion factor.

The additional supported Acre/Are/Km/Kg/KL/CFT conversions and administrator
input-normalization cases are verified with regression fixtures, not claimed
as observed production examples in this audit.

## Interpretation

The Alladurg physical evidence is intact. The old calculation is
`(2400 + 2400) × 0.0001 = 0.48`, rounded to 0.5 by the report. Applying a
hectare multiplier to a Sqm contractual item reduces both credit and value
incorrectly. Correct credit is 4,800 Sqm; at ₹4.04/Sqm the value is ₹19,392
and the contractual balance is 2,160 Sqm. A 0.48 Ha equivalent is informational.

The existing startup initialization targets numeric BOQ id 13 with a 0.0001
factor and a comment naming another project. Numeric identifiers do not
establish unit semantics across databases; this initialization must not
reintroduce the invalid factor.

## Safe correction boundary

Correct the interpretation of physical-to-contract units in application
code, not the saved DPR measurements. Unit-aware readers correct these
existing rows without resubmission or a destructive history backfill.
The old saved factor remains visible as configuration evidence until
deliberately corrected through validated configuration editing.

Any future persisted correction should record old and new configuration,
the reason, authenticated actor, and affected item; it must not change
contract units/rates/quantities or rewrite physical progress. Ambiguous
legacy transformations require review rather than inferred inverse math.
Publishing and production data mutation are outside this work.