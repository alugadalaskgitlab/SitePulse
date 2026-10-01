---
name: Equipment performance integrity
description: Non-obvious attribution, deduplication, access, review, and utilization rules for fleet performance reporting.
---

An equipment event belongs to an active project only through an explicit live DPR link. A site-access filter limits what a viewer may see, but never becomes evidence that a machine or usage belongs to a project.

**Why:** Machine name, date, site text, and meter similarity are not reliable identities and can silently mix project histories.

**How to apply:** Resolve DPR logs and canonical usages through their stored IDs. A canonical usage replaces a DPR log only when the log's explicit usage link is valid; missing or invalid links leave the DPR log independent.

Historical Equipment Master attribution is review-first. Only owners/admins may confirm or correct an unlinked historical identity, and a canonically linked log is immutable through this review workflow.

**Why:** Attribution changes affect audit history and deduplication; a linked source pair already has a canonical identity.

**How to apply:** Suggestions may assist review but never write automatically. Scope candidate lists to what the viewer may see. Attach breakdown notes only through exact source-type and source-record links.

Identity review belongs in Equipment Master, not inside Equipment Performance filters. The normal master page should show only actionable pending identification, not a permanent historical-identification register.

**Why:** The user explicitly rejected the historical card as clutter. Removing that UI must not delete audit history, confirmed links, or identity-confirmation backend capability. Creating a master and confirming its source identity remain separate operations and can partially succeed.

**How to apply:** Share the unfiltered pending query between the master section and report notice. On create-success/link-failure, retain the created ID and retry only confirmation rather than creating another master.

Hired utilization exists only when both real hire-window bounds exist. Owned equipment reports time since last use and is never labeled idle. Project history starts at the first attributed event even when the current display window is narrower.

**Why:** Missing hire dates and filtered event windows otherwise fabricate commercial or operational conclusions.

**How to apply:** Return unavailable utilization/gap metrics plus a data-quality warning for incomplete hire windows; preserve the unfiltered earliest project event separately from filtered totals.

Tank diesel is measured consumption only when the closing balance was explicitly confirmed and opening, issued, effective closing, and derived consumption are all non-negative. Prefer the confirmed tank balance over a legacy closing value; otherwise label the figure as issued fuel.

**Why:** Legacy unconfirmed rows can contain negative or internally inconsistent dip readings. Treating those as consumption creates false efficiency and variance figures.

**How to apply:** Carry a diesel basis through events and aggregates. Keep total diesel visible, but calculate expected/variance/efficiency only from rows that have both diesel and a valid expected norm, and disclose incomplete comparisons.

No-DPR usage may enter the fleet report only as clearly identified Plant/HMP/RMC activity with no project ID. Site-restricted viewers must not receive standalone plant rows because those rows have no verified site grant.

**Why:** Free-text locations are not project linkage, and unscoped plant rows can expose fleet, operator, and fuel data outside a restricted viewer's sites.

**How to apply:** DPR-linked canonical usage inherits the DPR's site scope regardless of record source. Admit standalone rows only from explicit plant location evidence; never infer a project from names or dates.

Management period and daily consumption must not bridge events omitted by Project/Scope filters. Daily detail must retain the server's gap assessment, not reconstruct consumption from only the visible events.

**Why:** A Site → Plant → Site sequence can have reliable boundary tanks but a false Site-only fuel total. Filtering away the middle event destroys the evidence needed to detect that gap.

**How to apply:** Assess continuity against the authorized canonical stream, expose only visible records, and show unavailable consumption, difference, and rate when incomplete. Meter working hours must stay separate from canonical runtime's clock fallback. Keep explanatory detail out of the main management table.

Read-only DPR actual rates must not promote a site-scoped response to complete chronology when the current user's access later broadens.

**Why:** Site authorization removes events before the performance builder can flag gaps. A cached restricted response can look internally complete while omitting other machine events; current permissions alone do not prove the provenance of that response.

**How to apply:** Bind cached performance data to its access context, revalidate access grants, and withhold numeric rates until the new authorized response arrives. Under the existing API, unknown/restricted full-day context must remain unavailable rather than guessed.

Confirmed fuel does not imply a measured denominator.

**Why:** The canonical calculation permits an odometer's time-based estimated distance, and the shared omitted-event guard conservatively rejects even ordered same-day sibling records. Neither should be bypassed merely to display a number.

**How to apply:** Reuse the management calculation unchanged; decline estimated-distance actual rates, disclose recorded-clock hour provenance, and preserve unavailable results for incomplete same-day evidence. Do not substitute daily fleet averages for individual DPR rows.