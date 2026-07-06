---
name: Field Home + Guided Mobile DPR Flow
description: Mobile-first engineer landing page and step-by-step DPR entry, layered on top of the existing dashboard/DPR form without touching backend logic.
---

Site engineers on mobile land on a simplified `FieldHome.tsx` by default instead of the classic `Home.tsx` dashboard; managers/admins always get the classic dashboard. The guided step-by-step DPR flow lives inside the existing `SiteEntry.tsx` as a presentation-only wrapper around the same Card sections (conditional `showStep(n)` rendering) — no new form state, validation, autosave, or mutation logic was duplicated.

**Why:** the app has no `role` field on the frontend `AuthUser` (only `isAdmin`/`isManager`, where `isManager` = any authenticated non-admin). So "engineer on mobile" is approximated as `isMobileViewport && !isAdmin && !isManager`, not a real role check. If a real engineer role is ever added, replace this heuristic in both `Home.tsx` and `SiteEntry.tsx`.

**How to apply:** Both `Home.tsx` and `SiteEntry.tsx` use a `useState<boolean|null>` override pattern (`fieldOverride`/`guidedOverride`) so either side can manually toggle between guided/classic views for the session, defaulting to the heuristic above when the override is `null`. When adding new DPR sections, wrap the Card in the correct `showStep(n)` index per `GUIDED_STEPS` in `SiteEntry.tsx`, and remember it renders unconditionally when not in guided mode.

Also: `drizzle-kit push` can hang on an interactive TUI prompt for *unrelated* pending schema diffs (e.g. a pre-existing unique constraint) even when your own change is a simple additive nullable column. Piped stdin doesn't work with these arrow-key prompts. For a simple additive/nullable column, it's safer to run a direct `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` via `psql "$DATABASE_URL"` instead of fighting the interactive push.
