# VB-28 isolated browser checks

This fixture mounts the production VendorBills component with synthetic API
responses. All API traffic is intercepted; bill saving is blocked.
Native confirmation is intercepted to record the actual prompt and simulate
Cancel/Confirm. It is UI evidence, not live database or native-dialog evidence.

Run from the project root in separate terminals:

```sh
npx vite --config tests/fixtures/vb28/vite.config.ts --host 127.0.0.1 --port 4210 --strictPort
/repl/tools/bin/chromium --headless=new --no-sandbox --disable-gpu --remote-debugging-port=9360 --user-data-dir=/tmp/vb28-browser http://127.0.0.1:4210
node tests/fixtures/vb28/verify.mjs
```

Stop the two temporary processes when finished.
Results and eight desktop/mobile screenshots are in `screenshots/vb28/`.
Mobile screenshots show the trailing edge of the existing horizontally scrolling
table; this change does not redesign its mobile layout.

```sh
npx vitest run tests/vendorBillDateGroups.test.tsx tests/vendorBillGroupRemovalGuard.test.ts
```

Hire safeguards are tested directly against the production closure because
generated hire rows are excluded from the ordinary editable table.