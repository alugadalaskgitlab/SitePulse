# RATECARD-01 — Part A (read-only)

**Checked:** 11 November 2026  
**Database:** `sitelog_dev` (`current_database()` confirmed). All SQL ran in read-only transactions. No production database or replica was queried. No app data or code was changed. No publish was performed.

## Snapshot

- Vendor master: 14 records.
- Vendor rate cards: 102 rows; 57 have `vendor_id`, 45 have no `vendor_id`.
- Vendor bills: 58 live bills and 411 bill-item rows. There were no deleted or cancelled bills in this snapshot. Status counts: 40 paid, 9 draft, 7 approved, 2 verified.
- A per-bill financial fingerprint was captured below before any Tidy/Remove work. It includes the bill id/number/date/status, saved total, net payable, amount paid, and ordered line id/category/description/quantity/unit/rate/amount. Later verification can compare every bill against this baseline.

## Rate-card rows by vendor master

| Vendor ID | Vendor master | Rows | Names currently stored on its rows |
|---:|---|---:|---|
| 2 | Gangaram Narsimulu | 42 | GANGARAM NARSIMHULU; NARASIMHULU; NARASIMHULU JCB PLANNT; NARASIMHULU JCB PLANT; NARSIMBULLU |
| 3 | Mahipal Kalpaguri | 2 | MAHIPAL |
| 4 | Nafeez | 1 | NAFEEZ |
| 5 | MD Fasiuddin | 6 | FASIUDDIN; MD FASIUDDIN |
| 7 | G Sanganna | 3 | G SANGANNA; SANGANNA |
| 8 | Ramesh Mohabathpur | 1 | RAMESH MOHABATHPUR |
| 14 | Sivakumar | 2 | SIVAKUMAR |
| 1, 6, 9, 10, 11, 12, 13 | Saravana Metal Industries; HLC; Orsu Venkanna; Sunilkumar; Viswanath; Ratnam-Tractor; Prabhu Patel | 0 | — |

The zero-row masters are listed by IDs as returned by the database; some similar-looking legacy rows are not linked to those masters.

## Repeated items and conflicting rates

The count below groups linked rows across all saved vendor-name spellings, using category + normalized item key + unit. It treats `20_MM` and `20MM` as equivalent and `TRIPS` and `TRIP` as equivalent. Gangaram Narsimulu has **12 repeated item groups**: **3 rate-conflict groups** and 9 groups whose copies currently have the same rate.

| Item group | Copies / saved rows | Rates |
|---|---|---|
| Equipment · JCB · DAYS | 2: #1 NARASIMHULU; #90 GANGARAM NARSIMHULU | ₹3,000 / ₹3,500 |
| Equipment · JCB · HRS | 2: #2 NARASIMHULU; #91 GANGARAM NARSIMHULU | ₹1,000 / ₹1,000 |
| Equipment · Tipper · DAYS | 2: #3 NARASIMHULU; #92 GANGARAM NARSIMHULU | ₹3,000 / ₹3,000 |
| Equipment · Tipper WMM interacting, bill-text key · DAYS | 2: #15 NARASIMHULU; #102 GANGARAM NARSIMHULU | ₹5,000 / ₹5,000 |
| Equipment · Tipper WMM intercarting, bill-text key · DAYS | 2: #12 NARASIMHULU; #103 GANGARAM NARSIMHULU | ₹5,000 / ₹5,000 |
| Material · 20 MM · MT | 4: #51 and #4 NARASIMHULU; #93 and #94 GANGARAM NARSIMHULU | ₹390 (2 rows) / ₹600 (2 rows) |
| Material · Dust · CFT | 2: #5 NARASIMHULU; #95 GANGARAM NARSIMHULU | ₹22 / ₹22 |
| Material · Dust · MT | 2: #24 NARASIMHULU; #96 GANGARAM NARSIMHULU | ₹390 / ₹390 |
| Material · Soil · CFT | 2: #75 NARASIMHULU; #98 GANGARAM NARSIMHULU | ₹1.80 / ₹1.80 |
| Material · Soil · TRIP(S) | 5: #16, #83, #84, #97, #104 across the linked names | ₹800, ₹1,000 (2 rows), ₹1,450, ₹8,000 |
| Transport · Mix transport · KM | 2: #50 NARASIMHULU; #100 GANGARAM NARSIMHULU | ₹125 / ₹125 |
| Transport · Sangam-to-plant transport · MT | 2: #52 NARASIMHULU; #101 GANGARAM NARSIMHULU | ₹95 / ₹95 |

