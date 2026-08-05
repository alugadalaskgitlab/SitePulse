---
name: Guided DPR pilot
description: Programme-driven Guided DPR screen — routing, entry-mode preference, and the draft/programme-link constraint.
---

# Guided DPR pilot (built Aug 2026)

- `client/src/pages/GuidedDpr.tsx` at `/site/guided` (gated `site_dprs`) is the guided road-DPR screen; SiteEntry (`/site/new`) is relabeled "Detailed DPR" and untouched behaviourally.
- `client/src/lib/dprEntryMode.ts` holds the localStorage guided/detailed preference; all four road-DPR entry points (SiteHome, FieldHome, SiteHub, SiteDashboard) route through `roadDprHref()`. Visiting the Guided screen sets the preference to "guided".

**Rule:** `validateProgressProgrammeLinks` on POST /api/dprs enforces chainage From/To (and To > From, plus explicit side when the bar has a planned side) on programme-linked rows **even for drafts**.
**Why:** A guided "save draft and finish later" with a linked bar but no chainage gets rejected server-side.
**How to apply:** Any client that saves partially-filled programme-linked progress rows as drafts must drop `programmeBarId` on incomplete rows (GuidedDpr's `keepBarLink`), or the server must learn draft-lenient validation. Relinking on draft completion is still open (task follow-up).

Also: filter DPR lists with `!isSuperseded` when computing "already reported" — edited DPRs keep old versions in the table.
