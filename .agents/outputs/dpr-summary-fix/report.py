from pathlib import Path
import base64,html,json,re
p=Path(".agents/outputs/dpr-summary-fix")
e=json.loads((p/"browser-evidence.json").read_text())
log=Path("/tmp/dpr-summary-full.log").read_text()
counts="\n".join(x for x in log.splitlines() if re.match(r"^\s+(Test Files|Tests |Errors |Duration )",x))
body="""<h1>DPR summary tiles — correction report</h1>
<p><strong>Implemented in place. Not published.</strong> Summary strip and shared text updated. Existing purchase amounts are omitted to enforce the explicit no-money rule; all physical facts, tables and other sections remain unchanged.</p>
<h2>Changes</h2><ul>
<li>Work done lists the first three activities in DPR order with their original quantity/unit, then +n more. No Site Work is excluded; incidental work is marked.</li>
<li>Bulk received lists the first three native material/unit groups with quantity and actual trip-source counts, then +n more. Single-material summaries also include trips. DPR and equipment receipts retain their quantities but are not counted as transporter trips.</li>
<li>WhatsApp text includes every activity and material group without screen truncation.</li>
<li>Desktop tiles stay one row and top-aligned; phone text wraps without horizontal overflow. Added list text is dark slate at 12.5px; large numbers remain 19px.</li>
<li>No rates, amounts or financial values added; no quantities summed across unlike items/units.</li></ul>
<h2>Files changed</h2><ul>
<li>client/src/pages/SiteReport.tsx — summary rendering only.</li>
<li>client/src/lib/dprManagementPresentation.ts — display-list helpers and complete share text; saved structure conversion override preserved.</li>
<li>client/src/components/dprManagement.css — summary-only layout and list typography.</li>
<li>client/src/components/DprMaterialsReceived.tsx — omit the management purchase amount only; retain description, vendor, quantity and unit.</li>
<li>client/src/__tests__/dprManagement.test.tsx — 20 added cases. Existing share expectations now include actual trip-source counts (unspecified source does not imply a trip). Mixed-source regression checks table/summary parity.</li>
<li>tests/dpr20B4MaterialsClarity.test.tsx — purchase assertion updated to retain physical details while forbidding monetary output.</li></ul>
<p>Supporting verification scripts, screenshots, this report and a durable project-memory note were also saved.</p>
<h2>Verification</h2><p>Real signed-in development app using an isolated test admin/device and new persisted reports; no report API interception. All requested A–H checks passed again after correction. Existing records were not edited. Temporary records were removed; test sessions/device revoked and account disabled. Fingerprints confirmed existing rows unchanged in ten business tables.</p>
<p>Additional signed-in check: one 12 MT WMM trip + 8 MT DPR receipt shows 20 MT and 1 trip; equipment-delivered water shows 4,000 liters and 0 transporter trips. An amount-bearing purchase shows Safety gloves / Development vendor / 6 Pairs but no monetary amount in screen or print view.</p>
<p>New unit/rendered cases cover one/three/five activities, all/partial No Site Work, incidental inclusion, first-three screen limits versus untruncated sharing, one/two/five materials, native material/unit/source grouping, responsive CSS, actual Share-button payload and saved structure conversion factors.</p>
<p>Focused management file: <strong>52/52 passed</strong>, compared with 32 previously. Affected management/materials test set: <strong>114/114 passed</strong> across four files.</p>
<h3>Full expanded suite</h3><pre>"""
body+=html.escape(counts)+"</pre><p>Previous recorded expanded run: 4,194 passed / 50 failed / 3 skipped, with 10 unhandled errors. That run preceded the final structure-override tests and correction of an obsolete hours display assertion. This report uses the same expanded inclusion configuration. Existing failures outside this small display change were not repaired or hidden.</p>"
body+="<h2>H — Actual captured WhatsApp / clipboard text for B/E</h2><pre>"+html.escape(e["shareBE"]["text"])+"</pre>"
body+="<p>The real Share button was used. Only the external WhatsApp/clipboard transport was intercepted to capture output without messaging anyone.</p>"
body+="<h3>Five-item case: complete, untruncated shared text</h3><pre>"+html.escape(e["shareC"]["text"])+"</pre>"
images=[
("A/F — One activity and one material with five trips","A-F-single-desktop.png"),
("B/E — Three activities in mixed units and two received materials","B-E-three-activities-two-materials-desktop.png"),
("C — Five activities and five materials; first three plus +2 more","C-five-activities-five-materials.png"),
("D — No Site Work excluded from the count/list","D-no-site-work-excluded.png"),
("D — All activities marked No Site Work","D-all-no-site-work.png"),
("G — Phone view for B/E (390px)","G-phone-three-activities-two-materials.png"),
("H — Share confirmation in the real app","H-share-confirmation.png"),
("Mixed receipt sources — quantities preserved, only real trips counted, no purchase money","mixed-sources-no-money.png"),
("Print view — purchase physical facts retained without monetary amount","mixed-sources-no-money-print.png"),
("Full page — unchanged tables below the summary","B-E-full-page.png"),
]
for title,file in images:
    body+=f'<section><h2>{html.escape(title)}</h2><img src="data:image/png;base64,{base64.b64encode((p/file).read_bytes()).decode()}" alt="{html.escape(title)}"></section>'
body+="<h2>Anything not done</h2><p>No requested display behavior was deferred. No production changes, publishing or additional features were started. The broader suite is still non-green as recorded above.</p>"
(p/"verification-report.html").write_text("<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>DPR summary fix</title><style>body{font:16px/1.6 system-ui;max-width:1100px;margin:32px auto;padding:0 24px;color:#243447}h1,h2{line-height:1.2}h2{margin-top:36px}pre{white-space:pre-wrap;background:#eff4f8;padding:18px}img{max-width:100%;height:auto;border:1px solid #ddd}li{margin:7px 0}section{margin-top:40px}</style>"+body+"</html>")
print(counts)