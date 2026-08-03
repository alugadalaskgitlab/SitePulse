---
name: Earthwork Save/Submit Pattern
description: How the earthwork arrangement save/submit flow works after Instruction 024A; critical for any future changes to the dialog or routes.
---

## Auth helper trap: assertLogin does not exist

The auth helpers exported from `server/auth-routes.ts` are `assertAuthed`, `assertAdmin`, `assertEdit`, etc. There is NO `assertLogin`. Using it compiles fine at the tsx layer but throws `ReferenceError: assertLogin is not defined` at request time — surfacing as a generic 500 on the route.

**How to apply:** Use `if (!assertAuthed(req, res)) return;` — it sends the 401 itself and returns `null` on failure. After adding any new route, exercise it live (or grep for undefined helpers), since tests that don't hit the Express layer won't catch this.

## The earthworkSchemaReady flag

`ensureEarthworkTables()` must run in the **blocking pre-routes** section of `server/index.ts` (inside the `await Promise.all([...])` before `registerRoutes`), not in the background migrations phase.

After it completes successfully and all 40 required columns are verified, `setEarthworkSchemaReady(true)` is called. Both POST and PATCH mutation routes check this flag and return `EARTHWORK_SCHEMA_NOT_READY` (503) before doing anything else.

**Why:** Previously it ran in the background — the flag was never true when the first request arrived, producing a generic 500 "Failed to save arrangement" that blamed the user's input instead of the real cause (schema not ready).

## Single-request Save Draft / Submit for Approval

`buildBody(saveIntent: "draft" | "submit")` is the single source of truth for both actions.

- **Save Draft** → `saveIntent: "draft"`, `status: "draft"` — single POST/PATCH
- **Submit for Approval** → `saveIntent: "submit"`, `status: "submitted"` — single POST/PATCH, no second PATCH

The old `submitMutation` did two requests: POST/PATCH as draft, then PATCH to submitted. This was replaced with a single request.

**On the server (POST):** if `saveIntent === "submit"`, the row is inserted directly with `status: "submitted"` and `submittedAt = new Date()`.
**On the server (PATCH):** `allowedFields` already includes `status`; when `status: "submitted"` arrives, the existing timestamp-setting logic fires.

## Numeric coercion in buildBody

Use `safeNum(v: string | undefined)`: `const n = parseFloat(v ?? ""); return isFinite(n) ? n : null;`

Never send `NaN` — empty string inputs must become `null`.

## ALLOCATION_TOTAL_MISMATCH

For multi-source arrangements, `allocatedQty` must equal the sum of `boqItemAllocations` within 0.01 tolerance. Server returns `ALLOCATION_TOTAL_MISMATCH` (400) if they differ.

## Structured error codes from catch blocks

| Scenario | Code | Status |
|---|---|---|
| Table/column missing | `EARTHWORK_SCHEMA_NOT_READY` | 503 |
| Unknown error | `ARRANGEMENT_SAVE_FAILED` with correlation ref | 500 |
| Validation failure | specific 400 code (AGENCY_REQUIRED, etc.) | 400 |

Frontend `onError` toast shows `data.message` — server must always populate `message`, not just `error`.

**Why:** The old catch block converted every exception to "Failed to save arrangement. Check all required fields and try again." — misleading when the real cause was a missing column.
