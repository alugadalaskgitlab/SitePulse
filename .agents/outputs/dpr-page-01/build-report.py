from pathlib import Path
import base64, html, json, re
root=Path(".agents/outputs/dpr-page-01")
files=[
("A — Main report, desktop","A-main-desktop.png"),
("A — Main report, phone (390px; no horizontal overflow)","A-main-phone.png"),
("B–H — Edge cases, desktop","B-H-edge-desktop.png"),
("B–H — Edge cases, phone (390px; no horizontal overflow)","B-H-edge-phone.png"),
("G — Trip list dialog (real received trips)","G-trip-dialog.png"),
("I — Send onward dialog (existing test IDs)","I-send-onward-dialog.png"),
("I — Completed move, real persisted successor","I-send-onward-success.png"),
("J — Print preview","J-print-preview.png"),
("J — Actual one-page A4 PDF, rendered","J-pdf-render.png"),
("K — Sharing / clipboard confirmation","K-share-copy-confirmation.png"),
]
tests=[
("client/src/__tests__/uxFix01Frontend.test.tsx","Update only the SiteReport source assertion for one-decimal hours presentation; preserve all entry/save and fractional stored-value assertions."),
("client/src/__tests__/dprManagement.test.tsx (new)","Management layout, conditional quantities, programme progress, deviation boundaries, vehicle units, stopped/incomplete rows, totals, labour, materials, remarks, sharing, and scoped print rules."),
("client/src/__tests__/dprEquipmentReadOnly.test.tsx","Lifecycle dialog source-index assertions; unchanged runtime IDs. Added opt-in management and default audit protection."),
("tests/dpr18B3ReadOnlyPages.test.tsx","Replace obsolete SiteReport audit/expansion expectations with five-column management layout; retain DprDetails audit coverage."),
("tests/dpr16B3ActivityRendered.test.tsx","SiteReport management presentation and photo omission contract; retain DprDetails/default audit checks."),
("tests/dpr20B1EquipmentTableDetails.test.tsx","Replace removed embedded print-CSS/CardTitle assumptions with compact layout and report-scoped print rules; retain editor and lifecycle endpoint/gating checks."),
("tests/dpr20B2EquipmentEfficiency.test.tsx","Replace obsolete embedded audit-print assertion only; retain permission-aware efficiency checks."),
("tests/dpr20B4MaterialsClarity.test.tsx","Update SiteReport received/issues/purchases layout and wording; retain DprDetails, hub, readiness and editor checks."),
]
implementation=[
"client/src/pages/SiteReport.tsx",
"client/src/components/DprActivityReadOnly.tsx",
"client/src/components/DprEquipmentReadOnlyRow.tsx",
"client/src/components/DprMaterialsReceived.tsx",
"client/src/components/ProgrammeBarOutcomeHistory.tsx",
"client/src/components/dprManagement.css (new)",
"client/src/lib/dprManagementPresentation.ts (new)",
"client/src/hooks/use-dpr-material-receipts.ts (new)",
"client/src/__tests__/dprManagement.config.ts (new focused test configuration)",
]
log=Path("/tmp/dpr-page-expanded.log").read_text()
summary="\n".join(line for line in log.splitlines() if re.match(r"^\s+(Test Files|Tests |Errors |Duration )",line))
share=json.loads((root/"K-share-output.json").read_text())["text"]
cleanup=json.loads((root/"cleanup.json").read_text())
body="""<h1>DPR-PAGE-01 — implementation and verification</h1>
<p><strong>Revised in place. Not published.</strong> The management-page design replaces the unpublished Site Report audit layout.</p>
<h2>What changed</h2><p>Compact header and summary strip; one activity quantity with conditional BOQ note; real programme progress and overdue indication; five-column equipment table; precise deviation marks and the prescribed legend; labour beside materials; trip dialog; remarks; native/WhatsApp/copy sharing; phone cards; one-page A4 output for the representative day.</p>
<p>Removed Site Report row audit expanders, long technical legend, repeated quantity grids, three-decimal presentation and meter/clock warnings. Kept the shared consumption helper, permission-aware data sources, historical figures, and Send onward gating/endpoint/test IDs. Other audit consumers remain intact.</p>
<h2>Scope and evidence</h2><p>No backend, schema, entry/edit, readiness, billing, Equipment Performance, or calculation changes. Evidence came from the real authenticated development app using a temporary approved test device and isolated new persisted records, not intercepted API fixtures. DPR 409 is absent in development, so DPR 262 reproduced its three-machine day; DPR 263 covered edge cases. No production writes or publishing were performed.</p>
<p>The actual PDF was rendered and visually checked: one A4 page, header and final remarks visible, legend once, no action controls. Global header hiding, shell height/overflow, and the development banner required report-scoped print overrides. Larger reports may naturally span pages.</p>
<p>Sharing verification exercised the real button and captured the WhatsApp URL and clipboard fallback; external sending was deliberately intercepted to avoid contacting anyone. Native sharing is covered by automated tests, not an OS share-sheet screenshot.</p>
<h2>Files changed</h2><ul>"""
body+="".join("<li><code>"+html.escape(f)+"</code></li>" for f in implementation)+"</ul>"
body+="<h2>Tests and comparison</h2><p>Management-focused: <strong>54/54 passed</strong>. Affected existing selection: <strong>121/121 passed</strong>; the final print follow-up reran its affected subset, <strong>99/99 passed</strong>.</p>"
body+="<p>Full expanded suite, using the same inclusion configuration as the previous report:</p><pre>"+html.escape(summary)+"</pre>"
body+="<p>Previous expanded run: 4,164 passed / 49 failed / 3 skipped, 304 files, 10 unhandled errors. This full run had one additional failure: an obsolete UX-FIX-01 assertion expected unformatted hours in SiteReport. It was then updated to the required one-decimal presentation and its entire file rerun successfully (12/12). The other 49 failures are in the same 18 failing files as the baseline; they were not changed to force a pass. The full suite was not rerun after this assertion-only correction. The ordinary npm test run was also performed: 4,128 passed / 39 failed / 14 skipped across 302 files, with one collection hook timeout. These counts are not interchangeable with the expanded configuration.</p>"
body+="<h3>Every updated test file and why</h3><ul>"+"".join("<li><code>"+html.escape(f)+"</code>: "+html.escape(reason)+"</li>" for f,reason in tests)+"</ul>"
body+="<h2>Development cleanup</h2><p>Removed the isolated records and generated successor; disabled the test admin, revoked its devices and sessions, removed credentials/browser profile. Startup backfills had posted four test Diesel ledger entries; removed only those references and transactionally restored their 52 L net effect. Fingerprints confirmed all pre-existing rows unchanged in the 12 tracked business tables.</p>"
body+="<h2>WhatsApp / clipboard text</h2><pre>"+html.escape(share)+"</pre>"
body+="<h2>Signed-in screenshots A–K</h2><p>Phone images are full-height; open or zoom the image to inspect individual cards.</p>"
for title,file in files:
    data=base64.b64encode((root/file).read_bytes()).decode()
    body+=f'<section><h3>{html.escape(title)}</h3><img src="data:image/png;base64,{data}" alt="{html.escape(title)}"></section>'
body+="<h2>Limitations / differences</h2><p>No requested feature was deferred. Test site names, IDs and dates differ because existing business reports were not edited. Written instructions took priority over mockup inconsistencies: no meter-versus-clock warning and no within-10% mark. Full-suite failures remain as reported above.</p>"
(root/"verification-report.html").write_text("<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>DPR-PAGE-01 verification</title><style>body{font:16px/1.6 system-ui;margin:32px auto;max-width:1150px;padding:0 24px;color:#152333}h1,h2,h3{line-height:1.2}h2{margin-top:36px}pre{white-space:pre-wrap;background:#eef3f8;padding:18px}code{font-size:13px}img{max-width:100%;height:auto;border:1px solid #ccd5df}section{margin:36px 0}li{margin:8px 0}</style>"+body+"</html>")
print(summary)