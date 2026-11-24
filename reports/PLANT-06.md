# PLANT-06 — Norm vs actual

## What changed

- Added the **Norm vs actual (savings)** permission. Owners can view and export it; everyone else starts without access unless an Owner explicitly grants it.
- Added the daily comparison to the plant shift log and daily report, plus a date-range report with Excel and black-and-white PDF exports.
- Norms come from saved dispatch values: bitumen uses the dispatch's saved theoretical amount (or its saved percentage / mix percentage with the truck weight); LDO uses the saved amount or 6 L per MT.
- Actual bitumen is calculated from shared-tank dips, receipts and closing dips. LDO uses the same plant-day accounting as the shift log.
- Shared tank actuals and savings appear only in the HLC total. Party and order rows show their norms and explicitly say shared actuals are not allocated.
- The bitumen tracker now sends the shared physical-versus-book difference to HLC only. It leaves every other party's dispatch-based balance unchanged; the server rejects bitumen corrections assigned to another party.
- The LDO tracker labels its existing meter-based table as **Meter readings**. Its historical variance cards are permission-gated.
- No database migration or data change. Dispatch deductions, party stock rules, ledgers, existing records, party statement routes and DispatchPro payloads were not changed. No production data was accessed.

## Secrecy check

- Plant Supply Orders and order alerts: no norm-vs-actual fields were added.
- Party-specific dispatch screen, party statement, Excel, PDF and print: no dip actual, savings, excess or comparison fields were added. Existing dispatch quantities remain unchanged.
- Party supply-obligation statement API: unchanged.
- DispatchPro: outgoing payload remains dispatch identity, site, truck/load and driver/mix details; it receives no dip actual or savings.
- Existing shared-tank reconciliation and LDO variance panels are hidden without the new permission. The new report's actuals and variance are available only through its permission-checked screen and export routes.

## Verification

- Focused tests: **9 files, 65 tests passed**, covering one-day and three-day calculations, incomplete readings, permission gating, shared actual attribution, HLC-only correction math, dispatch/party flows and plant accounting.
- Production build: **passed**.
- Full test suite: **502 files passed, 2 skipped; 6,004 tests passed, 3 skipped; 0 failures**. The first five-minute invocation timed out; the full run then completed without a timeout.
- Development app restart: startup readiness **ready**, 2,440 columns checked, app serving on port 5000.
- `npm run check` still exits with **500 TypeScript diagnostics across 66 files**. The new report/service/helper/test files have no remaining diagnostics; the remaining diagnostics in touched pages are in unchanged sections. The production build passes.
