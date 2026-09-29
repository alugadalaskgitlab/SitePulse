---
name: Condensed DPR mockup review boundary
description: User-approved prototype interactions and the separate production approval boundary.
---
The user confirmed the condensed DPR prototype's disappearing readiness issues, Fix links, equipment tank-confirm interaction and condensed equipment layout worked correctly during review on 2026-09-29. Preserve these during targeted visual refinements.

**Why:** Review approval concerned isolated sample-data behavior, not permission to change production DPR submission or validation.

**How to apply:** Keep prototype refinements isolated. Treat production integration as a separate instruction, not an automatic next step after visual approval.

Production rollout approval is surface-specific: section-based DPR first, classic combined forms second, read-only views last, with an explicit review stop between surfaces. Preserve the approved mockup unchanged as the reference.

**Why:** Shared editors and equipment components can otherwise change unapproved surfaces during a supposedly isolated rollout.

**How to apply:** Gate shared presentation changes by the approved surface; approval of the mapping plan or one surface does not authorize the next.

The user explicitly distinguished hiding unconfirmed consumption from styling: retain that approved section-only presentation, but do not silently extend it to classic forms. Display visibility is independent of submit eligibility.

**Why:** Tank-confirmation is not a mandatory readiness rule; changing what users can see still requires disclosure and approval even when calculations and persistence are unchanged.

**How to apply:** Separate layout reuse from visibility changes and validation changes when proposing further DPR work.

In the equipment-row prototype, a machine-day Breakdown status is distinct from a timed stoppage record: a partial-day stoppage should not imply the whole day was a breakdown. A positive closing-minus-opening meter reading may display “Working” without storing or offering Working as a manual status; no positive meter evidence means “Not specified” unless an explicit idle/breakdown disposition exists.

**Why:** The user wants daily status to describe the day without duplicating incident detail or requiring a manual working flag. A timed repair can coexist with real work on the same day.

**How to apply:** Preserve the status/incident distinction if a later, separately approved production integration adopts the prototype; do not treat mockup approval as permission to change current production status validation.

Production equipment integration explicitly supersedes the prototype's derived Working policy: use stored status, preserve legacy null and linked statuses, and introduce Working defaults only for genuinely new identified entries in the separately approved parent-screen stage. The approved reason requirement is only for idle-no-work, including all existing validation gates.

**Why:** The user approved these distinctions after investigation found that current new rows can lack status, Fleet distinguishes unspecified from working, and independent readiness checks would otherwise retain the old reason requirement.

**How to apply:** Do not derive or rewrite historical status from meter readings. Shared-component approval is not approval to wire parent layouts or initialize new rows; stop for approval between shared component, edit-screen wiring and read-only verification.

The user confirmed classic readiness reuse and Preview Fix state preservation on 2026-09-29, and required explicit separation of tank-display gating from equipment layout props.

**Why:** Identically named props for unrelated presentation behaviors make accidental behavior changes likely even when today's call sites are correct.

**How to apply:** Keep visibility-control names specific to what they hide; never infer approval of tank gating from approval of compact equipment layout.