Two other duplicate groups are not linked to a vendor master: BALARAJU “Plant Work” and BALARAJU SANGAPUR “Plant Work” / “Plantwork”; each spelling has two `other`/DAYS rows at ₹750.

## Rows not linked to a vendor master

There are **45 rows with `vendor_id IS NULL`**, under these 19 saved names:

| Saved name | Rows |
|---|---:|
| BAKKANNA | 1 |
| BALARAJU | 6 |
| BALARAJU SANGAPUR | 6 |
| MALLESH | 3 |
| MALLESH KOHIR | 4 |
| MOHAN REDDY | 2 |
| MOHAN REDDY PAVER | 2 |
| NARESH SARPANCH SINGITHAM | 1 |
| PRABHU PATEL | 1 |
| RAJU | 3 |
| RAMESH ROLLER OPE | 3 |
| SAILU NARAYAKHED | 4 |
| SAMSON DCM TRUCK | 1 |
| SATHYANARAYANA | 1 |
| SUNIL | 1 |
| SURESH | 1 |
| SURESH TIPPER | 3 |
| TRAILOR MALLESH KOHIR | 1 |
| VISWANATH | 1 |

Text resolution finds two of these rows can be associated with a current Vendor Master name (`PRABHU PATEL`, `VISWANATH`), but their foreign keys are still null. The other 43 do not resolve to a Vendor Master by exact name or the saved alias table. None of these links was changed.

## Bill-text-like rows

The requested screen rule flags a row when its item key/label contains `|`, `HRS`, or `DIESEL`, or its key/label exceeds 40 characters. **15 rows** meet that test:

- #2, #91, #78, #89, #108, #20, #68: equipment keys containing `HRS`.
- #12, #15, #102, #103: long Tipper/WMM description strings containing hours and diesel amounts.
- #27, #28: JCB fuel/diesel descriptions.
- #64, #67: long vehicle-to-site transport descriptions.

These are candidates for the separate bill-text review; the screen should not remove them automatically.

## Rows with no detectable bill-line match

`vendor_bill_items` stores the final line description, quantity, unit and rate, but has no `rate_card_id` or saved `item_key`. Therefore the database cannot authoritatively say which rate-card row was used for a bill line, or prove that a card was never used. A strict category/unit plus normalized item-label scan found **30 rows with no detectable matching line**:

`#2, #10, #11, #17, #18, #26, #27, #28, #29, #31, #32, #34, #35, #58, #63, #64, #73, #74, #75, #76, #77, #80, #81, #82, #83, #91, #98, #104, #105, #107`.

This is a review list, **not a safe-to-delete list**: some historical lines were renamed or have different descriptions, and the bill rows do not retain the rate-card identity. The Tidy preview should show observed evidence and let the Owner decide; it must not label these as definitely unused without stronger evidence.

For the two main conflicting groups, the closest bill-line evidence is:

| Group | Latest visible candidate line | Limitation |
|---|---|---|
| 20 MM · MT | HLC/VB/2026/0030, 13 May 2026, draft: `20 MM`, ₹390/MT | Exact item wording and unit match; line source is manual, so it is not proof that a card supplied the rate. |
| Soil · TRIP(S) | HLC/VB/2026/0012, 16 March 2026, draft: `SOIL (SITE)`, ₹1,450/TRIPS | Description and unit are close, but no rate-card id is stored. |
| JCB · DAYS | HLC/VB/2026/0017, 1 June 2026, paid: `JCB FOR PLANT PRODUCTION`, ₹4,000/DAY; HLC/VB/2026/0028, 13 May 2026, verified: `JCB`, ₹3,500/DAY | The latest description may be a different item. Neither line can be proven to have used the JCB daily card. |

Accordingly, exact “last used bill” information cannot be recovered for every item group from today’s records alone. A new bill-item link would be needed for guaranteed future attribution, but it is not part of this Part A and no schema change is proposed here.

## How rate lookup works today

`GET /api/vendor-rate-cards?vendorName=...` resolves a unique master/alias family and returns cards linked by vendor ID plus legacy null-ID cards saved under recognized names. Matching then requires category, item key and unit.

