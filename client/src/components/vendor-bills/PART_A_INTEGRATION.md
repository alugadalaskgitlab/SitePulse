# Part A — page integration complete

Part A is now installed in `client/src/pages/VendorBills.tsx`. New and existing
edit forms have controls beside the BILL DETAILS status badge and in both
ordinary and historical hire save footers. Saved details have header and
post-notes footer controls without status gating. All controls use existing
`canExport` and hide from field engineers. **No B/C/D work was performed.**

## Completed integration and evidence

- `VendorBills.tsx` retains the edit record's real status independently of the
  existing visual DRAFT badge. Click snapshots read current values, never save
  or refetch. Ordinary saved financial totals use `getBillFinancialTotals` once
  for the screen totals block and export. Existing financial formulas remain.
- `wholeBillPageProjection.ts` projects current row metadata, category/date and
  site/plant/other labour order. Active labour filters are respected, with
  explicit disclosure in export notes that financial totals include hidden rows.
  Single-type ungrouped rows retain cross-category date order. Populated zero
  categories survive. Only untouched, genuinely blank initial seeds are omitted.
- Existing draft calendars supply their current decision-annotated rows through
  `onExportSnapshot`. Historical form rows reuse the already prepared
  `buildBillingDailyRows` output and displayed hire financial objects.
  Calendar keys include bill/vendor/group/equipment/period and export reads only
  current included groups.
- Saved statement calendars use frozen evidence for every statement, including
  the historical working sheet where the page displays it. The first existing
  hire action reuses its original prepared output; other statements do not repeat
  a bill-wide net. Itemized saved equipment calendars supply the output of their
  existing rendered query via an optional callback; no query was added.
- `wholeBillPageIntegration.test.tsx` adds 17 actual-page integration tests:
  new form, both positions, all four detail/edit statuses, unsaved edit retention,
  no export-triggered requests/writes, permissions/engineers, malformed saved
  rate with retained authoritative amounts, active labour filtering/collapsed
  dates, multi-statement frozen evidence, historical footer, and exclusion of a
  rendered monthly calendar, plus freshly pulled unsaved rows with typed rates.

Focused result: **65 passed in 6 files** (the previous 48 plus 17 page tests).
Use the five commands listed below plus:
`client/src/components/vendor-bills/wholeBillPageIntegration.test.tsx`.
Source TypeScript diagnostics in the changed page/helper files remain limited to
the previously documented missing `meterType` property in
`DraftEquipmentHireCalendarProps`.

Additional targeted run of `tests/vendorBillsEquipmentHire07b.test.tsx`:
15 passed, 2 failed. Failures are its existing VB-11 grouped-pull rate assertions
(line 398 expected rate `250`, line 444 expected positive rates); the pull/rate
paths were not edited. No clean-baseline run was performed, so these failures
are not claimed to have been baseline-confirmed.

Exact verification selectors:
`[data-testid="whole-bill-export-header"]`,
`[data-testid="whole-bill-export-footer"]`,
`[data-testid="button-export-whole-bill-excel-header"]`,
`[data-testid="button-export-whole-bill-pdf-header"]`,
`[data-testid="button-export-whole-bill-excel-footer"]`,
`[data-testid="button-export-whole-bill-pdf-footer"]`.
Historical footer: `[data-testid="historical-hire-save-card"]` contains
`[data-testid="whole-bill-export-footer"]`. New/edit header: parent of
`[data-testid="badge-status-draft"]` contains the header controls.

Authenticated browser screens, native save-dialog/files and business checksums
remain parent-owned. No authentication, DB/production access, backend/schema
change, publishing, workflow restart, full suite or build was performed.

The original implementation notes below are retained as reference for the
installed integration, not as outstanding page-wiring work.

## Ready components / pure exports

- `WholeBillExportButtons`: existing outline button style; renders `null` without
  `canExport`, or for `isFieldEngineer`. No status gating. Supply `getSnapshot`
  from the current render. It clones only on click, calls the save picker during
  user activation, and never saves/refetches/mutates bill state.
- `wholeBillSnapshot`: typed, detached export model. All money is passed in.
- `wholeBillScreenProjection`: reuses `groupBillItemsByDate` from the screen.
  Pass category/labour scopes in displayed order, with supplied screen category
  subtotals. Export all rows within collapsed dates.
- `wholeBillExport`: browser XLSX/PDF builders, picker cancellation/fallback.
  Single-type workbook has exactly Summary + named type, including incidental
  categories; combined has Summary + populated categories only.
- `useWholeBillCalendarSnapshots`: ref-only calendar registry. No query hooks.
- `DraftEquipmentHireCalendar` adds optional `onExportSnapshot(calendar)` only.
  It supplies the existing live, decision-annotated rows and availability reason.
  Existing query and hire-section export behavior are unchanged.
- `HireActivityBreakdownCalendar` adds exported
  `hireActivityBreakdownSheetRows(props)` using its existing display helpers.
  Its JSX and financial behavior are unchanged.

## Page insertion points

Import `WholeBillExportButtons`, snapshot types, projection helper and calendar
registry hook. Use the **existing** `canExport` boolean and
`isFieldEngineer={user?.isFieldEngineer}` on every occurrence.

