---
name: Receipt rapid repeat & daily allocation visibility
description: 06G — receipt strip visibility rule, daily-fulfilment display override, rapid repeat-trip dialog pattern, plan-card timestamps
---

## Rules
- ActivityReceiptStrip hides ONLY when `receiptRelevanceForType` is "none" (reused_excavated) with no trips. "No arrangement" is NOT a reason to hide — no-arrangement type resolves to "evidence".
- Today's operational supplier priority: PM daily fulfilment (via `findDailyFulfilmentForItem` in shared/requirementFulfilment.ts, matched on plannedWork.boqItemId) → standing arrangement prefill → engineer selection. Daily override is display-only; NEVER mutates standing arrangements.
- other_agency / hlc daily overrides must NEVER set earthworkArrangementId on the trip; material falls back to the requirement line's materialName when no arrangement resolves one.
- Rapid repeat dialog: stays open after save, clears only vehicle/qty/receipt/notes/photos, refreshes time, refocuses vehicle; mixed UoMs displayed separately, never summed.
- Timestamps: `client/src/lib/dateTimeDisplay.ts` fmtDateTime is the only display formatter — returns null for missing/invalid so legacy records omit lines (never fabricate). `reviewedBy` is an integer id; never render a reviewer *name* unless the server resolves one.
- Only latest reviewedAt exists — no per-transition status history (known limitation, not a bug).

**Why:** field engineers log many trucks back-to-back; closing the dialog per truck and losing context caused receipt gaps; fabricated timestamps/links would corrupt evidence.

## Environment note (Aug 2026)
`WorkflowsRestart` for "Start application" failed repeatedly with a platform-side ripgrep error referencing deleted `.local/skills/.tmp-*` dirs; app itself boots fine via `npm run dev`. If it recurs, start manually and retry the workflow later.