- An exact selected vendor-name spelling is preferred over rows under other aliases.
- Within that set, item-key match priority is used, then newer `updatedAt`.
- Normal automatic pull applies a matching card only when there is one usable same-unit match; ambiguous matches are left unapplied. Material unit changes likewise require a unique match.
- The Set Rates dialog seeds its value from the current bill line when present; otherwise it uses the first card in the sorted match list. Thus if duplicates remain, an exact alias row can seed a different rate than another spelling, and the newest timestamp resolves only ties within the chosen name/key order.
- Configured transport cards follow their own uniqueness check; material-specific site-trip transport stays unpriced unless exactly one matching configured card exists.

## Places that can create rows / aliases

- **Rate Cards screen:** POST `/api/vendor-rate-cards` and POST `/api/vendor-rate-cards/bulk-upsert` call the shared upsert. The screen sends the selected name and vendor ID. If an alias spelling is selected, it can create a row stored under that alias while linking its `vendor_id` to the master; storage uppercases the submitted name but does not rewrite it to the master name.
- **Vendor bill save:** current `VendorBills.tsx` only reads rate cards for suggestions/auto-pricing; it does not call a rate-card write endpoint. Saving a bill preserves its line rate but does not create a rate-card row.
- **Imports:** the current admin export/import table allowlists omit `vendor_rate_cards`; importing vendor bills imports their bills/items only and does not create rate-card rows.

## History storage / schema

No new table is required for the requested row-removal history. Existing `audit_logs` can retain a `vendor_rate_card` action keyed by the removed/merged row ID, with the full old row in `old_values`, the kept row/choice in `new_values`, the Owner’s reason, user identity and timestamp. This is additive data in the existing audit table; no schema change is proposed.

## Vendor-bill before snapshot

All 58 current bills were captured. The fingerprint covers the exact bill status and each saved line’s quantity, unit, rate and amount, plus the saved bill totals, net payable and amount paid. After Tidy/Remove, compare the same fingerprint for each bill; expected result is zero changed bills. `—` means `net_payable_amount` was null in this snapshot.

