# PLANT-02 — Truck party confirmation

## What changed

- The truck form now shows the selected Party/job in large bold text, with the mix, bitumen tank, and DispatchPro alert-link status directly below it. A Change link opens the party and mix selectors.
- When adding a truck, choosing a party different from the latest truck for the selected day and plant opens the requested confirmation. Go back restores the previous party and mix; confirming keeps the chosen party.
- The saved party remains the default for the next truck. The same party does not trigger another confirmation.
- Party choices show either “Alerts to site: on” or “Not linked — no site alert”.
- Stock calculations, dispatch APIs, schema, and operational data are unchanged. The screenshots use synthetic UI fixtures only; no truck was saved and no real data was changed.

## Phone-width screenshots

- Truck form with the party and alert status visible: [PLANT-02-truck-form-mobile.jpg](PLANT-02-truck-form-mobile.jpg)
- Different-party confirmation: [PLANT-02-party-confirm-mobile.jpg](PLANT-02-party-confirm-mobile.jpg)

## Verification

- PLANT-01 dispatch tests plus new party tests: 5 passed, including first-truck/no-confirm, different-party/Go back, same-party/no-repeat, alert-link labels, and next-truck default.
- Full suite: 484 test files passed, 2 skipped; 5,892 tests passed, 3 skipped; 0 failures.
- `npm run build`: passed.
- Restarted the development app; startup readiness reported `ready: true`.
