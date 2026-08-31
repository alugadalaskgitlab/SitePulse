# Task #1433 Part B — As-of Stock and Diesel Late Receipt Design Proposal

**Status:** Proposal only; unimplemented  
**Scope:** Diesel/HSD initially, with no change to current stock behavior  
**Decision owner:** Product/PM, Finance/Stores, and Engineering  

## Executive recommendation

Build one **shared chronological stock-calculation kernel**, but expose it first only through an explicitly authorized **Diesel/HSD Late Receipt** workflow. Do not create a separate Diesel arithmetic engine, do not infer delivery dates from creation timestamps, and do not silently rewrite source transactions.

The first release should:

1. introduce a canonical effective timestamp and deterministic sequence for stock-ledger movements;
2. calculate as-of availability from valid ledger quantities, not from the single current `stock_balances` row or stored `balance_after`;
3. serialize every posting for the same `(material, party/Plant Common, stock dimension)` bucket with a transaction-scoped advisory lock plus the existing balance-row lock;
4. preview the entire affected chronological suffix before a Late Receipt can be approved;
5. post the approved receipt, its ledger movement, the recomputed suffix, current balance, and audit records in one transaction;
6. preserve intervening deductions exactly as posted and visibly report any historical insufficiency that remains; and
7. require PM/Admin approval and documentary evidence, with corrections made by reversal/supersession rather than destructive edits.

This is safer than either a Diesel-only fork or a general backdating feature. It keeps arithmetic and ordering rules reusable while limiting operational exposure to a named, permissioned workflow.

## Current-state constraints

- `stock_balances` is one mutable current row per material/party bucket. It cannot answer an effective-date/time question by itself.
- `stock_ledger` records a business `date`, quantities, `created_at`, and a stored `balance_after`, but has no canonical effective timestamp or explicit same-time sequence.
- The existing historical recomputation orders by `(date, id)`. This is deterministic at day level, but it cannot represent actual intraday delivery order.
- Existing current postings update the balance row under `SELECT ... FOR UPDATE`. That protects a present-time adjustment, but a backdated insertion also changes the meaning of every later ledger balance and therefore needs bucket-wide chronological serialization.
- Existing `balance_after` values should be treated as a materialized display/audit value, not as the authoritative input to arithmetic.

## 1. As-of availability at an effective date/time

### Proposed canonical ordering key

Every stock movement should eventually have:

- `effective_at`: timezone-aware business timestamp;
- `posting_sequence`: immutable, monotonically allocated sequence used only as a tie-breaker; and
- existing `created_at` and ledger `id`, retained as posting/audit facts.

The chronological key is:

`(effective_at ASC, posting_sequence ASC, ledger_id ASC)`

`created_at` must not decide business chronology. A Late Receipt is intentionally created later but effective earlier.

For legacy date-only rows, a migration/read adapter must assign an explicit, documented ordering classification rather than pretending the time is known. Recommended policy:

- derive `effective_at` from a source-record time when a valid time exists;
- otherwise use the recorded local business date plus a fixed legacy time;
- preserve existing `(date, id)` relative order among rows whose time is unknown; and
- mark the effective time source as `source_time`, `legacy_date_only`, or `manual_late_receipt`.

The timezone must be an application/site configuration, not the database session timezone. Ambiguous or invalid local times are validation errors.

### Calculation

For bucket `B` and cutoff ordering key `K`, availability is:

`sum(quantity_in - quantity_out)` for all valid movements in `B` with ordering key `<= K`.

“Valid” must use the existing ledger semantics consistently: no cancelled/deleted source movement unless represented by its valid compensating entry, and no known non-stock/legacy duplicate movement. These rules belong in a single server-side query/service and must be regression-tested against current balance reconciliation.

The API should return more than one number:

- available quantity and canonical UOM;
- exact cutoff and timezone;
- last included ledger row/order key;
- count of legacy/ambiguous-time rows;
- whether the result is authoritative or carries an ordering warning; and
- current balance for comparison.

The initial implementation may compute a prefix sum directly with indexed SQL. Recommended supporting index:

`(material_id, party_bucket_key, effective_at, posting_sequence, id)`

Because PostgreSQL nulls are awkward for a party key, use a stable generated/expression key or the same documented null-party sentinel everywhere. Tank/plant/location must be added to the lock and partition key if those dimensions are authoritative for the material; they must not be omitted in one path and included in another.

`balance_after` is not read to derive as-of availability. It is a cache/snapshot produced from quantities in canonical order.

## 2. Backdated Late Receipt and affected history

### Posting model

