---
name: Work-type source-reference phrases
description: Prevent material-source wording inside one BOQ activity from overriding the activity's principal work type.
---

## Rule

Work-type classification must follow the principal activity, not a quoted or
embedded material-source phrase. Embankment work that says its earth is
"obtained from roadway excavation" remains embankment.

**Why:** A broad excavation match can treat the source phrase as the activity,
while a broad embankment veto can break genuine road-excavation descriptions
that merely mention an existing embankment. Both errors affect arrangement and
opening-balance source lists.

**How to apply:** Use narrow principal-work guards such as forming or
constructing embankment, retain road-context excavation variants such as
"excavation in road way", and test both the destination description and a
genuine source description together. Source selectors must independently
exclude their own destination IDs.

## Legacy arrangement destination repair

An old reused-excavated arrangement attached to the excavation BOQ item cannot
be corrected merely by exposing that same item in the source dropdown: the
server must continue rejecting source=destination.

**Why:** Historical misclassification can leave the arrangement's destination
identity wrong even after its invalid source is cleared.

**How to apply:** Relink without recreation only when canonical classification,
contract cut-to-fill wording, equal quantity, absence of a competing active
arrangement, and uniqueness all identify one fill destination. Preserve every
other field and never guess when zero or multiple destinations qualify.