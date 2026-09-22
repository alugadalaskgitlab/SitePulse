---
name: Vendor payment validation coverage
description: Exercise payment save before paid transition; UI fixtures alone miss server eligibility drift.
---

Verify cumulative payment saving and the paid transition as one flow, not as independently mocked UI responses.

**Why:** Combined bills once exposed payment inputs and passed paid-transition tests while the actual payment-save method still rejected their bill type. Synthetic success responses hid the mismatch.

**How to apply:** Keep client and server bill eligibility shared without broadening permissions. Regression tests must invoke the actual payment-save method before marking paid, retaining amount limits, approval requirements and paid-amount locks.