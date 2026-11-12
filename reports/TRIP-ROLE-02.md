# TRIP-ROLE-02 — Material trip review and role correction

**Status:** Part A is complete. Part B code and automated checks are complete. The live UI/data acceptance is blocked because the documented development verifier login returned 401 and the owner declined resetting that test account. No trip records were changed; nothing was published.

## Data scope

The managed development SQL tool returned `heliumdb` for its database-name check, so I stopped before reading any tables there. Every data query below used the project's `DEV_DATABASE_URL`, and the script verified `current_database() = sitelog_dev` before querying records. No production or replica database was queried.

## 1. Current page and links

`/site/material-trips` is one page today, gated by the `site_materials` feature. It currently contains:

- The Log Material Trip form, including purchase-indent prefill and receipt sharing.
- The material-trip list with date, site, material, vehicle, supplier, unassigned and arrangement filters, plus the role filter.
- The TripRoleBulkConfirmation panel.
- The bulk material-source panel.
- The BulkTripArrangement panel.

The page reads these incoming values: `piIndentId`, `piItemId`, `pendingReceiptId`, `material`, `supplier`, `qty`, `uom`, `site`, `returnTo`, `hireDate`, and `hireVehicle`. It applies the values to the form or filters as appropriate. The API list supports the date, site, material, vehicle, supplier, unassigned and arrangement filters; the role filter is applied in the page.

Current links into the page:

| Origin | Current destination and parameters |
|---|---|
| Field home | `/site/material-trips?returnTo=/` |
| Site home | `/site/material-trips?returnTo=/site` |
| Site Hub | `/site/material-trips?returnTo=/site/hub` |
| Vendor Bills | `/site/material-trips?returnTo=<current Vendor Bills path>` |
| Site Material Stock | `site=<site>&returnTo=/site/material-stock` |
| Purchase Indents delivery action | `piIndentId`, `piItemId`, `pendingReceiptId`, `material`, `supplier`, `qty`, `uom`, `site` |
| Purchase-indent delivery component | `piIndentId`, `piItemId`, `material`, `uom`, `site`, `qty` |
| TripCandidateWarnings | `dateFrom`, `dateTo`, `hireSupplier`, `hireRole=unresolved`, `returnTo` |
| TripDailyHireReview | `hireDate`, `hireVehicle` |

The two Field home links and the other static links use their corresponding return paths shown above. `returnTo` defaults to `/site/hub` if it is absent.

## 2. Existing bulk-tool limits

- TripRoleBulkConfirmation only accepts unresolved groups whose `transportType` and internal-equipment link are both unset. It writes `transportType=agency_vendor`; trips that already have a transport type are rejected from this bulk path.
- The material-source bulk panel changes only the material-source supplier on eligible trips. It excludes `own_source` trips and does not set `materialSourceType` or `materialSourceLabel`; it cannot turn a trip into own source.
- The arrangement bulk panel only changes the arrangement link.

The new Set source and transport tool can use the existing role fields for source type, source supplier or source-place label, transport type and internal equipment. Vendor identity remains subject to the existing verification permission and identity checks. No additional table or column appears necessary based on the current model; the hired-vehicle confirmation and per-trip edits already use `audit_logs`.

## 3. Hired-vehicle link and vendor-bill effect

`POST /api/site-material-trips/:id/hire-link` calls `confirmTripHireLink`. It appends an `audit_logs` row with module `site_material_trips`, action `confirm_hire_equipment`, actor, time and reason. The new values hold the equipment ID, trip fingerprint, normalized registration and owner, original recorded vehicle/supplier, and whether a conflict was accepted. The trip row is not rewritten by this confirmation.

The link is evidence for hired-equipment daily-hire eligibility. The daily-hire path uses it to identify which Equipment Master vehicle a trip belongs to and to check its reviewed owner against the trip transporter. It does not rewrite or create an ordinary site-material transport line on a vendor bill. A hire-link correction is blocked when the affected vehicle/date already has non-cancelled/non-rejected equipment billing evidence or a hire statement.

## 4. Vendor bills and trips already billed

Auto-pulled site-trip bill lines store the trip identity in `vendor_bill_items.source`, for example `auto:site_material_trip_transport:521`. The suffix identifies the trip, and the middle segment identifies the billed role. Bill candidate generation classifies the trip's current saved roles when items are pulled; saving revalidates auto-pulled sources on the server.

A trip edit does not automatically rewrite an existing vendor-bill item or its saved amount. A later bill edit/re-pull is a separate operation. The existing bill update route can edit bills in any status; verified, approved and paid bills are reset to draft on update. Therefore, the new bulk tool must not call the bill update path. Per the Part B rules, trips currently on approved/paid bills should be excluded; draft/verified bill trips can be included with the specified “re-pull that bill's trips” warning.

For active TAKKADPALLY-SIRUR Soil trips dated 26 August–11 September 2026:

- 391 trips exist in total: 213 already have `own_source`; 178 do not (174 have no saved material-source type and 4 are `vendor`).
- Of those 178, 21 are already represented by saved bill lines. All 21 are on draft bills; none are on verified, approved or paid bills.
- Each listed line is a saved `SOIL - TRANSPORT` row, 1 TRIP at ₹800 (₹800 amount). The live trip edit did not change those saved amounts.

| Bill | Status | Trips (trip ID / receipt number) |
|---|---|---|
| HLC/VB/2026/0051 — G SANGANNA | Draft | 521/33, 523/35, 525/37, 527/39, 529/41, 531/43, 533/45, 535/47, 537/49, 539/51, 541/53, 542/54, 543/55, 545/57, 547/59, 549/61 |
| HLC/VB/2026/0060 — MD FASIUDDIN | Draft | 389/96, 393/100, 397/6, 401/10, 405/14 |

