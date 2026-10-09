# DPR 314 resource-flag guard correction

## Cause and evidence boundary

The preservation loop checked `row.isNew || row.workAssignmentEdited` on
equipment, labour, materials and purchases before comparing stored facts.
Both are session flags, not persisted assignment facts. The equipment
assignment callback sets workAssignmentEdited true even if a user subsequently
restores the original assignment. Session restoration retains that flag;
ordinary submission strips it, while the dedicated correction sends raw state.

Fresh persisted-row hydration does NOT set either flag, and automatic assignment
suggestions explicitly exclude persisted equipment. Therefore no claim is made
that simply opening the form necessarily caused this failure.

Read-only production evidence confirms equipment rows 737–741, usage references
184–188 and null top-level BOQ/scope/structure assignments. Deployment logs
confirm the reported 409 error, but log only its generic response. They contain
neither request payload nor row/section/flag details. The exact failing submitted
row and which flag was true cannot be established from that evidence. It would
be incorrect to identify log 741 as the failing row merely because it has the
known missing reference. No original missing-usage investigation was repeated.

## Change

Only the server guard changes. Session flags alone no longer reject an otherwise
identical persisted record. Identity, resource values, row counts, child evidence,
progress baseline and Administrator confirmation remain checked. Assignment
changes are still rejected even if flags are absent or false.

Comparisons additionally recognise the explicit defaults and numeric conversions
performed by the real SiteEdit mapper (entry type, labour category/gender,
material type and decimal material/purchase quantities/amounts). These only
affect comparison: no resource row is written. Rejections now identify section,
array index, saved row ID and field.

The transaction, preserved equipment log 741 / usage reference 188, paid bill
48 checks, progress-only writes and audit insertion are unchanged.

## Verification and release

- 26 focused tests passed across dpr314Correction and dprEqLink01.
- New tests execute the actual SiteEdit mapper extracted from production source,
  with actual quantity/cut-fill/worker-name helpers, and serialize its payload.
- Unchanged mapped equipment/labour/material/purchases with sticky flags pass.
- Changed BOQ, scope, structure, assignment segments, resource quantity/amount,
  usage link and persisted identity fail with detailed diagnostics.
- Existing stale-progress, unauthorized, paid-link preservation and atomic
  rollback tests remain passing.
- One production build passed (existing bundle-size warning).
- No full-suite run, production writes or automatic publication.

Another deployment is required for the published server to use this guard.
This fix is server-only: the existing open form can retry after deployment
without reloading solely for this fix. Keep its unsaved corrections intact.
No live correction was submitted by the agent.
