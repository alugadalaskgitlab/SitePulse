import fs from "node:fs";
import assert from "node:assert/strict";
const root="reports/perm-03b3/notify-rerun";
const read=p=>JSON.parse(fs.readFileSync(`${root}/${p}.json`,"utf8"));
const proof=read("restoration-proof");
assert.equal(proof.byteIdentical,true);
assert.equal(proof.gitDiff,"");
assert.equal(proof.ownerSubscriptionsByteIdentical,true);
assert.deepEqual(proof.ownerSubscriptions,[{id:4,userId:2},{id:5,userId:2}]);
for(const run of ["live","live-final"]){
 const before=read(`${run}/before`),after=read(`${run}/after`);
 assert.deepEqual(after,before);
 assert(Object.values(read(`${run}/cleanup`).remaining).every(n=>n===0));
}
const off=read("live-final/outcome-off"),on=read("live-final/outcome-on");
const event=read("live-final/event"),eligibility=read("live-final/eligibility");
assert.equal(event.status,200);
assert.equal(event.attempts,1);
assert.equal(off.notify,false);
assert.equal(on.notify,true);
assert.equal(off.after.length,0);
const escape=s=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;");
const detail=(title,x)=>`<details><summary>${escape(title)}</summary><pre>${escape(JSON.stringify(x,null,2))}</pre></details>`;
const image=(file,label)=>`<details><summary>${escape(label)}</summary><img alt="${escape(label)}" src="data:image/jpeg;base64,${fs.readFileSync(`${root}/live-final/${file}.jpg`).toString("base64")}"></details>`;
const html=`<!doctype html><html><head><meta charset="utf-8"><title>PERM-03B-3 Notify rerun</title><style>body{font:16px/1.5 system-ui;max-width:1000px;margin:32px auto;padding:24px;color:#172b3d}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:10px;text-align:left}pre{white-space:pre-wrap;background:#f3f5f7;padding:14px}details{margin:18px 0}img{width:100%}.warning{background:#fff1cc;padding:16px}</style></head><body>
<h1>PERM-03B-3 Part B — actual event fired; positive delivery failed</h1>
<p>One real site_dprs cancellation event, using the unchanged recipient selection and real web-push transport. Two temporary accounts tested both permission states simultaneously, limiting the owner's exposure to one event. No replay was attempted.</p>
<p class="warning">B3 is NOT passed. The enabled temporary account's real, newly registered browser subscription was rejected by the push provider as expired/invalid (404 or 410). This is not proof of successful notification delivery.</p>
<table><tr><th>Check</th><th>Observed outcome</th></tr>
<tr><td>B1 — actual event</td><td>POST ${escape(event.path)} returned 200; the temporary DPR was cancelled. One attempt.</td></tr>
<tr><td>B2 — Notify OFF</td><td>User ${off.userId}, subscription ${off.subscriptionId}: stored Notify=false, notifications enabled, real browser subscription present. Excluded by the sender's actual recipient predicate. No send selected; browser notification store was empty before and after a 60-second observation.</td></tr>
<tr><td>B3 — Notify ON</td><td>User ${on.userId}, subscription ${on.subscriptionId}: eligible and selected. Existing sender logged a stale-subscription provider response (404/410); exact endpoint-prefix correlation identifies subscription 9. Browser notification store remained empty. Delivery FAILED.</td></tr>
<tr><td>B4 — real users</td><td>Only authorised user 2 was eligible among real users, with subscriptions 4 and 5. No other real user was selected. Subscription 4 received a stale/invalid-provider response. Subscription 5 has no error recorded, but the existing sender does not log successful responses and its device was not observed; receipt is not certified.</td></tr></table>
<h2>Temporary protection restored</h2>
<p>The only temporary sender change replaced its three automatic stale-subscription delete calls with comments. No transport stubs, alternate audiences, skipped sends, or new permission guards were introduced. The original log wording “Removing stale subscription” remained, but deletion was disabled: those messages indicate provider errors, not actual row removals.</p>
<p>The sender was restored immediately after the check and the application restarted. Its SHA-256 is identical before/after and git diff is empty. Owner subscriptions 4 and 5 still belong to user 2, and their complete-row checksum is unchanged. No owner re-subscription was attempted.</p>
${detail("Byte-for-byte restoration and expiry findings",proof)}
${detail("Sanitised actual sender log",read("push-workflow-log"))}
<h2>Real browser and permission evidence</h2>
<p>Native Chromium PushManager registrations used the application's public VAPID key and its actual service worker. Subscription URLs/keys, passwords and session cookies are not included. getNotifications() reads the browser's real notification store, not a mocked application component. Screenshots below show the signed-in temporary accounts; they are NOT screenshots of received notification popups.</p>
${detail("Stored recipient eligibility",eligibility)}
${detail("Actual cancellation response",event)}
${detail("Notify OFF: browser observation",off)}
${detail("Notify ON: browser observation",on)}
${image("account-off","Signed-in Notify-OFF temporary account")}
${image("account-on","Signed-in Notify-ON temporary account")}
<h2>Cleanup and integrity</h2>
<p>The first setup stopped before any event because its fixture used an incorrect draft-column name; that setup's accounts and subscriptions were cleaned up. The corrected setup fired exactly one cancellation. Both cleanup ledgers are retained. All four temporary users, their permissions/devices/sessions/site grants/subscriptions/audit rows and the one DPR are gone; every remaining-row count is zero. Browser subscriptions were unsubscribed. Real users and permissions stayed byte-identical: 6 users and 366 permission rows.</p>
${detail("First setup: error before event",read("live/error"))}
${detail("First setup cleanup",read("live/cleanup"))}
${detail("Actual-event cleanup",read("live-final/cleanup"))}
${detail("Before actual-event setup",read("live-final/before"))}
${detail("After cleanup",read("live-final/after"))}
<p>Initial browser preflight hit the separate mockup service through the shared development proxy. Browser-only loopback then reached the actual app without changing port configuration. Native registration succeeded, but registration alone did not establish delivery: the later real send failed for the enabled temporary endpoint.</p>
<p>No persistent application source change, owner-data change, production operation, publishing, new feature or follow-up task. Part A and the full suite were not rerun for this Part-B-only request. The remaining issue is the failed positive delivery outcome, not a permission bypass.</p>
</body></html>`;
fs.writeFileSync(`${root}/status-report.html`,html);
console.log("Evidence generated; integrity checks passed; positive Notify delivery FAILED.");
