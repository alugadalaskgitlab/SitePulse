# PLANT-04 — LDO consumption and production-day attribution

## Changes

- Plant-log Tank 1 and Tank 2 opening and closing dips are visible in the normal opening/closing sections, with litres from the existing dip charts. The openings still prefill from the previous closing readings. The boiler meter readings and “Boiler runs during production” switch are in More details, as selected.
- Heating sessions calculate litres from both tank dip pairs, use Tank 1 alone when only Tank 1 has a complete pair, and use the meter only when neither tank has a complete pair. The calculated value remains in the existing `ldoTank1Consumed` field.
- Sessions are attributed to the first production day whose start follows their end; sessions that overlap production hours count for that same day. Sessions on idle days roll to the next production day. Sessions without a later production day display “Waiting for next production day”; attributed sessions show “Counts for”.
- The shift log, Daily Plant Report screen and PDF use the same LDO calculation and ordered summary. The summary includes pre-heat, boiler during production, dryer, per-MT values, total LDO and plant stops. A negative boiler result is floored at zero and shows the dip/meter warning. The opening-gap check compares both tanks and does not change reported consumption.
- Boiler-meter readings are used automatically when available; otherwise the dip calculation is used. The Fuel settings choice was removed; its existing database field is retained and ignored.
- Tank labels now use “Tank 1 (small vertical)” and “Tank 2 (big horizontal)”; stored `TANK_1` / `TANK_2` values are unchanged.

## Worked example

The shared app calculation for the specified 22–23 Nov example returns:

| Figure | Calculated value | Display |
| --- | ---: | ---: |
| Pre-heat, 8 hours | 165.6127 L | 165.6 L |
| Pre-heat rate | 20.7016 L/h | 20.7 L/h |
| Boiler during production, 10 hours | 212.4508 L | 212.5 L |
| Boiler during-production rate | 21.2451 L/h | 21.2 L/h |
| Boiler including pre-heat | 1.8903 L/MT | 1.89 L/MT |
| Dryer | 450 L | 450 L |
| Dryer rate | 2.25 L/MT | 2.25 L/MT |
| Total LDO | 828.0635 L | 828.1 L |
| Total rate | 4.1403 L/MT | 4.14 L/MT |

The overnight session is attributed to 23 Nov, not 22 Nov.

## Data and schema

- No migration or schema change.
- No saved shift logs, heating sessions, dispatches, receipts, readings or stock-ledger entries were changed. No data script or ledger rebuild was run.
- Production and its replica were not accessed. No publish was performed.

## Verification

- Focused PLANT-04 / related plant tests: **6 files passed; 31 tests passed**.
- Full test suite: **492 files passed, 2 skipped; 5,943 tests passed, 3 skipped; 0 failures**.
- `npm run build`: passed.
- Development app restarted successfully. Startup readiness reported `ready: true` and checked 2,288 columns.

## Screenshots

Phone-width captures were attempted for the shift-log summary and heating-sessions list. The capture browser received HTTP 401 on both routes and showed the unauthenticated app shell, so it could not verify or provide screenshots of the signed-in screens. No authentication bypass was used. The relevant layouts and calculations are covered by the passing component and accounting tests.