Add header controls inside BILL DETAILS CardHeader beside `badge-status-draft`
(around 2503), not merely in the title row.
Add footer controls beside `button-cancel`/`button-save-bill` in **both**
ordinary adjustments card (~3957) and historical hire save card (~3986).
Add detail header controls near existing action buttons (~4182), and a detail
footer after notes (~4640). Do not alter existing hire export or print controls,
and do not touch `PayablesPreviewPanel`.

Example control (not status-conditioned):

```tsx
<WholeBillExportButtons
  canExport={canExport}
  isFieldEngineer={user?.isFieldEngineer}
  position="header"
  getSnapshot={getCurrentFormSnapshot}
/>
```

The footer uses `position="footer"` and the same snapshot function.

### Form money source (ordinary itemized bills)

Pass existing `totalAmount`, `categorySubtotals`, `gstAmountEquipment`,
`gstAmountMaterial`, `gstAmountTransport`, `gstAmountLabour`,
`totalGstAmount`, `adjustmentAmount`, `adjustmentLabel`,
`additionalAdjustments`, `tdsAmount`, `tdsRate`, `netTotal`. TDS export row
is signed negative, exactly like the screen; preserve reasons. Emit GST
labels/rates on the same visible category basis as the adjustments JSX.
Do not derive totals in the exporter.

Pass current `billDate`, `billNo`, `vendorName`, `periodFrom`, `periodTo`,
selected site's displayed name, `billType`, `getBillTypeLabel(billType)`,
`companyName`, `notes`, and a generated timestamp captured on click.
`saved` is `editingBillId !== null`; status must be the edit record's actual
status, **not the hard-coded DRAFT badge**, and not inferred from a typed number.
Preserve edit record status while initializing the editor if it is not currently
retained. Unsaved status is automatically exported as Unsaved/UNSAVED.

Map real current `lineItems` without the untouched initial blank seed. Copy
`amount`, `qty`, `rate`, description, site, vehicle, receipt, suppliedTo,
transporter, leadDistance. Copy displayed secondary details into `details`.
The page uses rate zero for a blank input; map it to `null` unless an explicitly
priced zero can be distinguished. Do not call `calcAmount` from an export.
For date/category/labour order, supply the same scopes from the render branches
to `projectWholeBillScreenSections`; retain populated zero-subtotal categories.

### Saved detail / historical hire

Pass financial values from the existing detail financial path, which is
different from form GST in historical single-type bills. Existing
`getBillFinancialTotals(bill)` reflects this ordinary detail path; use it once
as the same screen path rather than creating a second algorithm. For historical
hire use the displayed frozen financial output, not generic itemized totals.
The current detail helper `buildSavedEquipmentHireBillOutput` reads only the
first hire statement; if multiple statements are displayed, project each
displayed statement separately without fetching/refreezing it.

Attach `onExportSnapshot={calendar => rememberCalendar(group.id, calendar)}`
to existing rendered DraftEquipmentHireCalendar instances. Read only current
included group keys when constructing the snapshot. Pass existing
`buildBillingDailyRows` rows directly for the historical form path.
Saved views use already frozen rows; no report query may be added for export.
For monthly activity/breakdown use `hireActivityBreakdownSheetRows` with the
identical props passed to the rendered calendar; store as `calendar.breakdown`.
Never call `exportEquipmentHireBill` for whole-bill output, since that initiates
a separate file download. The whole-bill builder reuses
`equipmentHireActivitySheetRows` inside Equipment instead.

## Concrete source ambiguities to settle without changing money

1. Form and date-group totals currently sum **all item.amount**, regardless
   of rate; saved `bill.totalAmount` is authoritative. A rate-zero/null saved
   row with nonzero amount cannot both retain screen totals (A3) and be excluded
   (A7). The exporter marks the row Rate not set and reports that screen totals
   are retained, rather than claiming false exclusion or changing money.
2. `labourFilter` can hide site/plant rows while the form category subtotal,
   total/GST/TDS/net still include them. “Whole bill” versus “exactly on screen”
   is ambiguous for an active labour filter. Do not silently recompute totals.
   Parent should state which row scope was selected during authenticated checks.
3. `DraftEquipmentHireCalendarProps` currently omits `meterType` although the
   existing component destructures it. This predates this change; no unrelated
   props cleanup was made.

## Focused tests and verification selectors

Run only:

```
npx vitest run client/src/components/vendor-bills/wholeBillExport.test.ts \
  client/src/components/vendor-bills/WholeBillExportButtons.test.tsx \
  client/src/components/vendor-bills/wholeBillScreenProjection.test.ts \
  client/src/components/vendor-bills/wholeBillCalendarEvidence.test.tsx \
  tests/vendorBillVb21ActivityCalendar.test.tsx
```

Result: **48 passed across 5 focused test files** (41 new tests + 7 existing
activity-calendar regressions). Focused TypeScript source diagnostics report
only the existing missing `meterType` prop documented above.

Controls:
`whole-bill-export-header`, `whole-bill-export-footer`,
`button-export-whole-bill-excel-header`, `button-export-whole-bill-pdf-header`,
`button-export-whole-bill-excel-footer`, `button-export-whole-bill-pdf-footer`.
Permission failures have **no controls in the DOM**.

Parent owns authenticated A1–A6 screenshots, native save-dialog evidence, actual
exports from that bill, and before/after business counts/checksums. No full suite,
build, workflow, DB record, backend change or publishing was performed here.