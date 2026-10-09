# PERM-REQ-01 — Permission clarity and Owner-only self-approval exemption

## Scope

Implemented after explicit approval of the Site Requirements authentication
repair and reuse of the existing Site DPRs → Approve permission.
No login/session/device middleware, role architecture, existing permission-record writes,
schema changes, allocation workflows, DPR behavior, navigation or hub changes.
No production writes or publishing.

## Permission mapping and exact changes

| Operation | Effective backend rule |
|---|---|
| Raise requirement | Existing sign-in guard; creator ID and name now come from authenticated user, never the submitted body or obsolete session |
| List/detail | Admin/Owner and Site DPRs Approve holders can review; others are restricted to their authenticated creator ID |
| Edit/correct | Authenticated Admin/Owner, or actual creator subject to acted-upon and approved one-time revision checks; Approve alone does not grant editing |
| Material allocation | Unchanged: stores_inventory.create, Admin/Owner or existing legacy manager condition |
| Equipment allocation | Unchanged: plant_equipment.create, Admin/Owner or existing legacy manager condition |
| Labour allocation | Unchanged: labour_management.create, Admin/Owner or existing legacy manager condition |
| Overall allocation and non-decision status updates | Existing legacy gates retained; Approve is not repurposed to authorize allocation |
| Requirement approve/reject | Existing assertApprove helper on site_dprs, followed by known-creator and self-decision checks |
| Request revision | Actual authenticated creator only; reason and pending-request checks preserved |
| Revision approve/reject | Same approval authority and creator restriction; existing revision workflow validation retained |

Only `approved` and `rejected` overall-status decisions use the new guard.
No general replacement of legacy roles across allocation or fulfilment paths.
Remaining legacy checks there are intentionally outside this instruction.

The frontend separates approval authority from allocation controls. It disables
prohibited decision choices/save buttons and revision buttons, and displays:
“You cannot approve or reject a requirement you created.”
Admin/Owner correction controls are distinct from ordinary approval authority.

Permission descriptions now explain:
- Labour Allocation Create means **Update Labour Allocation Status**.
- Notify is displayed as **Receive Notifications**.
- Admin Notifications Create creates administrative notification records,
  not broadcasts or announcements.
- Site DPRs Approve now controls requirement/revision decisions, not DPR behavior.

Stored keys and values, role templates, notification transport, recipient
selection and notification receipt logic remain unchanged. Labour Edit/Approve
remain unavailable.

## Read-only existing-user impact — production

Source: production read replica, queried 2026-10-09. See
`production-approval-impact.json`. No user or permission was modified.

| Account | Active | Admin | Actual isOwner | Stored Site DPRs Approve |
|---|---|---|---|---|
| OWNER (ID 1) | Yes | Yes | **False** | True |
| K V Babu (ID 3) | Yes | No | False | True |

These are all current production holders of this stored permission.
K V Babu will gain ordinary requirement/revision decision authority from this
bit. OWNER has Administrator authority, but the repaired paths will now honor
that authority too. **Neither account may self-approve**, because neither has
the actual isOwner flag. Account names and business designations do not exempt
anyone. Other authenticated Admin/Owner accounts retain their standard approval
authority through the existing helper, independently of stored checkbox values.

Development has one stored holder: K V Babu; see
`development-approval-impact.json`. Production and development inventories are
not interchangeable.

## Historical ownership handling

Production currently has **15 requirements with NULL creator IDs**.
No backfill or historical edit was performed.

Unknown, missing or invalid creator IDs block approval/rejection and revision
decisions for **every account, including Owner**, with:
“Approval is unavailable because this requirement's creator is unknown.”
This is a prerequisite to applying the self-approval exemption, not a guessed
comparison between a missing ID and the current user.

Revisions retain the existing creator-only request model, with corrected
authenticated-ID checks. There is no separate revision-requester identity to
invent. New requests by anyone other than the creator, including Owner, are
denied. Historical unknown-creator revisions cannot be decided.

## Verification evidence

- `authenticated-acceptance.json`: 50 real development HTTP/browser checks.
- `administrator-self-block.jpg`: actual authenticated Administrator screen.
- `cleanup.json`: six disposable users and four requirements removed, along
  with their sessions, devices, permissions and site assignments.
- Creator ID verified both in the real POST response and database read-back;
  forged creator input ignored.
- Creator, Administrator and unauthorised-user approval/rejection attempts
  denied; different authorised approver and genuine Owner accepted.
- Same coverage for revision decisions and unknown creators.
- Material, equipment and labour item-status writes still succeed with their
  existing Create grants, and fail without them.
- Direct API requests cannot gain Owner status by supplying it in the body.
- Focused tests cover the actual route handlers and actual React requirement
  card; notification key/labels and inactive Labour actions are asserted.

## Preservation boundaries

Read-only whole-table digests cover all **140 public development tables**, before
restart, before acceptance, and after disposable-fixture cleanup.

Existing users (including password hashes and flags), permission matrices,
site assignments, historical requirements, notification records and other
business tables stayed unchanged during authenticated acceptance.
Only session/device table digests changed during acceptance, consistent with
normal activity timestamps from an already-open existing user session.
No session/device infrastructure or existing approval/revocation state was
deliberately changed.

The required ordinary application restart ran pre-existing startup jobs that
changed `stock_balances` and `stock_ledger`. The logs reported legacy diesel/LDO
backfills and balance recomputation. Those routines were not modified, and no
attempt was made to undo or repair them. Accordingly, this report does **not**
claim that all business data stayed unchanged across application startup.
See `preservation-comparison.json` for the exact table counts/digests.

## Genuine Publish preview

`publish-preview.json`: success; **no schema difference, SQL statements,
warnings, removals or structural data loss**. No migration was executed.

## Verification totals and delivery

- **129 focused tests passed, zero failures**, including 39 new safeguard/UI
  tests, permission-map checks and existing role/delegation coverage.
- Final full suite: **4,753 passed, 48 failed, 3 skipped**, across **347 files**.
- Compared failed test identities and file inventory to USER-ROLE-02:
  **no new failures and no missing baseline files**.
- Two initial failures were old assertions for the requested Notify label;
  updated them to Receive Notifications, then reran the entire suite.
- Production application build passed; permission-map drift check and
  `git diff --check` passed.
- Final post-suite digests again matched all business/user/permission tables
  against the pre-acceptance snapshot. Only device/session activity digests
  differed; six existing users, 371 permission rows and six historical
  requirements remained unchanged.
- The generic preview capture displayed the unauthenticated startup splash.
  Signed-in verification instead used normal authenticated Chromium, waited
  for the splash to finish, and used actual mouse input.
- Verified code is committed locally; the final delivery message records the
  commit and the result of the requested remote push. No publishing performed.
