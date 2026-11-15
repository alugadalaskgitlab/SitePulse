# TRIAL-03A

No production data was queried or changed. The Names tidy-up Apply action was not used, and nothing was published.

## Part 1 — Refresh after a publish

- A missing lazy-loaded screen triggers one automatic reload, guarded to once per minute. A repeat failure shows the existing “This screen couldn’t be loaded” card.
- The service worker fetches navigation HTML from the network first, registers with `updateViaCache: "none"`, checks for updates on focus and every 10 minutes, and clears old caches on activation.
- When a new worker takes over, the app reloads once. The app also checks the public, no-auth `GET /api/version` endpoint on focus and every 10 minutes. A changed build id shows “A new version of SitePulse is ready — Refresh”; the bar waits while the user is typing.
- The missing-chunk recovery tests cover a single reload without a loop.

## Part 2 — Trip review filters

- Site, material, vehicle and transporter filters are searchable and draw values from trips matching the selected date/site scope. Matching ignores case and extra spaces.
- Transporter filtering includes Vendor Master names and aliases. Changing other filters preserves the transport/source role filter. The trip editor updates its vehicle list when the transporter changes and keeps the “Other / not in master” option.
- Read-only development check: `soil` and `SOIL` each returned 666 trips. Vendor Master “MD FASIUDDIN” (id 5) had 98 active linked trips: 25 recorded as “FASIUDDIN” and 73 as “MD FASIUDDIN”. The development data did not contain the specific “FASI UDDIN” spelling, so that spelling could not be independently checked there.

## Part 3 — Compacted and loose demand

The demand table now separates “MT per compacted cum” from “MT per loose cum”. Existing figures and calculations are unchanged; the table tests pass.

## Part 4 — Names tidy-up preview

The Owner-only page lists suggested names and usage counts for all six requested groups. It has editable suggestions, row ticks, “Tick all suggestions”, and a confirmation before Apply. Apply was not run.

| Group | Suggestions on sitelog_dev |
|---|---:|
| BOQ display names | 32 |
| Material master | 16 |
| Equipment master | 53 |
| Sites | 11 |
| Vendor master | 13 |
| Parties | 10 |
| **Total** | **135** |

The 61 BOQ, material and vendor suggestions are eligible for Apply. The other 74 suggestions are shown but disabled: those equipment, site and party names are identity fields, not separate display names, so changing them would alter matching keys.

Examples from the read-only preview:

- **BOQ (32):** Roadway excavation → Roadway excavation; Embankment - excavated earth → Embankment - excavated earth; Embankment - Borrow earth → Embankment - borrow earth; Construction of Sub grade → Construction of sub grade; Construction of Granular sub-base → Construction of granular sub-base; Wet Mix macadem → Wet mix macadem; Providing and applying prime Coat → Providing and applying prime coat; Providing 40 mm thick Bituminous Concrete → Providing 40mm thick bituminous concrete; Embankment Borrow earth → Embankment borrow earth; earthen shoulder → Earthen shoulder.
- **Materials (16):** 20MM → 20mm; 10/12MM → 10/12mm; 6MM DOWN → 6mm down; DUST → Dust; 40MM → 40mm; BITUMEN → Bitumen; EMULSION → Emulsion; DIESEL → Diesel; 12MM AGGREGATE → 12mm aggregate; 40 MM AGGFREGATE → 40mm aggfregate.
- **Equipment (53):** 600 KVA GENERATOR → 600 kva generator; 30/40 KVA GENERATOR → 30/40 kva generator; JCB-PLANT → JCB-plant; JCB-SITE → JCB-site; DOZER → Dozer; WATER TANKER → Water tanker; SOIL COMPACTOR → Soil compactor; TIPPER-1 → Tipper-1; TIPPER-2 → Tipper-2; JCB-2 SITE → JCB-2 site.
- **Sites (11):** FDR KK ROAD → Fdr Kk Road; DTPL-BASAVAKALYAN → Dtpl-Basavakalyan; PLANT/CAMP OFFICE → Plant/Camp Office; PR KK ROAD → Pr Kk Road; DTPL-RAJESHWAR → Dtpl-Rajeshwar; VATPALLY LAXMI NARASIMHA CONSTUCTIONS-VENKAT REDDY → Vatpally Laxmi Narasimha Constuctions-Venkat Reddy; KANGTI SITE - MURTHY → Kangti Site - Murthy; SEKURA - LOCAL → Sekura - Local; TAKKADPALLY-SIRUR → Takkadpally-Sirur; ALLADURG PWD ROAD TO PAMPAD → Alladurg PWD Road to Pampad.
- **Vendors (13):** SARAVANA METAL INDUSTRIES → Saravana Metal Industries; GANGARAM NARSIMULU → Gangaram Narsimulu; MAHIPAL KALPAGURI → Mahipal Kalpaguri; NAFEEZ → Nafeez; MD FASIUDDIN → Md Fasiuddin; G SANGANNA → G Sanganna; RAMESH MOHABATHPUR → Ramesh Mohabathpur; ORSU VENKANNA → Orsu Venkanna; SUNILKUMAR → Sunilkumar; VISWANATH → Viswanath.
- **Parties (10):** HIGH LANE CONSTRUCTIONS → High Lane Constructions; SEKURA-DTPL-BASAVAKALYAN → Sekura-Dtpl-Basavakalyan; SEKURA-DTPL-RAJESHWAR → Sekura-Dtpl-Rajeshwar; HLC SITES → HLC Sites; PRIVATE VENTURE → Private Venture; VATPALLY LAXMI NARASIMHA CONSTUCTIONS-VENKAT REDDY → Vatpally Laxmi Narasimha Constuctions-Venkat Reddy; KANGTI - MURTHY → Kangti - Murthy; SEKURA-LOCAL → Sekura-Local; VISWANATH BODAPALLY JCB → Viswanath Bodapally JCB; ASHOK CONTRACTOR → Ashok Contractor.

