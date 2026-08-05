---
name: DPR Quantity Source
description: Calculated-vs-manual quantity source rules shared by SiteEntry, SiteEdit, GuidedDpr and the server
---

# DPR Quantity Source

**Rule:** `shared/dprGeometry.ts` is the single source of truth for geometry quantity math and quantity-source rules — `geometryQtyForRow`, `quantitiesMatch` (tol max(0.005, 0.1%)), `resolveQuantitySource`, `checkQuantitySourceRow`, `MANUAL_QUANTITY_SOURCES` (never includes "calculated"; only the system sets it). Client libs `dprUom.ts`/`dprCalculations.ts` re-export from it.

**Why:** Two data-integrity bugs came from divergence: SiteEntry filled `quantity` via geometry before any "calculated" marking (rows looked manual → blocked save), and GuidedDpr guessed source from UOM (`suggestQuantitySource`, now deleted) recording false "measured"/"weighment".

**How to apply:**
- Set `quantitySource = "calculated"` at the exact moment the calc runs (`applyCalc` in SiteEntry/SiteEdit), never via later inference in payload builders.
- Server (`validateProgressQuantitySources` in routes.ts) never trusts a client "calculated" claim — it recomputes from submitted dims/chainage + BOQ profile via `storage.getBoqItem`, rejects mismatched claims (`QUANTITY_SOURCE_INVALID`) even on drafts, and stamps/clears "calculated" itself.
- Manual qty needs a real source on submit only (draft-lenient); "other" needs `quantitySourceNote`; restoring the calc value restores automatic source.
- Guided rows send `length: null` — geometry falls back to chainage span, so guided qty can legitimately resolve to "calculated".
- Trap: test storage mocks using a Proxy return `[]` for unmocked methods — mock `getBoqItem` explicitly (an array is truthy → wrong profile).
- Payload precedence: user-entered quantity wins; computed value only fills a blank (SiteEdit used to do the reverse and silently overwrote manual overrides).