| Bill | Status | Lines | Saved total ₹ | Net payable ₹ | Snapshot MD5 |
|---|---|---:|---:|---:|---|
| HLC/VB/2026/0011 | approved | 3 | 10,500 | — | caa7912711b5dc0cf3626a59df1b910d |
| HLC/VB/2026/0001 | paid | 8 | 170,040 | — | 39567a339b61187208564e9564e9e915 |
| HLC/VB/2026/0002 | paid | 4 | 28,110 | — | a138d6702f5122b0cfed445265714836 |
| HLC/VB/2026/0003 | paid | 4 | 82,840 | — | 529ed8e4b02a9476b71553c9528c7d0e |
| HLC/VB/2026/0004 | paid | 16 | 193,050 | — | 27862fb57d3255e42767d7646ec2a048 |
| HLC/VB/2026/0006 | paid | 4 | 40,580 | — | d25fff1d6ce1433bcaf35df9abedf1c5 |
| HLC/VB/2026/0007 | paid | 2 | 66,246 | — | 3560d4a00886d827ad5b1c433de73573 |
| HLC/VB/2026/0008 | paid | 2 | 66,420 | — | 2830503dff506fb9aab2b63ef235aace |
| HLC/VB/2026/0009 | paid | 3 | 9,500 | — | 57d8e5deb80c7b8ca94bbc1f2e68bda4 |
| HLC/VB/2026/0010 | paid | 8 | 70,000 | — | c23af9f03006ab30802be8098ffb364a |
| HLC/VB/2026/0012 | draft | 29 | 370,550 | — | fc42c838fefa782fa270306f0e3508a3 |
| HLC/VB/2026/0015 | paid | 1 | 6,000 | — | 8269af783d7afa9fb66f80e49c575934 |
| HLC/VB/2026/0013 | paid | 7 | 7,500 | — | 703efcac4977847591946c6904ff8259 |
| HLC/VB/2026/0014 | paid | 1 | 750 | — | e7c440cc88f61a569057a7de39935d63 |
| HLC/VB/2026/0016 | paid | 3 | 6,000 | — | a9c32a4e24cd1251bb90be3fb47bf45c |
| HLC/VB/2026/0018 | paid | 1 | 21,329.10 | — | d630045cbf7c91bbac87757643cbae80 |
| HLC/VB/2026/0019 | paid | 1 | 4,200 | — | 817c4da473bfe9c41a3d13c149bc9b64 |
| HLC/VB/2026/0042 | draft | 1 | 1,500 | — | adf57420f0da26a8b70ef0618ae1bd48 |
| HLC/VB/2026/0043 | paid | 1 | 1,500 | — | a42937a815a45be42605154cddef543a |
| HLC/VB/2026/0021 | paid | 3 | 6,701.885 | — | be404ea43f4bdbd7852ae0c1a457a425 |
| HLC/VB/2026/0022 | paid | 1 | 18,500 | — | 67318f74aabaf146e917cb9d36da5114 |
| HLC/VB/2026/0023 | paid | 1 | 1,002 | — | 329ad0f79a718b8e2fbc999db3850703 |
| HLC/VB/2026/0024 | paid | 3 | 6,750 | — | 395aaea9322e30542545a14d223b3853 |
| HLC/VB/2026/0025 | paid | 4 | 11,950 | — | 74c1a9b1779ce51cac2ee7caec8bf54a |
| HLC/VB/2026/0026 | paid | 3 | 43,500 | — | bcd607d77fa14f414755a46b69091a69 |
| HLC/VB/2026/0027 | paid | 4 | 5,000 | — | 095f8b33159ea69d525eac0ba6e5885c |
| HLC/VB/2026/0028 | verified | 6 | 15,389.41 | — | a3d26c98b69cd64d090c8c762f78db92 |
| HLC/VB/2026/0029 | paid | 7 | 132,000 | — | 7cd1911e1048c174566c33e5440adda4 |
| HLC/VB/2026/0030 | draft | 2 | 10,870 | — | 9d59b75399ccbd95cf8a0e0370b44a4e |
| HLC/VB/2026/0031 | draft | 6 | 18,000 | — | bfbc90239bca0b77e1be6c2a02fec96b |
| HLC/VB/2026/0032 | paid | 1 | 9,000 | — | 8ee55ef7d3429d2e9716ad11a05fca1c |
| HLC/VB/2026/0033 | paid | 1 | 18,500 | — | b72ae6f8eea613f279d80868a379995c |
| HLC/VB/2026/0034 | paid | 1 | 1,500 | — | 59fbc74230c665d50cd45fd8a9e21ce4 |
| HLC/VB/2026/0035 | paid | 1 | 5,700 | — | f72c4b34c63d514d296908c9d5fdd286 |
| HLC/VB/2026/0036 | paid | 1 | 7,600 | — | 761b42e94bbd3c85511d555b7df0efbe |
| HLC/VB/2026/0037 | paid | 1 | 5,320 | — | 8b62726886b0d4e7b27c02ccf06672bb |
| HLC/VB/2026/0017 | paid | 3 | 12,000 | — | d5b57572f34ec1d1aecc02710acc9ad7 |
| HLC/VB/2026/0038 | paid | 1 | 7,220 | — | c59ab9b0afea89010e3b8981d9a5e103 |
| HLC/VB/2026/0039 | paid | 1 | 6,270 | — | 1c85b87a4383300a567c3d16f4c5854e |
| HLC/VB/2026/0040 | paid | 1 | 7,315 | — | 400d9a8b78eeccf6bb4511eb7275be3d |
| HLC/VB/2026/0041 | paid | 1 | 6,460 | — | 2cbffdc9abe38b19c8cbef5fb104757c |
| HLC/VB/2026/0062 | approved | 1 | 25,161.29 | 25,161.29 | 495cd4b7aa78fc3ce320639ffc2b671d |
| HLC/VB/2026/0044 | paid | 4 | 12,960 | — | 6249179c0641509c7993753b36824a1e |
| HLC/VB/2026/0046 | paid | 2 | 16,020 | — | 83362422f33e3d8c0250c2929ea49f12 |
| HLC/VB/2026/0055 | approved | 1 | 56,130 | 5,007.40 | 7ed5241992b2b0b4d867880a8a731114 |
| HLC/VB/2026/0057 | approved | 1 | 60,667.87 | 9,454.51 | fee9fe55291220c71b62ce7399beb4a4 |
| HLC/VB/2026/0048 | paid | 7 | 34,560 | 24,822.80 | 90a14a180df898729a65ed5a21811a72 |
| HLC/VB/2026/0050 | draft | 2 | 15,770 | — | 96d649c9bd868ecc497baf602522bad1 |
| HLC/VB/2026/0051 | draft | 141 | 112,800 | — | 9e1edca43f916f863da136ec594e0bbd |
| HLC/VB/2026/0052 | draft | 19 | 86,000 | — | 5110f71b1b55803a2ef0734d389c6013 |
| HLC/VB/2026/0053 | approved | 1 | 67,667 | 66,313.66 | 068612d3dc073c37a02e68bc36d750b5 |
| HLC/VB/2026/0054 | approved | 1 | 58,000 | 56,840 | 7a17f98d65dca766dc42fec195cb797d |
| HLC/VB/2026/0059 | paid | 1 | 30,000 | 27,070 | 2ca5bedc2b2dfe7838306b4bfe720033 |
| HLC/VB/2026/0060 | draft | 71 | 56,800 | — | eed938fd1d93bb9d04b20f988d9f5354 |
| HLC/VB/2026/0061 | draft | 1 | 9,677.42 | — | 898360dd0e8b51eefcdf137f965d6b01 |
| HLC/VB/2026/0064 | verified | 2 | 44,032.26 | — | e4415be23b05c3004a49cd32a7e57563 |
| HLC/VB/2026/0063 | approved | 1 | 9,032.26 | 8,851.61 | 6a744e8cd6f235666a007906f286798d |
| HLC/VB/2026/0065 | paid | 3 | 20,710 | 13,395.80 | d209d6667abf88c47d833fb48b778c26 |

