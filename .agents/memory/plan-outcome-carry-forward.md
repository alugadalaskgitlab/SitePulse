---
name: Plan Outcome & Carry Forward
description: 06J — Tomorrow Plan execution outcome + carry-forward design rules (JSONB-only, atomic carry, allocation whitelist)
---

## Rules
- `shared/planOutcome.ts` is the ONLY seam for outcome/carry-forward rules (validation, strict same-UoM comparison — never invent conversions, carry plan builder).
- Persistence is JSONB-only inside `site_requirements.allocationStatus`: `executionOutcome{outcome,reason,remarks,updatedByName,updatedAt,carriedForwardTo}`, `carriedForwardFrom`, `previousAllocationReference`. No schema change.
- Carry-forward MUST go through `storage.recordSiteRequirementOutcome` — a transaction with `SELECT ... FOR UPDATE` on the old plan; concurrent clicks cannot double-clone, and an existing `carriedForwardTo` link is preserved on outcome edits (never nulled).
- New plan = fresh: fresh lineKeys on every line, no audit/status copied, old fulfilment carried only as marked `previousAllocationReference` (must be reconfirmed).
- PATCH `/allocation` whitelists section fields only — arbitrary body keys (e.g. forged executionOutcome) must never reach the JSONB; `updateSiteRequirementAllocation` is merge-preserving (protects materialItems + outcome keys).
- Server enforces plan.date < today for outcomes — UI hiding is not enforcement.
- Outcome never creates/blocks a DPR, never mutates arrangements/programme allocations, never changes the original plan's date.

- 06J-HF: executed quantity = credited BOQ quantity via canonical `entryBoqCredit` (shared/progressReport), never raw physical DPR qty; once credit applies, executed UoM = BOQ item's unit. If credit can't be established, `creditApplied=false` → non-comparable (no fallback on textual UoM match).
- "Today" for outcome eligibility = `businessToday()` (Asia/Kolkata business day, injectable instant), never UTC `toISOString().slice(0,10)` — UI local date and server must agree after IST midnight.

**Why:** plans that never executed had no honest closure path; a fake DPR or silent date mutation would corrupt history; concurrent PM clicks were shown to double-clone before the row lock.
