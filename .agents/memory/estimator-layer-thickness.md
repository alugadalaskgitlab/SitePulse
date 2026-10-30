---
name: Estimator layer thickness
description: Product decision for representing thickness in multi-layer estimator jobs.
---

For multi-layer estimator work, thickness should be stored per mix row rather than once on the job.

**Why:** The user selected per-mix-row thickness so different layers can share one area while deriving separate volume and tonnage.

**How to apply:** Use this model when multi-layer quantity/rate behavior is approved for implementation. Preserve compatibility with existing saved jobs when changing the persisted shape.
