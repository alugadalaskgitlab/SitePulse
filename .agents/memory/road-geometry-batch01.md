---
name: Road Geometry Batch 01
description: Optional project-level road geometry profile + shared quantity engine (preview-only); invariants and safety gates
---

# Road Geometry & Quantities (Geometry Batch 01)

- `shared/roadGeometry.ts` is the ONLY geometry-quantity engine (pure, no React/DB). UI (`client/src/pages/RoadGeometry.tsx`, route `/work-program/:id/geometry`, gated `qto_boq`) computes the preview client-side from the shared engine — nothing feeds Auto Sequence/Gantt/Arrangements/BOM/DPR.
- Storage: isolated `road_geometry_profiles` table (one row per project, layers as jsonb, `enabled` int default 0 = OFF for existing projects). Deliberately separate from `work_program_bars.plannedWidthM/plannedThicknessMm` — never merge these. Calculated qty is never persisted; BOQ qty never modified.
- **Why:** preview/comparison feature only; corrupting planning fields or persisting derived qty was the spec's top risk.

**Hard invariants (enforced in engine + tests `tests/roadGeometryBatch01.test.ts`):**
- Output UoM = BOQ item's own unit (alias preserved); MT with no density → `conversion_required`, never a fabricated number.
- Corridor from `boq_projects.chainageFrom/To` + `corridorConfirmed`; unconfirmed/invalid/inverted → `corridor_unconfirmed`, zero math. Full corridor, no scope deductions (Batch 02+).
- Classification reuses `resolveWorkType` but ONLY high-confidence resolutions calculate; medium-confidence category fallbacks (BITUMINOUS→bituminous_base, SUBBASE_BASE→gsb) → `needs_mapping`. Subgrade only via explicit `/sub-?grade/` description (resolver has no subgrade key). Other earthwork → unsupported until Geometry Batch 02.
- Default width rule (PROPOSED, pending user sign-off, overridable per layer): DBM/BC/tack & GSB/WMM/prime = carriageway + paved shoulders; subgrade = + soft shoulders.

**Batch 01A corrections (Aug 2026):**
- Classification priority 1 is now explicit `boq_items.layerConfig.mixType` (trim/case-insensitive; only GSB/WMM/DBM/BC map; unknown values like SDBC/BM fall through to the high-confidence resolver, never guessed).
- `formationWidthM` is a first-class design input (additive column); subgrade suggested width = Formation Width, section-sum fallback only when blank; never auto-overwrite a user value — UI offers an explicit "Use suggested" button.
- GSB/WMM suggested width = paved width but is a SUGGESTION needing confirmation, not an engineering rule.
- Decimal-input trap: per-keystroke `Number(e.target.value)` on controlled inputs swallows the trailing "." (can't type 8.75); keep raw string state, convert at compute/save.
- Form hydration on pages with a `:id` route param must be project-scoped (track hydrated project id, not a boolean) or navigating between projects saves one project's form against another.

**Batch 01B generalisation (Aug 2026):**
- Items resolve to a reusable calc type (`area` | `volume_layer`), not a fixed layer list; `GeometryCalcSpec` carries widthSource (`layer_width:<layer>` | `paved_width`) + thicknessSource (`profile_layer` | `item_config`), all reported in result basis metadata.
- SDBC/BM map via layerConfig.mixType with thickness from layerConfig.thicknessMm — thickness required REGARDLESS of UoM (a Sqm SDBC without thickness must be needs_mapping, not a degraded area calc — review-caught hole).
- Scarifying/milling: workType "dismantling" + explicit scarify/milling regex + Sqm unit → area calc; anything else stays out.
- No schema change; single config source rule: needs-attention UI routes to the EXISTING Layer Config dialog via `/work-program/:id?recipeItem=<itemId>` deep-link — never a geometry-specific mapping modal.
- LINEAR calc type deliberately not added (no safe current use).

**How to apply:** any later geometry batch (earthwork geometry, No-Scope masking, density-based MT conversion, feeding downstream) must extend the engine's result statuses, not bypass them; keep PUT route's strict 400 validation pattern (bounded finite numbers, unique layer types).
