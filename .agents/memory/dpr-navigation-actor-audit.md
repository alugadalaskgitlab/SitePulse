---
name: DPR navigation and actor audit
description: Durable rules for DPR return navigation and authenticated creator, editor, and submitter history.
---

# DPR navigation and actor audit

## Reference identity decision

Keep the existing `DPR-{saved record id}` convention rather than introducing a separate number sequence or reusing an original version's identity.

**Why:** Users need to match overlap warnings to the exact physical report/version they open; a shared lineage number would identify multiple different records.

**How to apply:** Use the currently loaded saved record's ID in lists, headers and previews; keep lineage as separate history and leave unsaved reports unnumbered.

## Navigation rule

Every DPR form, draft hub, report, success page, and submitted edit uses a validated root-relative return target. Preserve the complete originating register URL, including filters and tabs, through nested transitions. If no safe origin exists, return to the DPR register rather than a home page or unrelated hub.

**Why:** DPR entry points previously chose different hardcoded destinations, so Back could lose the user's filtered register context or lead somewhere unrelated.

**How to apply:** Carry the outer origin through the draft hub and its section editors. A submitted edit returns to its report, and that report retains the outer register origin. Reject absolute, protocol-relative, backslash, and scheme-bearing return targets.

## Actor audit rule

The stored creator, last editor, and submitter are authenticated user identities, never display names, engineer text, roles, or the current viewer. Submitted versions preserve the original creator and submission identities and timestamps while recording the authenticated version editor as the latest editor.

**Why:** Role-derived labels such as “Admin” are not an audit trail and can misattribute actions; replacing historical timestamps during versioning also rewrites the record's real lifecycle.

**How to apply:** Reuse the DPR's established creator identity, keep the minimum nullable editor/submission fields, resolve names only when loading the DPR detail, and render missing or deleted identities as `User unavailable`. Never guess or backfill legacy actors.