---
name: Estimator geometry precision
description: Exactness requirements for Geometry quantities in the estimator.
---

Keep Geometry calculations exact; do not round calculated area or tonnage in ways that move existing Geometry totals.

**Why:** The user explicitly confirmed that existing Geometry totals must not change. In the quantity acceptance case, use 857.1429 m for the exact 6,000 sqm target; 857.1 m is a rounded input and its smaller result is expected.

**How to apply:** Preserve full input precision for calculations. Distinguish raw values from display rounding in acceptance checks.
