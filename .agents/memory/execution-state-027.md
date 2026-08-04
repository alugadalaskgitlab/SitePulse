---
name: Execution State & Controlled Editing (027)
description: Compact execution-state derivation, pendingRevision shape, controlled-edit classification, and route hardening for earthwork arrangements
---

# Execution State & Controlled Editing (Instruction 027)

## Derivation
- `shared/executionState.ts` is the single source of truth: `deriveExecutionState(scopeQty, arrangements, opts)` → 7 states (arrangement_required, outsourcing_proposed, outsourcing_approved, partly_outsourced, hlc_inhouse, client_supplied, on_hold).
- Rules: on_hold has priority and its qty still counts toward coverage; cancelled/rejected ignored; saved-but-unapproved in-house decisions already read hlc_inhouse; full coverage with split responsibility (HLC keeps execution components) → partly_outsourced; reused_excavated ≈ hlc_in_house.
- UI consumers: Gantt badge (ExecutionStateBadge next to Handshake icon), Procurement concise summary card, ExecutionArrangements register page. Detail lives only in BarArrangementPanel / ArrangementSummaryCard.

## pendingRevision shape
- New shape `{fields, reason, proposedByUserId, proposedAt}`; legacy 026 flat map still readable via `readPending()` in the PATCH route. Never assume shape — always go through readPending.
- Pending revisions NEVER affect demand — old approved values keep driving calculateBomDemand (tested).

## Edit classification
- `classifyArrangementEdit(current, body)` splits edits into operational (immediate, audited; dates/plannedDailyOutput additionally need editReason) vs material (agency/qty/rate/scope/components → revision flow). Unchanged values (JSON-equal) are not flagged.
- Flows: saveIntent "revise" (+revisionReason) stores pendingRevision; revisionAction approve/reject/discard decides it; saveIntent "apply_now" is approver-only with mandatory editReason. Dialog intercepts 409/400 challenge codes and shows inline reason form.

## Route hardening (post code-review fixes)
- **Status demotion blocked**: operational statuses can only move forward (ALLOWED_TRANSITIONS map) — demoting to draft to bypass revision guard returns INVALID_STATUS_TRANSITION.
- **checkMaterialGuards(fields)** re-validates merged effective values (BOQ source, allocation-sum, over-allocation, qty not below bar-linked total) at proposal, approval AND apply_now time.
- Revision propose/approve/reject/discard run in `db.transaction` with `.for("update")` row lock; REVISION_ALREADY_PENDING re-checked inside the lock.
- reject requires approver; discard allowed for proposer or approver.

## Traps discovered (apply broadly)
- **`(req as any).user` is NEVER populated** in this app — auth middleware sets `req.authUser`. Any route reading req.user silently gets undefined actor. Fixed to `authUser ?? user` in earthwork routes; other modules may still have this bug.
- **`storage.createAuditLog` does not exist** — optional-chained calls were silent no-ops for ALL earthwork audit logging. The real method is `storage.logAudit` (auditLogs table: integer transactionId, NOT NULL userName). Audit "working" in code review ≠ rows in DB — always verify with a SELECT.
- tsx dev server does NOT hot-reload server code — restart the workflow after routes.ts edits before live-testing.