**Important:** the baseline table records the dataset at Part A time, before any later Tidy/Remove action. No change has been applied yet.

## Part A complete — stopped

This is the read-only findings report only. No rate-card row was changed or removed; no bill, bill item, payment, vendor, alias, user or permission was changed. Waiting for the Owner’s “continue” before any build or Owner Apply action.

## Part B — implemented, awaiting Owner review

### Rate-card tidy preview and Apply

- Added an Owner-only **Tidy duplicate rate cards** preview on Rate Cards. It groups linked rows by Vendor Master, category, normalized item identity and unit.
- Identical-rate copies are labelled **“Same rate — will be merged”** and need no per-group choice. The preview selects a row that preserves the most existing setup data, then the canonical vendor spelling and oldest row ID as tie-breakers.
- Conflicting-rate groups have no preselected choice. The Owner must select one saved rate, enter a positive new rate, or choose **“Decide later — leave unchanged”** for every conflict. Apply remains disabled while any conflict is undecided or a custom rate is blank/invalid.
- Apply is atomic and checks that the preview has not gone stale. It only merges the rate-card rows selected by the preview; it does not change bills or bill items.
- Each modified/removed row is recorded in the existing `audit_logs` with module/action `vendor_rate_card`, full old row, kept row and choice, Owner identity, reason and timestamp. Manual-row provenance and other note lines are retained.

### Possible bill matches

- The preview may show the closest matching bill line as **“Possible match”**, with bill number, date and rate. It is explicitly marked as a hint only—not proof that a card priced that line, not a default, and never labelled “never used.”

### Unlinked saved names

- The Rate Cards page groups rows with no Vendor Master link under **“Not linked to a vendor”** by their saved supplier name.
- The Owner can leave a group untouched, explicitly link its rows to an existing active Vendor Master record (with a required reason and audit entry), or open the existing Vendor Master create form with the saved name prefilled. Linking and vendor creation are never automatic.

### Verification

- **Earlier bill fingerprint check:** the earlier Part B run reported 0 changes against its then-current development snapshot. A final recheck for this finish run found the development dataset has since diverged; see **Part B — finish** below. Do not treat the earlier result as confirmation of the current dataset.
- **Focused tests at that point:** 9 test files passed, 62 tests passed. The final focused run is recorded below.
- **Build:** `npm run build` passed.
- **TypeScript check:** the repository-wide `npm run check` still reports 468 diagnostics across 61 files. A filtered check found no diagnostics in the changed Rate Cards, Vendor Master, or new tidy files; the existing `server/routes.ts` diagnostics are outside the new route registration.
- No schema changes were made. No rate-card, vendor, bill, bill-item, payment, or other development data was changed by the Part B actions. Nothing was published.

## Part B — finish

### Saved-row removal and bill-text review