Bill 0051 includes trip 542 recorded as vehicle 4470 and trip 545 recorded as `4983) L`. Trip 542 has no safe match because the 4470 vehicle belongs to another transporter. Trip 545 does match the G SANGANNA-linked Tipper by its unique last-four suffix, 4983. The other 14 bill-0051 trips recorded as 4983 match that same Tipper. All five bill-0060 trips match the FASIUDDIN-linked Tipper.

## 5. Notifications

The individual trip PATCH route sends one push titled “Site Material Trip Updated” with body `Trip #<id> updated`. The existing bulk role-confirm and material-source routes do not send a push. The new bulk action can send one section push after its transaction succeeds, with title/body such as “Material trips updated” / “<n> trips updated: source and transport”. This is one notification event for subscribers, not one event per trip.

## 6. Proposed hired-vehicle matches

The comparison used the recorded vehicle number against active hired equipment registrations. A transporter was considered the same only where the trip's saved Vendor Master identity (or a unique saved vendor alias) agreed with the Equipment Master owner's audited Vendor Master identity. This avoids matching a registration suffix to another transporter's machine. Matching is read-only; no trip was linked.

| Trips | Transporter on trip | Recorded vehicle | Unique proposed Equipment Master match |
|---:|---|---|---|
| 112 | NARSIMHULU | 4470 | Tipper, TS15UF 4470 (equipment 29) |
| 43 | NARSIMHULU | 7839 | Tipper, TS15UA7839 (equipment 28) |
| 15 | G SANGANNA | 4983 (including `4983) L`) | Tipper, TS15UF 4983 (equipment 33) |
| 4 | MD FASIUDDIN | TG 13T 9288 | Tipper, TG 13T 9288 (equipment 52) |
| 1 | MD FASIUDDIN | 9288 | Tipper, TG 13T 9288 (equipment 52) |

**Corrected result:** 175 unique matches, 0 ambiguous matches, and 3 unmatched trips. The earlier Part A count treated trip 545's trailing `) L` as a mismatch; the specified last-four numeric suffix rule correctly resolves it to the unique G SANGANNA vehicle.

The three unmatched records are:

- Trip 542: G SANGANNA, vehicle 4470 — the 4470 Equipment Master record belongs to a different reviewed transporter.
- Trip 446: NARSIMHULU, vehicle 4479 — no reviewed hired-equipment registration matches.
- Trip 336: NARSIMHULU, vehicle 9288 — the 9288 Equipment Master record belongs to a different reviewed transporter.

## Part A result

No schema change is expected for the specified page split and Set source and transport tool. The existing trip fields, vendor-identity checks, hired-vehicle audit log and trip edit audit log cover the described data.

## Part B — code and verification

### Page split

- `/site/material-trips` remains the log page. It retains the trip form and purchase-indent prefill and now shows the selected site's last seven days of trips, newest first, with the existing edit, receipt-share and hire-vehicle-link actions. The “All trips and corrections” link is shown only to Materials-edit users; add-only users remain on the log page without trip history or correction links.
- `/site/material-trips/review` is the Materials-edit review page. It has the existing full filters and trip list, no entry form, and links to the three separate tools: “Link to execution arrangement”, “Material source backfill” and “Set source and transport”.
- Each tool is on its own Materials-edit page, carries the review filters and has a Back link. Arrangement linking stays in the existing `BulkTripArrangement` component. Material-source backfill remains filter-based, now with a separate count preview and explicit confirmation before saving.
- Field/Site/Vendor Bills and purchase-indent links still open the log page. TripCandidateWarnings, daily-hire review and Site Material Stock open the review page with their filters. `returnTo` is retained across the page links.

### Set source and transport

- The new tool lets the user select individual or all filtered trips, choose an own-source place or (with the existing verify permission) an active Vendor Master entry, and choose agency/vendor transport or in-house transport.
- Existing source-place labels are suggested by site. Agency vehicle choices come from the server's audited Vendor Master identity resolution; a short number is proposed only when the last-four match is unique among active hired equipment belonging to the recorded transporter. A null direct vendor ID does not hide a server-confirmed alias match. Ambiguous/unmatched vehicles stay unlinked unless selected in the preview.
- The server preview excludes trips already on approved/paid bills and includes draft/verified rows with the bill status and re-pull warning. Applying rechecks the preview fingerprints, site scope and bill status in one transaction; it changes only the source-role fields, transport type and the existing hired-vehicle link. The per-trip audit history records the actor and reason, and one section notification is sent for the batch.
- No bill, stock, DPR, receipt, material, quantity, unit, date, transporter name, site, receipt number, BOQ link or arrangement link is written by this new operation. No schema changes were made.

### Tests and build

- Focused tests: **81 passed across 5 files**, including review/log navigation, separate source and transport preview/apply, bill exclusions/warnings, unique and ambiguous vehicle matching, site-scoped routes and existing trip behavior.
- `npm run build`: passed. The build reports the repository's existing Browserslist-age and large-chunk warnings.
- The verifier login attempt used the normal login endpoint and returned **401**. The owner declined resetting the dedicated development verifier account, so no alternate login or auth bypass was attempted.

### Development UI/data acceptance — not completed

The requested signed-in screenshots (Log page, Review page, Set source and transport preview, and a trip after save) could not be captured without an authenticated development session. The requested update of the 112 NARSIMHULU/4470 trips to own source “Bodapally borrow area”, agency transport, and Tipper TS15UF 4470 was **not applied**. No trip or other business record was changed. Complete these remaining UI steps after an authorized development verifier session is available; then verify all 112 rows and capture the four screenshots. No production or replica database was queried, and no publish was performed.