Vendor and material Apply paths preserve old names as aliases. BOQ display-name edits leave historical document snapshots untouched. No name was changed.

## Part 5 — Sentence-case labels

Visible labels, headings, tabs, buttons and table headings were changed to sentence case. A shared UI style rule prevents legacy uppercase styling from displaying these elements in all caps.

Twenty examples:

1. Linked Site Receipts → Linked site receipts
2. Record Material Receipt → Record material receipt
3. Execution Arrangement → Execution arrangement
4. Work Stretch → Work stretch
5. Temporary Yard → Temporary yard
6. Admin Settings → Admin settings
7. Bituminous Layer Settings → Bituminous layer settings
8. Granular Layer Source → Granular layer source
9. Spray Coat Settings → Spray coat settings
10. Layer Config → Layer config
11. Add Mix Link → Add mix link
12. Company Norms → Company norms
13. Estimate Name → Estimate name
14. Total Cost → Total cost
15. Delete Estimate → Delete estimate
16. Data Export / Import → Data export / import
17. Export Data → Export data
18. Import Data → Import data
19. Earthwork Classification & Cut/Fill → Earthwork classification & cut/fill
20. Edit Requests → Edit requests

The sentence-case pass touched 134 production UI files. The list below is the complete changed production-UI file list relative to `origin/main`; test expectation files are separate:

`client/src/App.tsx`, `client/src/index.css`, `client/src/main.tsx`, `client/src/lib/bomReachBalance.ts`; components: `ActivityReceiptStrip.tsx`, `AppRecovery.tsx`, `AppRecovery.test.tsx`, `BalanceWorkMaterialsByReach.tsx`, `BarArrangementPanel.tsx`, `BillItemPicker.tsx`, `BoqImportWizard.tsx`, `DailyDieselReport.tsx`, `DprEquipmentCompact.tsx`, `DprMaterialsReceived.tsx`, `EarthworkArrangementDialog.tsx`, `EditPermissionButton.tsx`, `EquipmentActivityAllocationEditor.tsx`, `EquipmentMasterCreateDialog.tsx`, `EquipmentTankBalanceInputs.tsx`, `HeatingSessionDialog.tsx`, `PlanVsActualTable.tsx`, `purchase-order-workflow.tsx`, `ReceiptWorkContext.tsx`, `ReceivedTripEditor.tsx`, `ReportHeader.tsx`, `TripEquipmentPicker.tsx`, `TripHireLinkDialog.tsx`, `TripIdentityLinks.tsx`, `TripMasterPickers.test.tsx`, `TripMasterVehicleField.tsx`, `TripRoleEditDialog.tsx`, `TripTransportRoleFields.tsx`, `TripTransportRoles.behavior.test.tsx`, `vendor-bills/EquipmentHireBillOutput.tsx`, `vendor-bills/HireActivityBreakdownCalendar.tsx`, `vendor-bills/HireBillTermsEditor.tsx`, `vendor-bills/HireMonthlyReview.tsx`, `vendor-bills/SavedBillCalendars.tsx`, `vendor-bills/VendorBillReview.tsx`; pages: `AdminReports.tsx`, `AdminSettings.tsx`, `BoqItemRecipes.tsx`, `BoqItemReview.tsx`, `BoqProgramSettings.tsx`, `BoqProjectDetail.tsx`, `ConcreteCalculator.tsx`, `ConcreteCalculatorV2.tsx`, `ConcreteEstimates.tsx`, `DataSync.tsx`, `DprDetails.tsx`, `EarthworkControl.tsx`, `EditRequestsPage.tsx`, `EquipmentPerformanceReport.tsx`, `EquipmentStatus.tsx`, `EstimatorHub.tsx`, `ExecutionArrangements.tsx`, `FieldHome.tsx`, `GuidedDpr.tsx`, `Home.tsx`, `ManagementReport.tsx`, `MixComparativeReport.tsx`, `MixEstimates.tsx`, `MixImpact.tsx`, `MyPlans.tsx`, `NamesTidyUp.tsx`, `NewDpr.tsx`, `NormsLibrary.tsx`, `not-found.tsx`, `PendingPlantReceipts.tsx`, `PermissionMigrationAudit.tsx`, `PlanningMasters.tsx`, `Plant.tsx`, `PlantAuditReport.tsx`, `PlantBitumenStock.tsx`, `PlantDailyReport.tsx`, `PlantDailyReports.tsx`, `PlantDetails.tsx`, `PlantDieselProcurementReport.tsx`, `PlantDispatches.tsx`, `PlantEquipmentUsage.tsx`, `PlantGeneratorLogs.tsx`, `PlantHeatingSessions.tsx`, `PlantHeatingTrends.tsx`, `PlantLdoFlowMeter.tsx`, `PlantLdoReconciliation.tsx`, `PlantLedgerRebuild.tsx`, `PlantMaintenance.tsx`, `PlantMaterialIssues.tsx`, `PlantMaterialReceipts.tsx`, `PlantMaterialReturns.tsx`, `PlantNew.tsx`, `PlantShiftLog.tsx`, `PlantShiftLogManpowerReview.tsx`, `PlantStock.tsx`, `PlantStockReassign.tsx`, `PlantStockTransfer.tsx`, `ProgressReport.tsx`, `PurchaseIndents.tsx`, `RateCards.tsx`, `RmcBatchRecords.tsx`, `RmcCubeTests.tsx`, `RmcDailyReport.tsx`, `RmcDeliveryChallans.tsx`, `RmcMixDesigns.tsx`, `RmcRawMaterials.tsx`, `RoadGeometry.tsx`, `ScenarioComparison.tsx`, `ScopeSetup.tsx`, `SiteBackfill.tsx`, `SiteDashboard.tsx`, `SiteEdit.tsx`, `SiteEntry.tsx`, `SiteHome.tsx`, `SiteMaterialStock.tsx`, `SiteMaterialTripReviewTools.tsx`, `SiteMaterialTrips.tsx`, `SiteMaterialsReceived.tsx`, `SitePreview.tsx`, `SitePurchasesReport.tsx`, `SiteRequirementsList.tsx`, `SiteSuccess.tsx`, `StoresDieselRegister.tsx`, `StoresGrn.tsx`, `StoresHome.tsx`, `StoresHub.tsx`, `StoresIssue.tsx`, `StoresItems.tsx`, `VendorBills.tsx`, `VendorMaster.tsx`, `WorkDemand.tsx`, `WorkProgramme.tsx`, `irn/IrnDetailPage.tsx`, `irn/IrnListPage.tsx`, `irn/IrnRaisePage.tsx`.

Authenticated before/after screenshots were not captured: the preview browser has no signed-in session. No authentication bypass or test account was created.

## Checks

- Focused regression suite: 19 files, 298 tests passed.
- Full suite: 467 files passed, 2 skipped; 6 known baseline tests failed across 4 files (5,791 passed, 6 failed, 3 skipped; 5,800 total). The failures were:
  - `arrangementProcurementCorrection.test.ts`: static text assertion expects “Material mapping required”.
  - `materialReceiptReversal06mD.test.ts`: fixture conversion cannot convert Kg to Liters without configured material density.
  - `purchase-indent-pi01.test.ts`: fixture conversion cannot convert CUM to MT without configured material density.
  - `unscheduledReportCredit.test.ts` (3): existing expectations for null-link BOQ totals, SQM actual quantity, and unresolved-credit totals do not match current results.
- `npm run build`: passed.
- `shared/schema.ts` is unchanged. No data Apply was run and no production database was accessed.