- Saved rate-card rows now use stable database identities in the screen rather than their list position. Removing a row under a Vendor Master removes every saved copy of that same item/unit across the vendor's saved-name aliases, after an exact confirmation that states how many copies will be removed and that existing bills are unaffected.
- Every removed copy receives its own `vendor_rate_card` audit entry. On success, the visible list and history refresh immediately; on failure, other unsaved edits remain and the removed row is restored.
- The Tidy preview has a separate “Rows that look like bill text” section. Its checkboxes start unchecked, each candidate shows a “Possible match” hint when available, and Apply removes only the checked rows with audit history.
- Screen messages use the item/vendor details and do not expose internal rate-card row numbers.

### Vendor Master canonical saves and bill rate choice

- Single-row and bulk saves resolve selected Vendor Master names and aliases to the canonical vendor ID/name. Saving an item/unit already present under that vendor's aliases updates the existing card instead of adding a duplicate.
- For an unlinked legacy row, an update preserves its existing saved supplier spelling; the canonical rewrite applies when a Vendor Master match exists.
- Vendor Bills keeps a unique match as an automatic fill. If the same item/unit has conflicting rates across linked names, the item remains unpriced and shows **“Two rates on the rate card — choose”**. Set Rates presents the distinct saved choices with their saved names, does not preselect a rate, and keeps Apply disabled until each conflict is explicitly decided. Pulling or choosing a rate changes the draft form only; saved bills and lines are not edited.
- Alias rate candidates are accepted only when the returned Vendor Master link/alias identity matches the selected vendor; unrelated vendors remain excluded. The targeted UI test covers both the conflict prompt/no default and the single-match auto-fill.

### Current development bill comparison

This read-only recheck used the development connection only. `current_database()` returned `heliumdb`; the current database has **7 vendor bills and 50 bill-item rows**, compared with the Part A baseline of **58 bills and 411 bill-item rows**. No bill or bill-item writes were issued by this work; the current data therefore cannot be certified as unchanged from the earlier baseline.

| Bill | Part A fingerprint summary | Current development summary | Result |
|---|---|---|---|
| HLC/VB/2026/0001 | paid · 8 lines · ₹170,040 | draft · 8 lines · ₹169,822 | Different |
| HLC/VB/2026/0002 | paid · 4 lines · ₹28,110 | paid · 4 lines · ₹28,110 | Summary matches; current full fingerprint not verified |
| HLC/VB/2026/0003 | paid · 4 lines · ₹82,840 | paid · 4 lines · ₹82,840 | Summary matches; current full fingerprint not verified |
| HLC/VB/2026/0004 | paid · 16 lines · ₹193,050 | draft · 1 line · ₹100 | Different |
| HLC/VB/2026/0006 | paid · 4 lines · ₹40,580 | draft · 2 lines · ₹0 | Different |
| HLC/VB/2026/0007 | paid · 2 lines · ₹66,246 | draft · 30 lines · ₹348,380 | Different |
| HLC/VB/2026/0005 | Not in Part A baseline | draft · 1 line · ₹5,000 | Additional current bill |

The other **52 baseline bills are absent** from the current development database:

`HLC/VB/2026/0011, 0008, 0009, 0010, 0012, 0015, 0013, 0014, 0016, 0018, 0019, 0042, 0043, 0021, 0022, 0023, 0024, 0025, 0026, 0027, 0028, 0029, 0030, 0031, 0032, 0033, 0034, 0035, 0036, 0037, 0017, 0038, 0039, 0040, 0041, 0062, 0044, 0046, 0055, 0057, 0048, 0050, 0051, 0052, 0053, 0054, 0059, 0060, 0061, 0064, 0063, 0065`.

Because only six baseline bills overlap and four of those have different summaries, the requested **“0 bills changed”** result cannot be confirmed against the current development data. This report lists the observed differences without attributing them to the Rate Cards work.

### Final verification