A Late Receipt is a real `material_receipts` record with an explicit exceptional workflow, not a free-form positive adjustment. Its ledger entry has the actual delivery `effective_at`, while `created_at` remains the time the omission was recorded.

Before approval, the server produces a reproducible preview containing:

- balance immediately before the proposed insertion;
- proposed balance immediately after it;
- every affected later movement, old displayed `balance_after`, and proposed `balance_after`;
- minimum later balance and all negative intervals;
- resulting current balance;
- row count/date span affected; and
- a hash/version of the bucket suffix used for approval.

On approval, the server re-runs the preview under lock. If the suffix hash/version changed, approval fails with a conflict and requires a fresh preview; stale approval must never post.

### `balance_after` recommendation

Keep existing ledger rows and quantities immutable. Insert the Late Receipt ledger row, then recompute `balance_after` for that bucket from the insertion point through the latest movement using the canonical order. Update the current `stock_balances.balance` to the final recomputed total in the same transaction.

This **supersedes the displayed running-balance snapshot**, not the ledger event. To retain reviewability, write an audit/recompute batch record containing:

- batch ID and Late Receipt ID;
- bucket and affected effective range;
- algorithm/order-policy version;
- row count;
- prior and resulting current/minimum balances;
- preview/suffix hash;
- approver and posting actor/time; and
- before/after values, either as per-row audit details or a durable machine-readable snapshot.

Do not mass-edit `date`, quantities, transaction type, references, or notes of intervening rows. Do not delete and recreate ledger rows merely to change their order. A future design may make `balance_after` fully derived at query time, but that larger migration is not required for the limited first release.

## 3. Intervening deductions and historical insufficiency

Intervening deductions remain genuine events and must not be shifted, reduced, cancelled, or re-authored by a Late Receipt. Recalculation changes only their derived running balance.

Recommended policy:

- **Report, do not silently cure:** show every negative interval before and after the proposed insertion.
- **Do not reject genuine evidence merely because a later shortage remains:** the Late Receipt may be smaller than total intervening deductions. Blocking it would preserve a known omission and make the record less accurate.
- **Require explicit reconciliation when negatives remain:** approval requires the approver to acknowledge the remaining intervals, select a reason category, and assign an owner/due date for investigation. The posted receipt is visibly `posted—reconciliation required` until resolved.
- **Never legitimize the original deduction retrospectively:** the audit must distinguish “stock now known to have arrived earlier” from “deduction was authorized with sufficient information at original posting time.”
- **Block malformed or contradictory proposals:** reject if the receipt creates a UOM/bucket mismatch, duplicates existing evidence, predates an applicable opening boundary without a controlled opening-balance review, or the preview cannot be reproduced.

Historical sufficiency is evaluated at the ordering key immediately before each deduction. The report should include required, available, and shortfall quantities. Pre-existing negative periods before the Late Receipt effective time are unaffected and remain visible. Negative periods after it may shorten, disappear, or remain; none are deleted from audit history.

Resolution of a remaining shortage is a separate controlled action: locate another omitted receipt, correct a demonstrably wrong source through its existing reversal/correction mechanism, or perform an authorized physical/financial stock reconciliation. A Late Receipt must never auto-create a balancing adjustment.

## 4. Shared engine versus Diesel-specific implementation

### Recommendation: shared kernel, Diesel-only workflow

Create shared, material-agnostic primitives for:

- canonical bucket identity;
- effective ordering;
- prefix/as-of sum;
- suffix simulation;
- minimum-balance/negative-interval detection;
- suffix `balance_after` materialization; and
- current-balance reconciliation.

The route, permissions, form, approval policy, and initial feature flag remain Diesel/HSD-specific. The material must be resolved by canonical material identity/aliases on the server, not only by a UI label.

This avoids two engines producing different balances. It also avoids changing non-Diesel behavior: ordinary postings continue on their existing path until a separately approved rollout migrates them to the chronological contract.

### Divergence controls

- One set of pure calculation functions used by preview and commit.
- Golden tests proving prefix sum, suffix recomputation, and final current balance agree.
- Dual-read/shadow comparison in non-mutating environments before enabling posting.
- A versioned ordering policy stored with every Late Receipt approval.
- Metrics/alerts for `computed current total != stock_balances.balance`.
- No client-side stock arithmetic used for authorization.
- No Diesel-specific SQL copy of the shared calculation.
- Expansion to another material requires a separate decision, data audit, and feature flag.

## 5. Isolation, locks, ordering, and concurrent postings

### Lock protocol

