---
name: DPR form dead code trap
description: Which files are the real, routed DPR entry form vs unused dead code with similar names
---

`client/src/components/DprForm.tsx` and `client/src/pages/NewDpr.tsx` are NOT referenced by any route in `client/src/App.tsx` — they are dead code left over from an earlier implementation.

The real, live DPR entry form is `client/src/pages/SiteEntry.tsx`, routed at `/site/new` (supports `?type=road` / `?type=structure` query params to lock work type).

**Why:** Task specs and old docs may list `DprForm.tsx`/`NewDpr.tsx` as "relevant files" for DPR work — always verify against `App.tsx` routing before editing, or changes will have zero effect on the running app.

**How to apply:** Any future DPR-related task should target `SiteEntry.tsx` (entry/edit form), `SiteDashboard.tsx` (DPR list), `SitePreview.tsx` (submit preview), and `SiteHub.tsx`/`SiteHome.tsx` (nav entry points), not the `Dpr*`-prefixed files.
