# TRIAL-02 Part A — company-name survey

## Scope

Survey only. No application code, database, company setting, or production data was changed or queried. The scan covered source string/JSX literals under `server/`, `shared/`, and `client/src`; tests and comments were excluded. Line references are grouped where the same label occurs repeatedly.

## G1 — Display labels and copy

| Location | Text found | Proposal |
|---|---|---|
| `shared/executionArrangementCategories.ts:134–135`; `shared/executionState.ts:25,27`; `shared/requirementFulfilment.ts:146,357`; `shared/materialReceiptSummary.ts:77`; `shared/planningEngine.ts:1736,1803,1864,1976`; `shared/hireBilling.ts:1413`; `shared/equipmentPerformance.ts:348` | HLC source, in-house/self-execution, procurement, stock, and hire wording | Use the configured company short name in user-facing labels and messages; retain the existing responsibility and calculation rules. |
| `client/src/components/ActivityReceiptStrip.tsx:91–96,462,521,535,572,615,630,800,926,930`; `ArrangementRegisterLink.tsx:26`; `BreakdownStoppageEditor.tsx:59–60`; `EarthworkArrangementDialog.tsx:110–111,179`; `EquipmentMasterCreateDialog.tsx:226–227`; `EquipmentMasterRows.tsx:182–183`; `ProgrammeBarPicker.tsx:591,596`; `ReceiptWorkContext.tsx:75`; `RequirementFulfilmentPanel.tsx:37–38,183`; `VendorMasterNamePicker.tsx:62`; `trip-master-selection.ts:23` | “HLC”, “HLC OWN”, company/self-execution, borrowed/payable, and receipt labels | Render the configured short name where “HLC” means this company. Keep saved responsibility keys and vendor/agency names unchanged. |
| `client/src/pages/SiteEdit.tsx:3185,3286`; `SiteEntry.tsx:1999,3371`; `GuidedDpr.tsx:1754,2601`; `SitePreview.tsx:262`; `SiteDashboard.tsx:368`; `DieselRequirements.tsx:1516`; `PlantDispatches.tsx:1565,1645,1654,1672,1690`; `PlantEquipmentUsage.tsx:943,1603,1609`; `Plant.tsx:2982,4860–4861`; `PlantStockReassign.tsx:173`; `PlantStockTransfer.tsx:204–205` | “HLC OWN”, “HLC (Common)”, own-stock and borrowing prompts | Show the configured short name for the company-owned party/equipment. Preserve selected IDs and existing saved snapshots. |
| `client/src/pages/PlantStock.tsx:1682,2337,2340,2415,2424,2430,2441,2452,2458,2465,2506,2511,2522,2534,2565,2595,2623,2643,2704,2765–2766,2774,2789,2807–2808,2818,2883–2884,2918,2980`; `WorkDemand.tsx:2392,2434,2549,2759,2803`; `PlantMaterialReceipts.tsx:876–877`; `PlantVarianceReport.tsx:59`; `PlantBitumenStock.tsx:757`; `PlantLdoFlowMeter.tsx:1055,1082` | HLC stock, borrow/replenishment, ledger and reconciliation report labels | Use the configured short name in headings, explanations, exports, and errors; do not alter ledger ownership or matching. |
| `client/src/pages/VendorBills.tsx:3777,4040,4181,5535`; `VendorTallyReadiness.tsx:117,160,198,205,207,228,273,415`; `VendorMaster.tsx:177,305,339`; `AdminSettings.tsx:360,370,586,634`; `BoqProjects.tsx:105`; `EstimatorHub.tsx:143`; `DprDetails.tsx:292`; `client/src/lib/vendorBillStatusError.ts:53–54` | Bill, Tally, settings, vendor-validation, and help text using “HLC” or “High Lane” | Use configured company name for formal/legal text and short name for compact labels. Make examples generic where they are not company-specific. |
| `shared/tallyVoucher.ts:93,153,207,457`; `server/routes.ts:5967,8271,12857,12921,12934,13043,14723,16185`; `server/storage.ts:10369,27296,27430` | Tally messages/XML narration, PDF footer text, filenames, bill messages, and operational diagnostics | Use the company settings in rendered/exported text and new filenames; make diagnostics company-neutral or dynamically named. Keep existing document numbers and legal identity checks unchanged. |
| `server/admin-guide-pdf.ts:370,375,501,608,616–619,623,628,959`; `server/estimator-guide-pdf.ts:337` | “HLC” in generated guide PDFs | Build guide copy from company settings or use generic “company” wording. |
| `client/src/components/permissions/inventory.generated.json:1` | Generated inventory snapshot containing copies of UI labels and an API route name | Regenerate from source after any later label work; do not hand-edit this generated file. |

## G2 — New document-number prefixes

