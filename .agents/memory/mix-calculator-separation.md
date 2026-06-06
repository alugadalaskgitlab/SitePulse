---
name: Mix Calculator — Separation Intent
description: The Mix Calculator is planned to be spun out as a standalone product, separate from SiteLog and its commercial strategy.
---

# Mix Calculator — Separation Intent

The user built the Mix Calculator for a different purpose than the SiteLog HLC operations tool. It is **not** part of the per-customer SiteLog deployment commercial strategy.

**Why:** Different audience (estimators, contractors) and different product intent from the daily-ops SiteLog app.

**How to apply:** When planning any work on the Mix Calculator, do not couple it further to SiteLog internals. Keep it self-contained. When the user decides to separate it, the path is:
1. New Repl — extract `client/public/mix-calculator.html`, estimator auth routes (`/estimator-login`, `/api/mix-estimates`, `/api/mix-scenarios`), and the `mix_estimates` / `mix_scenarios` DB tables
2. Replace estimator session auth with a standalone user/login system for the new product's audience
3. Point at its own Postgres instance

The file is already a standalone HTML file (not a React component), so extraction is infrastructure work, not a code rewrite.
