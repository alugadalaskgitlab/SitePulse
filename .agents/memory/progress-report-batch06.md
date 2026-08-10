---
name: Progress Report (RA-style) seam
description: Rules for the read-only Progress Report — single math seam, canonical valid-DPR filter, chronological cumulative.
---

- **Rule:** shared/progressReport.ts is the ONLY math seam for the Progress Report (BOQ credit, chronological running cumulative, overlap advisory, coverage strips, abstract math). Screen and Excel export must both call it — never fork the math.
- **Canonical valid-DPR filter** for "counts toward actuals": dprStatus='submitted' AND isSuperseded=false AND isCancelled=false AND isDeleted=false AND chainageReviewStatus <> 'review_required'. Note the older plan-vs-actual SQL only filters superseded — an intentional divergence, do not "fix" plan-vs-actual to match without a decision.
- **Chronology rule (§9):** running cumulative is computed in chronological order (dprDate → dprId → row id) and attached to rows BEFORE any display sort; sortForDisplay reorders copies only.
- **Why:** the report is a contractual/audit surface (RA bill style); sort-dependent cumulatives or silently corrected historical rows would falsify it. Ambiguous rows get a "Review quantity" flag, never a rewrite.
- **Security:** report endpoints must assertView("site_dprs") AND authorize the project's site against getPermittedSiteNames — filtering DPR rows alone still leaks BOQ metadata. Client-side route gating is not an API boundary (architect finding).
- Overlap detection is advisory-only: compatible sides + strictly intersecting km ranges; adjacent ranges and LHS-vs-RHS never warn; quantities never adjusted.
