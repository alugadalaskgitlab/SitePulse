---
name: Permission preservation
description: Scope and access-preservation rules for permission-matrix changes
---
Keep the full permission matrix, not a simplified role model. Tightening page gates requires checking existing access first and preserving it through additive View grants only; do not reapply templates to existing users or change their account flags.

**Why:** The owner explicitly requires individual control over every action without locking out current users.

**How to apply:** Verify the target database before permission writes. Development access-preservation evidence never proves production is migrated; production needs separately authorized checks before a rollout.

## Site Requirements self-approval scope

Site Requirements creators must not approve or reject their own requirements
or their own submitted revisions. Only the authenticated account's `isOwner`
flag exempts that account from this restriction; Administrator status and
business designation do not. Separate accounts belonging to the same person
must not be linked or given cross-account exemptions.

**Why:** The user explicitly requires account-specific separation of approval
duties, with an Owner-only exception.

**How to apply:** Preserve other authorization and workflow validation, and do
not change ordinary allocation or fulfilment actions. If revision-requester
identity cannot be established safely, report the ambiguity before changing
revision approval.

Site Requirements approval/rejection deliberately reuses Site DPRs → Approve;
this does not authorize changes to DPR approval behavior or allocation workflows.
Unknown creator IDs block decisions even for Owner accounts. Never infer or
backfill ownership from names, business roles or related accounts.

**Why:** The user approved this precise permission reuse and requires a
read-only report of existing holders before publishing, without changing grants.

## Delegable switches and split sections

The owner explicitly authorized clearing existing Delete, Export and Notify grants for non-admin/non-owner users. Preserve admin/owner accounts and clear nothing else. These switches must not be granted automatically by templates, defaults or Grant all.

When carving new sections from an old key, preserve existing View access additively: qto_boq View transfers to each planning/programme/review and Norms key; admin_settings OR user_management View transfers to Edit Requests. Other users start unticked. Delete, Export and Notify on new keys remain unticked.

**Why:** The matrix models the contractor's individual responsibilities and temporary delegation, not fixed roles. Notifications are activity-specific noise control.

**How to apply:** List every changed permission row. Parked modules are included in permission coverage and admin-route inventory, but only guards/mappings may change; do not alter or investigate business behavior. Verification may grant these actions only to purpose-created temporary development accounts, after asserting the database name. Never send test pushes to real users; remove and verify cleanup of accounts, devices, permissions and test records.

## Shared navigation and lookup boundaries

Ordinary trip editors must not need Vendor Master or Work Programme grants just
to choose a vendor or arrangement. Use narrowly projected operational pickers
behind the trip's existing Edit and site checks; preserve master/detail guards.

**Why:** Correct section Edit and site grants allowed writes but unrelated
supporting-read guards hid the choices, making Administrator appear necessary.

**How to apply:** Prove both the real ordinary UI and its write API. A successful
direct PATCH alone does not establish that the user can fill in the editor.

Keep the project picker reachable by the sections that genuinely use it, while
keeping BOQ detail distinct. Shared read grants require an actual page consumer;
do not broaden a dedicated master-list permission just because planning code
uses the same underlying records.

**Why:** Live ordinary-user checks exposed that a Programme-only account could
read Planning Masters through an overly broad shared-read OR, despite its page
being correctly denied. Conversely, hiding the project picker from a
Programme-only account prevented normal navigation to its permitted screen.

**How to apply:** Verify page, navigation, and API independently in both
directions. A shared metadata read never implies a shared mutation grant.

## Safe live Notify acceptance

Notifications from test saves may only reach temporary accounts, never a real
user's device. Save proof is the HTTP response, database read-back and screenshot;
notification delivery is a separate scope. Never change real notification grants
or account settings to suppress a test.

**Why:** The owner explicitly reaffirmed this boundary when a live save would
otherwise notify a real subscriber.

**How to apply:** Fence only disposable-test delivery at the outbound transport,
restore it afterwards, and disclose the instrumentation. Do not bypass save
handlers, authentication, permissions or site scope.

Before firing a real event, check every push emission from that event against
stored eligible users and active subscriptions, including administrators.
Ordinary users' unticked Notify cells do not establish that nobody real will
receive a push. Do not suppress real subscriptions or change real grants to
make a temporary-account test safe without authorization.

**Why:** Preserved administrator grants made live delivery unsafe during an
acceptance batch restricted to temporary recipients. The apparently unused
alternative Notify key shared its event with another key that had real recipients.

**How to apply:** If no event is safe under the authorized scope, record the
stored eligibility and that sending was not attempted; never claim delivery
or non-delivery was proved, and never substitute a fake transport.

Native browser push registration is not delivery evidence. Check both the
actual provider response and the service worker's notification store.

**Why:** A fresh native Chromium subscription was accepted at registration
but rejected as stale/invalid on its first real send; an empty notification
store for an eligible user must not be reported as a passed positive test.

**How to apply:** Keep recipient eligibility, provider outcome, and observed
receipt separate. If only one real event is authorised, do not replay it to
repair a failed positive delivery check.

## Publishing access preservation

Business-role designations must be explicitly assigned, never inferred from a
matching permission matrix. A designation is not authority: individual grants,
site access and privileged flags remain independent. Introducing designations
must not backfill existing accounts or remove their Administrator status.

**Why:** The owner wants recognizable commercial roles without replacing
individual permission control or silently reclassifying existing people.

**How to apply:** Show undesignated accounts honestly, use reviewed explicit
assignment, and warn about sensitive grants and privileged flags retained by
Merge. Persist designation and its confirmed matrix together only on Save.

Verify privileged write endpoints using authenticated ordinary-user requests;
an `/api/admin/` prefix or admin-only UI is not proof of a backend guard.

**Why:** Commercial-role acceptance found existing company branding/licensing
writes protected only by sign-in, despite their administrative URL and UI.

**How to apply:** Keep explicit Admin/Owner checks on system writes and verify
representative refusals when adding broad operational templates.

The owner does not want another recurring startup repair. Access preservation
must be a one-time, durably marked, audited, additive View-only operation;
admins/owners remain untouched. Do not inspect or use a production connection
to perform it: the application handles its own connected database after the
owner publishes.

**Why:** The owner explicitly distinguished this migration from existing
repair/backfill chains that repeatedly run on publish.

**How to apply:** Keep the completion marker and its historical audit intact
after development fixtures are removed. Do not introduce a rerun button, reset
the marker to retest, or infer that development counts describe production.