All writers participating in chronological stock—including ordinary current postings for an enabled bucket—must acquire locks in this order:

1. transaction-scoped advisory lock derived from the complete canonical bucket key;
2. source/workflow row lock, ordered by table and ID when more than one is involved;
3. `stock_balances` row `FOR UPDATE`; and
4. affected ledger rows, selected in canonical order if row locks are required.

The advisory lock is essential because a balance row may not yet exist and because a Late Receipt modifies a ledger suffix, not only one current row. The key derivation must be collision-safe and centralized. Multi-bucket operations acquire advisory locks in sorted bucket-key order to prevent deadlocks.

Use `SERIALIZABLE` isolation for Late Receipt approval/commit, with bounded retry for serialization failures. If operational testing shows this is too costly, `REPEATABLE READ` is acceptable only with the mandatory bucket advisory lock and suffix-version check. Never perform recomputation in a separate transaction after inserting the receipt.

### Commit sequence

Within one transaction:

1. lock bucket and workflow request;
2. validate authorization, approval state, evidence, and idempotency key;
3. lock/read current balance and chronological suffix;
4. recompute and compare the approved preview version;
5. insert receipt and ledger row with immutable ordering metadata;
6. recompute affected `balance_after` values;
7. set current balance to the final ledger sum;
8. insert audit/recompute records and reconciliation task if needed; and
9. mark the request posted.

Any error rolls back all steps. An idempotency key and unique linkage between workflow request, receipt, and ledger row prevent double posting.

Ordinary postings to the same enabled Diesel bucket must use the same advisory lock before the existing row lock. Otherwise a current deduction can race between Late Receipt preview/recompute and commit. Requests for unrelated buckets proceed concurrently.

## 6. Size, risk, and incremental delivery

### Estimate

| Work package | Estimate |
|---|---:|
| Data profiling, ordering policy, timezone/bucket decisions | 2–3 engineering days |
| Additive schema/indexes and backfill tooling | 3–5 days |
| Shared as-of/simulation/recompute service and lock protocol | 5–7 days |
| PM/Admin request, preview, approval, posting, and correction APIs | 4–6 days |
| UI, evidence handling, warnings, history, and reconciliation queue | 4–6 days |
| Automated concurrency, migration, route, and audit tests | 5–8 days |
| Staging rehearsal, reconciliation, runbook, and acceptance | 3–5 days |
| **Total** | **26–40 engineering days** |

This is a medium-to-large, high-integrity change. The highest risks are ambiguous legacy intraday order, a writer bypassing the new bucket lock, incorrect bucket/UOM partitioning, long suffix updates, deadlocks, and partial audit history.

### Incremental recommendation

1. **Read-only foundation:** profile Diesel/HSD history; agree timezone, legacy ordering, bucket dimensions, and exclusions; implement as-of and suffix preview with no writes.
2. **Shadow verification:** compare calculated latest totals with current balances and existing ledger history; resolve discrepancies before enabling posting.
3. **Authorized Diesel Late Receipt pilot:** enable only Owner/Admin submitters and PM/Admin approvers for a small site/party allow-list. No generic backdating endpoint.
4. **Operational hardening:** measure lock duration and suffix size; add checkpointing only if demonstrated necessary. A safe first optimization is recomputing only the affected bucket suffix.
5. **Later expansion by separate approval:** consider other materials or ordinary effective-time postings only after the pilot has clean reconciliation and concurrency evidence.

Do not begin with a global rewrite of every historical `balance_after`, and do not expose an unrestricted date edit on ordinary receipts.

## 7. PM/Admin Late Receipt / Regularise Stock workflow

### Roles and separation of duties

- **Requester:** Owner or Admin; creates and submits a Late Receipt request.
- **Approver:** PM or Admin with explicit `diesel_late_receipt.approve` permission and site access.
- **Poster:** server action under the approver's identity.
- Requester and approver should be different users by default. A same-user emergency override, if the business permits it, requires Owner permission, a second reason, and a prominent audit flag.
- UI visibility is not authorization; every transition is checked server-side.

### Required business fields

- material (server-validated Diesel/HSD);
- party/site or Plant Common bucket, plus plant/tank/location where applicable;
- quantity and canonical UOM;
- actual delivery date and exact local time;
- declared timezone and effective timestamp;
- supplier;
- vehicle number;
- challan number and/or invoice number;
- invoice date where applicable;
- existing Diesel Requirement link when one exists;
- purchase indent/IRN reference where applicable;
- receipt/reference number;
- reason category: omitted entry, delayed document, system outage, migration omission, or other;
- detailed omission reason and why it is being entered late;
- discovery date/time;
- requester, responsible department, and contact;
- duplicate-search declaration; and
- reconciliation owner and due date when preview leaves a negative interval.