- **Focused tests:** 8 files passed, **74 tests passed**: Rate Card tidy preview/apply, bill-text and history UI, vendor rate selection, alias/bulk unit conversion, Rate Cards deletion, storage upsert, legacy transport-rate persistence, and Vendor Bills rate choice/pull behavior.
- **Full suite:** `npm test` completed with **447 test files passed, 6 failed, 2 skipped**; **5,687 tests passed, 8 failed, 3 skipped** (455 files, 5,698 tests total). The failing files were `arrangementProcurementCorrection.test.ts` (source-text expectation), `dpr19B1SiteDashboard.test.tsx` (“Not ready” vs “Readiness unavailable”), `materialReceiptReversal06mD.test.ts` (Kg→Liters conversion lacks density), `purchase-indent-pi01.test.ts` (Cum→MT conversion lacks density), `unscheduledReportCredit.test.ts` (3 progress-quantity expectations), and `vendorBillVb15Server.test.ts` (fixture row undefined). No Rate Cards test file failed in this final full run.
- **Build:** `npm run build` passed.
- The application restarted successfully in test mode; read-only startup readiness reported `ready: true`.
- No schema changes or application data changes were made. No publish was performed.

## Final checks

### Part A bill fingerprints on `sitelog_dev`

- **Not verified in this run.** The requested connection variable `DEV_DATABASE_URL` is not configured in this session (it is also absent from the development secrets list). The only configured database URL is not the `sitelog_dev` target for this comparison.
- I did **not** query or compare against `heliumdb`. I cannot truthfully report “0 bills changed” or enumerate differences without the original `sitelog_dev` fingerprints being compared against that database.
- The Part A baseline remains 58 bills and 411 bill-item lines, with its per-bill MD5 fingerprints in the table above. No bill or bill-item data was changed by this final-check work.

### `dpr19B1SiteDashboard.test.tsx` comparison

Ran only this test file at each requested revision. Each run had **1 failing test and 7 passing tests**:

| Revision | Result |
|---|---|
| `17310f1` (`17310f18`) | 1 failed, 7 passed |
| `e4f4614` (`e4f4614f`) | 1 failed, 7 passed |
| Current (`9987ea55`) | 1 failed, 7 passed |

The same failure occurs at all three revisions, so it is already present at `17310f1`; it is not newly introduced by `e4f4614` or RATECARD-01. Exact error:

`tests/dpr19B1SiteDashboard.test.tsx > DPR19 B1 dashboard readiness > reports missing or unavailable readiness as unavailable, never ready or actionable`

`expected 'Not ready' to be 'Readiness unavailable'` at `tests/dpr19B1SiteDashboard.test.tsx:152`.

Plainly: when a draft's readiness is missing or explicitly unavailable, the dashboard currently labels it **“Not ready”** rather than **“Readiness unavailable”**; it does not show a blocker reason or Fix action for that case. The implementation and test expectation already disagree at `17310f1`, before the later DPR-FLOW comparison commits. No fix was made, as requested.

### RATECARD-01 schema check

- Confirmed no schema change in commits `8df36b8`, `bf4ea41`, or `c9393d5`: none changes `shared/schema.ts` or migration/drizzle files.
- The `shared/schema.ts` blob is identical at all three commits and current `9987ea55` (`3b3c6b7b8a47fcd50b4c0e4f068d9dc28314182b`), confirming no table or column definition changes in this work.
- No application code or database data was changed for these final checks. The temporary test worktrees were removed. No publish was performed.

## Last checks

### `sitelog_dev` bill comparison

- Loaded the configured development connection from `.replit` without displaying or changing it. A read-only query confirmed `current_database() = sitelog_dev`.
- The database contains **58 live bills and 411 bill-item rows**, matching the Part A counts.
- Compared every baseline bill with the current database for the Part A table's visible summary fields: bill number, status, line count, saved total, and net payable. **All 58 summaries match; there are no missing or additional bills and no summary differences.**
- **Full line-level fingerprint result is not certifiable from the saved report alone.** Part A retained one MD5 value per bill, but did not record the fingerprint serialization method or the raw line-level baseline values. I therefore do not label the result “0 bills changed” based only on matching summaries. No bill or line data was changed in this read-only check.

### DPR dashboard readiness display

- Missing or unavailable draft readiness now shows **“Readiness unavailable”**, with **Open** to the sections page and no Submit or Fix action.
- A draft with a real blocker still shows **“Not ready”**, its reason, and **Fix**; it has no Open or Submit action.
- Added regression assertions for unavailable, missing, and blocked readiness.

### Verification

- **Focused tests:** 10 files passed, **86 tests passed**, including `dpr19B1SiteDashboard.test.tsx` and the Rate Card tests.
- **Build:** `npm run build` passed. Existing warnings noted stale Browserslist data and large client chunks.
- No schema or database changes were made. No publish was performed.
