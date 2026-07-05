---
name: Equipment output gap prompt
description: Pattern for detecting missing equipment output rates and prompting the user with a real (never fabricated) SDB-derived suggestion.
---

When an equipment row (master-matched or custom/manual) has no computable output for a BOQ item's unit, don't silently drop it from the Gantt bottleneck calc or silently fabricate a rate — surface a gap prompt that lets the user enter a rate, optionally pre-suggested from a real SDB norm.

**Why:** custom/contractor equipment and SDB equipment used against an unlisted BOQ unit were previously invisible to `calculateAutoDurationFull` because no output existed in any of the standard lookup paths (standardOutputs, theoretical, unit-converted). Fabricating a plausible-looking number would be worse than a visible gap — users would silently get wrong durations.

**How to apply:**
- Add a manual-entry fallback field (e.g. `qtyPerBoqUnit`) as a legitimate last-resort output source in the duration engine, but tag it distinctly (e.g. `convertedVia: "manual"`) so the UI can tell "real/derived output" apart from "user typed a number."
- Only offer an SDB-derived suggestion when the mapped norm's own unit exactly matches the BOQ item's unit — never cross-unit-convert or guess. If units don't match, return no suggestion at all.
- Gate the gap prompt strictly: only show it when there is truly no output from any source AND no manual value has been entered yet, so it doesn't nag on rows that already resolved via standard/theoretical/converted paths.