| Location | Text found | Proposal |
|---|---|---|
| `server/storage.ts:18292,18302` | `HLC/VB/...` vendor-bill sequence lookup and creation | Use `company_short_name` only for new numbers. Do not rename existing bills; ensure sequence lookup remains safe for existing prefixes. |
| `shared/purchaseIndentDelivery.ts:56` | `HLC/PI/...` purchase-indent prefix | Use the configured short name for new numbers only; retain existing indent numbers. |
| `server/storage.ts:30084` | `HLC/IRN/...` internal requisition prefix | Use the configured short name for new numbers only; retain existing requisition numbers. |

No other exact `HLC/` document-number generator was found in the scanned source.

## G3 — Own-company party lookup

| Location | Current behavior | Proposal |
|---|---|---|
| `shared/hlcParty.ts:7–12`; `server/storage.ts:2664–2666`; consumers in `server/routes.ts:5965,13621,20927,22873` and `client/src/pages/PlantMaterialReceipts.tsx:46,437` | Resolver prefers a party named exactly `HLC`, otherwise a name containing `HIGH LANE`; several routes/storage operations call it. | Add an explicit own-company party selection in settings, then use its ID for own-party operations. Keep the party’s saved name unchanged; optionally display the configured short name in own-company contexts. |
| `server/storage.ts:5161–5162,5241–5242,7588,8177,9051–9052,9774–9775,10153,10156,10725,27214,27355` | Separate SQL/name searches and fallbacks select an HLC/High Lane party; one active borrow path uses strict name resolution. | Route operational lookups through the explicit company-party ID. Review historical repair paths separately; never let a “first party” fallback choose a contractor’s own-company party. |
| `client/src/pages/VendorMaster.tsx:40` | Blocks vendor names containing `HLC` or `HIGH LANE` as presumed own-company names. | Keep the no-self-vendor guard, but base it on the configured company identity rather than those two hard-coded names. Do not change existing vendor names or aliases. |

## G4 — Stored values and matching keys

| Location / value | Can the screen show the configured short name while preserving the old value? |
|---|---|
| Stored `hlc` responsibility/execution values: `shared/schema.ts:567–568,1141–1142,3184–3185,4713` (fields/validation; `hlc` is an explicit option at 1141–1142); `shared/executionArrangementCategories.ts:29,38,44,403–485`; `shared/executionState.ts:14–27` (`hlc_inhouse`); `shared/requirementFulfilment.ts:91–92,138,145,270`; `shared/materialReceiptSummary.ts:113`; `shared/planningEngine.ts:563,907,912`; `shared/hireBilling.ts:21,830`; corresponding controls in `server/routes.ts:5068–5069,16184`, `client/src/components/ActivityReceiptStrip.tsx:294,799,864`, `BreakdownStoppageEditor.tsx:16–17,59–60`, `EarthworkArrangementDialog.tsx:63,129–171`, `EquipmentMasterCreateDialog.tsx:49–50,78–79`, `ProgrammeBarPicker.tsx:449,586`, `RequirementFulfilmentPanel.tsx:134,179,181`, `client/src/pages/Plant.tsx:4517–4518,4634–4635,4660–4661,4860–4861`, `PlantEquipmentUsage.tsx:572`, `SiteRequirementsList.tsx:856`, and `VendorBills.tsx:296,1859,3776,4028` | **Yes.** Translate labels at render time; keep the persisted `hlc` value and all business rules unchanged. |
| `HLC OWN` in equipment labels; `client/src/pages/DieselRequirements.tsx:886,927` also saves an uppercase `equipmentName` snapshot | **Yes.** Render from the equipment/company identity or format the old snapshot for display only. Do not rewrite the saved snapshot. The literal is not used as a dispatch-source key in server/shared code. |
| `Borrowed from HLC` ledger notes at `server/storage.ts:10024,28280`; fallback ledger narration at `server/storage.ts:10563–10564` | **Yes, display only.** Keep the exact saved note and any legacy matching rule unchanged; show a configured-name presentation without modifying or rematching stored notes. The historical repair matcher is listed under G5. |
| API route `/api/plant-module/hlc-borrow-reconciliation` (`server/routes.ts:8260`, `client/src/pages/PlantStock.tsx:232`), response header `X-HLC-Party-Not-Found` (`server/routes.ts:13629`, `client/src/pages/VendorBills.tsx:1063`), and `hlc-recon` tab/test IDs (`PlantStock.tsx:1680,2332`), plus `img-hlc-logo` test ID (`ReportHeader.tsx:50`) | Not user-facing data values. **Keep these API/UI identifiers stable**; the visible tab title and response message can use the configured name. |
| Exact Tally eligibility check in `server/routes.ts:12850` for `High Lane Constructions Pvt Ltd - SK 2025-26` | **No, not from the short name alone.** This is a legal-company identity gate, not a label. Preserve it until a separate Tally legal-identity setting and migration plan are agreed. |

Other technical strings such as the VAPID default subject `mailto:admin@hlc-sitelog.com` (`server/push.ts:10`) are configuration/integration identifiers, not UI labels; keep the existing configured subject and avoid deriving it from a short name.