“Other” requires explanatory text. The server must validate quantity, UOM, bucket, requirement remaining quantity or separately authorized exception, and reference uniqueness.

### Mandatory evidence

- challan/delivery note or supplier invoice;
- vehicle/reference evidence;
- site/plant acknowledgement, gate register, tank log, or equivalent receiving evidence;
- supplier and quantity/UOM evidence;
- explanation for delayed entry; and
- optional cross-reference to requirement, payment, or procurement records.

At least one primary delivery document and one independent receiving corroboration should be required. Attachments must be linked immutably to the request, checksummed/versioned, access-controlled, malware-scanned by the existing attachment pipeline, and retained after posting/correction. Missing evidence cannot be bypassed by free text.

### States and transitions

`draft -> submitted -> under_review -> approved -> posting -> posted`

Alternative terminal/intermediate states:

- `changes_requested`;
- `rejected`;
- `withdrawn` before approval;
- `approval_stale` when the bucket suffix changes;
- `posted_reconciliation_required`;
- `regularised`; and
- `reversed/superseded`.

Submission freezes a request revision. Editing after submission creates a new revision and invalidates prior approval. Approval records the exact revision, preview hash, ordering-policy version, and evidence hashes. “Regularised” means all assigned negative-history findings are resolved or formally accepted through the separate reconciliation process; it does not mean the audit trail is cleared.

### Review screen

The approver sees:

- receipt facts and evidence side by side;
- duplicate candidates matched by supplier, vehicle, challan/invoice, quantity, date, and requirement;
- as-of balance immediately before/after;
- old versus proposed chronological suffix;
- changed negative periods and minimum balance;
- resulting current balance;
- ordering ambiguities;
- affected row count/date span;
- requirement/PI exception status; and
- explicit attestations that evidence was reviewed and intervening deductions will not be modified.

Approval is not posting if the preview has gone stale. Posting always revalidates.

### Audit requirements

Append-only audit events are required for create, edit/revision, submit, evidence add/remove, request changes, approve, reject, stale approval, post, reconciliation assignment/closure, reversal, and supersession. Each event captures actor ID/name/role, server timestamp, request revision, reason, old/new values, IP/session metadata where policy permits, stock impact, and linked source/ledger IDs.

The posting audit must preserve:

- effective time versus creation/posting times;
- before/after as-of and current balances;
- changed ledger snapshots or durable recompute detail;
- all negative intervals before and after;
- lock/order-policy and algorithm versions; and
- approval and evidence hashes.

### Correction after posting

Posted Late Receipts are not directly editable or hard-deleted.

- A non-stock metadata correction creates an auditable revision without changing effective ordering.
- Quantity, bucket, UOM, effective time, or material correction uses a controlled reversal of the original Late Receipt followed by a new superseding request.
- Before reversal, run the same chronological preview and current-stock sufficiency safeguards. A reversal that would create an unresolved shortage requires the existing safe block or a separately approved reconciliation; it must not borrow room from unrelated future receipts.
- Reversal and replacement commit atomically where feasible, retain links to the original, and never erase the original ledger/audit evidence.
- Duplicate correction continues through the existing safe cancellation/reversal mechanism after genuine stock supports it; Late Receipt is not a shortcut to manufacture reversal headroom.

## Acceptance gates and decisions required

Engineering should not implement posting until reviewers explicitly approve:

1. canonical timezone and treatment of legacy date-only rows;
2. complete bucket dimensions and UOM conversion policy;
3. same-timestamp ordering and immutable sequence allocation;
4. the “post but require reconciliation” policy for remaining historical negatives;
5. separation-of-duties and emergency override policy;
6. minimum documentary evidence;
7. whether `balance_after` audit uses per-row snapshots or a versioned batch artifact;
8. pilot site/party allow-list and rollback/disable plan; and
9. retention and access policy for evidence and audit data.

Release acceptance requires deterministic-order tests, concurrent current-posting/Late-Receipt tests, stale-preview conflict tests, idempotency tests, rollback tests, legacy ambiguity tests, duplicate detection, authorization tests, and proof that non-Diesel behavior is unchanged.

## Explicit non-goals

This proposal does not implement any schema, API, UI, migration, lock, calculation, or stock behavior. It does not authorize correction of any existing production row, weaken receipt reversal safeguards, permit generic backdating, or change non-Diesel/HSD stock handling.