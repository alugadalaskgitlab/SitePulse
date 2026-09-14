---
name: Diesel entry capture boundaries
description: Source-specific tank requirements and contractor fuel advances in classic DPR and Plant entry
---
Require opening and closing tank observations only for positive Plant Stock fuel in classic DPR create/edit, Guided DPR, and Plant entry. Explicit zero readings are valid; zero issued diesel is exempt.

**Why:** Reliable observations are a prerequisite for later hire reconciliation, but fuel responsibility and occasional advances are distinct facts.

**How to apply:** Contractor source plus positive issued quantity identifies an advance without a new flag. Hide/null contractor tank observations while retaining quantity. Do not infer stock deductions or vendor-bill recovery in this capture batch.

On explicit DPR source changes away from Plant Stock, clear newly entered tank observations and confirmation. Do not silently rewrite historical Direct Purchase observations merely on hydration.

**Why:** Hidden confirmed readings can otherwise become false continuity evidence. Existing historical data and Plant Direct Purchase behavior must remain intact.

**How to apply:** Gate DPR tank continuity and physical-consumption summaries by source. Hidden historical non-Plant-Stock observations must never generate consumption or variance. Keep linked meter/start/diesel locks separate from editable tank observations; avoid global API or data-cleanup changes beyond the requested entry paths.

Do not infer that a visibility defect is the cause of a failed submission.

**Why:** The duplicate contractor tank fields were confirmed, but Daily Hire contractor rows passed draft/submit fixture checks without meter readings. The customer's exact failed request was not reproduced.

**How to apply:** Distinguish corrected UI defects, tested form paths, and unverified customer failures in reports; require actual request/error evidence before attributing a save blocker.