## G5 — One-time HLC-specific repairs

| Location | Scope / exposure | Part B proposal |
|---|---|---|
| `server/routes.ts:15169–15178`; `server/storage.ts:11128–11240`; `scripts/fix-ledger-gap-427.ts:11` | Admin route and script for a historical LAXMI 6MM Down repair. It hard-codes party IDs 6 and 1, material 3, dispatches 49/50, and ledger rows 20415/20434. | Keep disabled unless `company_short_name` is `HLC`; never run on startup. Do not use this as a general migration. |
| `server/storage.ts:11241` (`migrateOrphanStockToHLC`), `11541` (`migrateDprPlantStockDieselToLedger`), `22174` (`fixDoubleDeductedDispatchOwnerRows`), `24369` (`fixBadStockBalanceEntries`), `27711`, `27748`, `27896`, `28149` (LDO corrections/rebuilds) | Retained historical methods; no application/startup caller was found in the source scan. Some use party ID 1, fall back to the first party, target fixed ledger IDs 245, 8364, 17991, and 17992, or match the saved “Borrowed from HLC” note (`22174` onward). | Leave unexposed and non-automatic. Do not remove or run them until the owner confirms the historical correction is complete and the method is no longer needed. If retained for HLC recovery, guard by company identity. |

The conditional dispatch backfills at `server/storage.ts:27200,27341` also resolve the own-company party, but are not one-time HLC-only fixes; they should use the configured party resolver if they are used. `fixOrphanStockBalances` (`server/routes.ts:15180`, `server/storage.ts:9692`) is not HLC-specific and is excluded from this group. No data was inspected to determine whether any historical repair has already been applied.

## G6 — Company and plant defaults

| Location | Current fallback | Proposal |
|---|---|---|
| `server/routes.ts:548–559,594–597`; `client/src/lib/featureFlags.ts:27,34,36` | Company defaults include `High Lane Constructions Pvt Ltd`, `HLC`, and `hlc-logo.jpg`; API and client each have fallbacks. | Treat `company_name`, `company_short_name`, and configured `logoFile` as authoritative. Use “Your company” and no logo only if no company name/logo is configured. Keep the current HLC installation visually unchanged. |
| `client/src/lib/materialReceiptSlipPdf.ts:123,131,207,337,341`; `client/src/pages/VendorBills.tsx:2231,5337` | PDF/export fallbacks include “HLC” or “High Lane Constructions”; receipt output also falls back to “Main Plant”. | Use configured company name/short name/logo for output. Do not alter saved bill or receipt values. |
| `shared/schema.ts:622,664,714,768,1350,1368,1399,1438,1687,3245,3260,3290`; `server/storage.ts:6203,6360,12048,12194,14321,14475,14673,14687,14717,14722,14725,14739,14780,16653,16798,17141,20502,21860,22062,24604,24808,25208,26010,26289,29485,29501,29534`; `server/routes.ts:7226,8714,8831,8833,8848,8857,8872,8883,8892,8957,8972,8990,9011,9715,9718,9855,9889,9901,9925,9946,9969,9992,10006,10021,10051–10052,10111,10163,10179,10205,10312` | Schema, insert and query fallbacks use `Main Plant`. | Add a `default_plant_name` setting (initial value `Main Plant` for this installation) and use it only when creating a new plant-scoped record or filling an absent value. Do not rewrite existing `plant_name` data. Keep the schema default only as a compatibility fallback when the setting is absent. |
| `client/src/pages/PlantBitumenStock.tsx:62,70,76`; `PlantDailyReport.tsx:120,128,197`; `PlantDailyReports.tsx:251,518`; `PlantHeatingMismatch.tsx:50`; `PlantHeatingSessions.tsx:36,705,711`; `PlantHeatingTrends.tsx:89`; `PlantLdoBackfill.tsx:22,542–543`; `PlantLdoDipBackfill.tsx:24,542–543`; `PlantLdoFlowMeter.tsx:68,76,82`; `PlantLdoMismatch.tsx:788`; `PlantLdoReconciliation.tsx:79,95,101`; `PlantMaterialReceipts.tsx:628,707,1002`; `PlantShiftLog.tsx:187,189,394,490,516,1030,1186,1321`; `RmcBatchRecords.tsx:125,218`; `RmcMixDesigns.tsx:25`; `RmcRawMaterials.tsx:26` | Plant screens, filters, report/export fallbacks, sample CSVs, and “No Main Plant Operations” use `Main Plant`. | Read the same default-plant setting for new defaults and samples; show stored plant names as saved. The setting must not change historical matching or move any records. |

## Part A conclusion

The existing company settings can drive labels, new document prefixes, and a new default-plant setting without changing saved business values. Own-company party lookup is the main functional change: today it is partly centralized and partly hard-coded in storage code. The Tally legal-company gate is separate and should remain unchanged until explicitly redesigned. No application code or data was changed in this survey.
