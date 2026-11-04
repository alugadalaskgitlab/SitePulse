---
name: Vendor payment validation coverage
description: Exercise payment save before paid transition; UI fixtures alone miss server eligibility drift.
---

Verify payment saving and the paid transition as one flow, not as independently mocked UI responses.

**Why:** Combined bills once exposed payment inputs and passed paid-transition tests while the actual payment-save method still rejected their bill type. Synthetic success responses hid the mismatch.

**How to apply:** Preserve the actual bank amount even when it differs from net payable; allow the paid transition only with a settlement choice and reason, and keep settlement metadata separate from frozen bill totals. Test client and server eligibility together, including approval requirements and paid-amount locks.