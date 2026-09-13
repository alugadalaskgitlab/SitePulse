---
name: Diesel entry capture boundaries
description: Source-specific tank requirements and contractor fuel advances in classic DPR and Plant entry
---
Require opening and closing tank observations only for positive Plant Stock fuel in classic DPR create/edit and Plant entry. Explicit zero readings are valid; zero issued diesel is exempt.

**Why:** Reliable observations are a prerequisite for later hire reconciliation, but fuel responsibility and occasional advances are distinct facts.

**How to apply:** Contractor source plus positive issued quantity identifies an advance without a new flag. Hide/null contractor tank observations while retaining quantity. Do not infer stock deductions or vendor-bill recovery in this capture batch.

On explicit DPR source changes away from Plant Stock, clear newly entered tank observations and confirmation. Do not silently rewrite historical Direct Purchase observations merely on hydration.

**Why:** Hidden confirmed readings can otherwise become false continuity evidence. Existing historical data and Plant Direct Purchase behavior must remain intact.

**How to apply:** Gate DPR tank continuity by source, keep linked meter/start locks separate from editable tank observations, and avoid global API validation that would unintentionally change Guided DPR.