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