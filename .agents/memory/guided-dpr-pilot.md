---
name: Guided DPR pilot
description: Programme-driven Guided DPR screen — routing, entry-mode preference, draft-lenient programme links, and the staged-photo retry rule.
---

# Guided DPR pilot (built Aug 2026; reliability batch completed Aug 2026)

- `client/src/pages/GuidedDpr.tsx` at `/site/guided` (gated `site_dprs`) is the guided road-DPR screen; SiteEntry (`/site/new`) is "Detailed DPR" and untouched behaviourally.
- `client/src/lib/dprEntryMode.ts`: Guided is the default for devices with no stored preference (flipped Aug 2026); only an explicit stored "detailed" routes to Classic. All four road-DPR entry points route through `roadDprHref()`; switching is two-way and persisted per device.

**Rule (superseded → now draft-lenient):** `validateProgressProgrammeLinks` accepts `{ draft: true }` — draft saves keep `programmeBarId` on rows with incomplete chainage or missing out-of-range reason; structural errors (wrong project/item, incompatible side) still fail even for drafts. Final submit is strict (400 `PROGRAMME_LINK_INVALID`). Server never silently drops a link — it rejects instead.
**Why:** the old strict-always rule forced clients to drop the bar link on incomplete draft rows, which is exactly the "link lost through submit" bug the reliability batch closed.
**How to apply:** any new client saving programme-linked drafts should pass rows unchanged and rely on draft-lenient mode; never strip `programmeBarId` client-side.

**Rule:** after uploading staged photos on save, prune the staged list to only the FAILED files (keep for retry).
**Why:** clearing nothing re-uploads duplicates on every draft save; clearing everything loses failed photos with no retry.

- Shared reliability plumbing (both DPR screens): `ProgrammeBarPicker` (auto-match single candidate + "Linked automatically" note), `BarLinkFeedback` (bar-scoped Planned/Done/Balance + optional BOQ-item totals, out-of-range modal via `OutOfRangeChainageModal`, executedBy select for partly-outsourced arrangements — mode matched by `/part/i`). Out-of-range submitted rows get `chainageReviewStatus="review_required"` and are excluded from bar actuals until approved.
- Local autosave (`use-autosave`, key `guided-dpr-new`) restores the whole form incl. draftId via a banner; server draft lifecycle is POST → PATCH `/api/dprs/:id/draft` → POST `/api/dprs/:id/submit` (one record, never duplicates).
- Tests: `tests/guidedDprReliability.test.ts` (route-level lifecycle, real handlers + mocked storage, 030A scaffolding pattern).
- Filter DPR lists with `!isSuperseded` when computing "already reported".
**Rule:** route-level tests that mock `server/storage` must stub `getDprs()` non-empty and use incrementing ids in `createDpr` mocks.
**Why:** `registerRoutes` fires a background `seedDatabase()` when `getDprs()` is empty — its `createDpr` call races the tests and a fixed mock id lets it clobber the test's draft (intermittent "Only draft DPRs can be submitted").

**Guided calc correction (Aug 2026):** `client/src/lib/guidedEntryGeometry.ts` is the pure brain for Guided entry quantity: UOM-aware fields (`requiredDims`), auto-recalc on geometry edits unless `qtyOverridden`, override detection on manual qty edits, `overrideMismatch` flag (never silently recalc an overridden qty), `deriveOverridden` on draft hydration.
**Why:** the pre-fix screen buried W/T behind "Add details" and let engineers type raw quantities with no geometry cross-check; silent recalc of a deliberate manual qty is a data-loss risk (architect flagged the one-shot-derivation version).
**How to apply:** every restore/hydration generation must set `deriveNeededRef` so override flags are re-derived once BOQ items load — never a one-shot `entries.length` guard (restore can land after the first entries render). Suggestions come from `suggestGuidedBars`/`emptySuggestionsReason` in `shared/dprProgrammeLink.ts` — role-independent by construction; keep it that way. Picker side/chainage narrowing (`sideLabel`/`fromKm`/`toKm` props) and `warnOverBalance` are opt-in props so Detailed DPR stays untouched.

- Live-proof tip: API login needs an approved device row (`user_devices`); a fresh curl login is `device_pending` until approved (dev DB update works).

## Landing page default (Aug 2026)
- Field Home is the universal default landing page for EVERY user — role never decides (old `!isAdmin && isFieldEngineer` rule in Home.tsx removed; same bug class as the DPR entry-mode fix).
- Per-user preference lives in client/src/lib/workspaceMode.ts (`sitelog.workspaceMode.u<id>`), pattern-identical to dprEntryMode.ts. Deliberate "classic" switch remembered per user; second user on same device unaffected.
- Gotcha: auth-context binds user ids in a post-render effect — too late for a component's useState initializer. Components must pass user.id explicitly to getWorkspaceMode/setWorkspaceMode and re-read on userId change (Home.tsx does).
