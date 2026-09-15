/*
 * DIESEL-03 browser evidence for the mounted production DieselRequirements
 * component.  Every API response is owned by main.tsx and every mutation is
 * kept in memory; this verifier never opens a production API or database.
 *
 * Start the fixture on 4181 and a separate Chromium CDP endpoint on 9223,
 * then run:
 *   node tests/fixtures/diesel03/verify-diesel03.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const targets = await (await fetch("http://127.0.0.1:9223/json/list")).json();
let page = targets.find((target) => target.type === "page");
if (!page) {
  page = await (await fetch("http://127.0.0.1:9223/json/new?about:blank", { method: "PUT" })).json();
}
if (!page) throw new Error("Chromium did not expose a page target on CDP port 9223");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});

let sequence = 0;
const pending = new Map();
socket.on("message", (raw) => {
  const message = JSON.parse(raw);
  if (message.method === "Runtime.exceptionThrown") {
    const details = message.params.exceptionDetails;
    console.error(`Browser exception: ${details.text}${details.exception?.description ? `\n${details.exception.description}` : ""}`);
  }
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  message.error ? reject(new Error(message.error.message)) : resolve(message.result);
});

const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, {
    resolve,
    reject: (error) => reject(new Error(`${method}: ${error.message}`)),
  });
  socket.send(JSON.stringify({ id, method, params }));
});

const evaluate = async (expression) => {
  let result;
  try {
    result = await cdp("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
  } catch (error) {
    throw new Error(`Runtime.evaluate failed for ${expression.slice(0, 220)}: ${error.message}`);
  }
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
};

const quote = (value) => JSON.stringify(value);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const waitFor = async (expression, label, attempts = 200) => {
  for (let index = 0; index < attempts; index += 1) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  const body = await evaluate("document.body?.innerText?.slice(0, 1200) || ''");
  throw new Error(`Timed out waiting for ${label}; body=${JSON.stringify(body)}`);
};

const fixtureState = async () => {
  const serialized = await evaluate("JSON.stringify(window.__DIESEL03Fixture || null)");
  return serialized ? JSON.parse(serialized) : null;
};

const clickTestId = async (testId) => {
  const clicked = await evaluate(`(() => {
    const element = document.querySelector('[data-testid=${quote(testId)}]');
    if (!element || element.disabled) return false;
    element.click();
    return true;
  })()`);
  assert(clicked, `Could not click enabled [data-testid=${testId}]`);
};

const setInput = async (testId, value) => {
  const changed = await evaluate(`(() => {
    const element = document.querySelector('[data-testid=${quote(testId)}]');
    if (!element) return false;
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(element, ${quote(String(value))});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  })()`);
  assert(changed, `Could not set [data-testid=${testId}]`);
};

const clickOptionContaining = async (text, label) => {
  const clicked = await evaluate(`(() => {
    const wanted = ${quote(text.toUpperCase())};
    const option = Array.from(document.querySelectorAll('[role="option"]'))
      .find(candidate => (candidate.textContent || "").toUpperCase().includes(wanted));
    if (!option) return false;
    option.click();
    return true;
  })()`);
  assert(clicked, `Could not select ${label} option containing ${text}`);
};

const selectOption = async (triggerTestId, optionText, label) => {
  await clickTestId(triggerTestId);
  await waitFor(
    `Array.from(document.querySelectorAll('[role="option"]')).some(option => (option.textContent || "").toUpperCase().includes(${quote(optionText.toUpperCase())}))`,
    `${label} options`,
  );
  await clickOptionContaining(optionText, label);
};

const accountControlPresent = () => evaluate(`(() => {
  const explicit = [
    "select-markpaid-account",
    "select-markpaid-payment-account",
    "select-markpaid-bank-account",
  ].some(id => !!document.querySelector('[data-testid="' + id + '"]'));
  if (explicit) return true;
  return Array.from(document.querySelectorAll("label"))
    .some(label => (label.textContent || "").toUpperCase().includes("BANK / ACCOUNT"));
})()`);

const clickAccountControl = async () => {
  const clicked = await evaluate(`(() => {
    const explicit = [
      "select-markpaid-account",
      "select-markpaid-payment-account",
      "select-markpaid-bank-account",
    ];
    for (const id of explicit) {
      const element = document.querySelector('[data-testid="' + id + '"]');
      if (element && !element.disabled) {
        element.click();
        return true;
      }
    }
    const label = Array.from(document.querySelectorAll("label"))
      .find(candidate => (candidate.textContent || "").toUpperCase().includes("BANK / ACCOUNT"));
    if (!label) return false;
    let current = label;
    for (let depth = 0; depth < 4 && current; depth += 1, current = current.parentElement) {
      const button = current.querySelector("button");
      if (button && !button.disabled) {
        button.click();
        return true;
      }
    }
    return false;
  })()`);
  assert(clicked, "Could not click the Bank / Account Select");
};

const navigate = async (scenario) => {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Page.navigate", {
    url: `http://127.0.0.1:4181/plant/diesel-requirements?scenario=${encodeURIComponent(scenario)}`,
  });
  await waitFor("document.readyState === 'complete'", "fixture document");
  await waitFor("!!document.querySelector('[data-testid=\"text-page-title\"]')", "Diesel Requirements list");
  await waitFor("document.querySelectorAll('[data-testid^=\"card-requirement-\"]').length === 4", "four fixture rows");
};

const capture = async (name) => {
  const result = await cdp("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(result.data, "base64"));
  return target;
};

const cardText = async (id) => evaluate(
  `document.querySelector('[data-testid="card-requirement-${id}"]')?.textContent?.replace(/\\s+/g, " ").trim() || ""`,
);

const cardHeight = async (id) => evaluate(
  `document.querySelector('[data-testid="card-requirement-${id}"]')?.getBoundingClientRect().height || 0`,
);

const badgeGeometry = async (id) => evaluate(`(() => {
  const card = document.querySelector('[data-testid="card-requirement-${id}"]');
  if (!card) return null;
  const cardBox = card.getBoundingClientRect();
  const rect = (selector) => {
    const element = card.querySelector(selector);
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
    };
  };
  return {
    card: {
      left: cardBox.left,
      right: cardBox.right,
      top: cardBox.top,
      bottom: cardBox.bottom,
      width: cardBox.width,
      height: cardBox.height,
    },
    status: rect('[data-testid="badge-status-purchased"]'),
    receipt: rect('[data-testid="badge-receipt-status"]'),
    paid: rect('[data-testid="badge-payment-status-${id}"]'),
  };
})()`);

const scrollToCard = async (id) => {
  await evaluate(`document.querySelector('[data-testid="card-requirement-${id}"]')?.scrollIntoView({ block: "center" })`);
  await sleep(100);
};

const returnToList = async (label) => {
  if (await evaluate("!!document.querySelector('[data-testid=\"button-back-detail\"]')")) {
    await clickTestId("button-back-detail");
  }
  await waitFor("!!document.querySelector('[data-testid=\"text-page-title\"]')", `${label} list`);
  await waitFor("document.querySelectorAll('[data-testid^=\"card-requirement-\"]').length === 4", `${label} rows`);
};

await navigate("diesel03");

// Capture the untouched purchased-row baseline before either fresh payment is
// recorded.  A, E, and the historical rows all use the same card geometry;
// the paid indicator must not change the existing status/receipt badges.
const aHeightBeforePaid = await cardHeight(101);
const eHeightBeforePaid = await cardHeight(104);
const aBadgesBeforePaid = await badgeGeometry(101);
const eBadgesBeforePaid = await badgeGeometry(104);
assert(aHeightBeforePaid === eHeightBeforePaid, `Unpaid purchased baseline differs: A=${aHeightBeforePaid}px E=${eHeightBeforePaid}px`);
assert(aBadgesBeforePaid?.status && aBadgesBeforePaid?.receipt, "A baseline status/receipt badges are missing");
assert(eBadgesBeforePaid?.status && eBadgesBeforePaid?.receipt, "E baseline status/receipt badges are missing");

// A — Company payer: accounts are fetched from the same Vendor Bills
// company-accounts endpoint, the account is required, and the PATCH retains it.
await clickTestId("card-requirement-101");
await waitFor("!!document.querySelector('[data-testid=\"button-mark-paid\"]')", "A Mark as Paid action");
await clickTestId("button-mark-paid");
await waitFor("!!document.querySelector('[data-testid=\"dialog-mark-paid\"]')", "A payment dialog");
await selectOption("select-markpaid-mode", "UPI", "A payment mode");
await waitFor("window.__DIESEL03Fixture?.accountsRequests >= 1", "A company account request");
await waitFor(`(() => {
  const explicit = ["select-markpaid-account", "select-markpaid-payment-account", "select-markpaid-bank-account"]
    .some(id => !!document.querySelector('[data-testid="' + id + '"]'));
  return explicit || Array.from(document.querySelectorAll("label"))
    .some(label => (label.textContent || "").toUpperCase().includes("BANK / ACCOUNT"));
})()`, "A account control");
assert(await accountControlPresent(), "A Bank / Account control is missing for company payer");
const aConfirmInitiallyDisabled = await evaluate(
  "document.querySelector('[data-testid=\"button-markpaid-confirm\"]')?.disabled === true",
);
assert(aConfirmInitiallyDisabled, "A Mark as Paid was enabled before a company account was selected");
await clickAccountControl();
await waitFor(
  "Array.from(document.querySelectorAll('[role=\"option\"]')).some(option => (option.textContent || '').includes('HDFC CURRENT'))",
  "A account options",
);
const screenshotA = await capture("diesel03-A-company-account");
await clickOptionContaining("HDFC CURRENT", "A bank/account");
await waitFor("document.querySelector('[data-testid=\"button-markpaid-confirm\"]')?.disabled === false", "A valid payment");
await clickTestId("button-markpaid-confirm");
await waitFor("window.__DIESEL03Fixture?.paymentPayloads.length === 1", "A payment PATCH");
const aState = await fixtureState();
const aPayload = aState.paymentPayloads[0]?.payload || {};
assert(aPayload.paymentStatus === "paid", `A PATCH did not set paid status: ${JSON.stringify(aPayload)}`);
assert(aPayload.paymentAccountKey === "hdfc-current-0012", `A PATCH lost the selected account: ${JSON.stringify(aPayload)}`);
assert(aState.persistedPaymentAccountKeys[0]?.value === "hdfc-current-0012", "A account value did not persist in fixture state");
await returnToList("A");

// B — Personal payer: the account control is hidden and the account is not
// sent/required.  The existing payer-name requirement remains in force.
await clickTestId("card-requirement-102");
await waitFor("!!document.querySelector('[data-testid=\"button-mark-paid\"]')", "B Mark as Paid action");
await clickTestId("button-mark-paid");
await waitFor("!!document.querySelector('[data-testid=\"dialog-mark-paid\"]')", "B payment dialog");
await selectOption("select-markpaid-mode", "CASH", "B payment mode");
await selectOption("select-markpaid-paidby", "PERSONAL", "B payer");
await waitFor("!document.querySelector('[data-testid=\"select-markpaid-account\"]')", "B account hidden");
assert(!(await accountControlPresent()), "B Bank / Account control remained visible for personal payer");
await setInput("input-markpaid-payer", "DIESEL03 PERSONAL");
const screenshotB = await capture("diesel03-B-personal-no-account");
await waitFor("document.querySelector('[data-testid=\"button-markpaid-confirm\"]')?.disabled === false", "B valid payment");
await clickTestId("button-markpaid-confirm");
await waitFor("window.__DIESEL03Fixture?.paymentPayloads.length === 2", "B payment PATCH");
const bState = await fixtureState();
const bPayload = bState.paymentPayloads[1]?.payload || {};
assert(bPayload.paymentStatus === "paid", `B PATCH did not set paid status: ${JSON.stringify(bPayload)}`);
assert(bPayload.paidBy === "DIESEL03 PERSONAL", `B personal payer was not retained: ${JSON.stringify(bPayload)}`);
assert(bPayload.paymentAccountKey == null, `B unexpectedly sent a company account: ${JSON.stringify(bPayload)}`);
await returnToList("B");

// C — The newly paid A row renders its PAID timestamp in the compact badge
// stack.  Compare its measured footprint with the still-unpaid E row.
await waitFor(
  `(() => {
    const text = document.querySelector('[data-testid="card-requirement-101"]')?.textContent || "";
    return /PAID/.test(text) && /2026|SEP|15/.test(text);
  })()`,
  "C new paid timestamp",
);
const cText = await cardText(101);
const cHeight = await cardHeight(101);
const cBadgesAfterPaid = await badgeGeometry(101);
assert(await evaluate("!!document.querySelector('[data-testid=\"badge-payment-status-101\"]')"), `C paid indicator is missing: ${cText}`);
assert(/2026|SEP|15/.test(cText), `C paid timestamp is missing: ${cText}`);
assert(cHeight === aHeightBeforePaid, `C paid row changed from its pre-payment height: ${aHeightBeforePaid}px -> ${cHeight}px`);
assert(cHeight === eHeightBeforePaid, `C paid row differs from the unpaid purchased peer: ${cHeight}px vs ${eHeightBeforePaid}px`);
assert(cBadgesAfterPaid?.status && cBadgesAfterPaid?.receipt && cBadgesAfterPaid?.paid, "C status, receipt, or paid badge geometry is missing");
for (const badgeName of ["status", "receipt"]) {
  const before = aBadgesBeforePaid[badgeName];
  const after = cBadgesAfterPaid[badgeName];
  assert(Math.abs(after.left - before.left) < 0.1 && Math.abs(after.top - before.top) < 0.1 &&
    Math.abs(after.width - before.width) < 0.1 && Math.abs(after.height - before.height) < 0.1,
  `C existing ${badgeName} badge moved/resized after payment: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
}
assert(cBadgesAfterPaid.paid.top >= cBadgesAfterPaid.receipt.bottom - 0.1, "C PAID badge overlaps the existing receipt badge");
assert(cBadgesAfterPaid.paid.bottom <= cBadgesAfterPaid.card.bottom + 0.1, "C PAID badge extends below the card bottom");
assert(cBadgesAfterPaid.paid.left >= cBadgesAfterPaid.card.left - 0.1 &&
  cBadgesAfterPaid.paid.right <= cBadgesAfterPaid.card.right + 0.1,
  `C PAID badge is clipped horizontally inside the desktop card: ${JSON.stringify(cBadgesAfterPaid)}`);
await scrollToCard(101);
const screenshotC = await capture("diesel03-C-new-paid-timestamp");

// D — The historical paid record still gets a timestamp even though it has no
// account key.  The absence of an account must not suppress the indicator.
const dText = await cardText(103);
assert(await evaluate("!!document.querySelector('[data-testid=\"badge-payment-status-103\"]')"), `D historical paid indicator is missing: ${dText}`);
assert(/2026|SEP|12/.test(dText), `D historical paid timestamp is missing: ${dText}`);
assert(!/HDFC|ICICI|CURRENT/.test(dText), `D unexpectedly displayed a bank account: ${dText}`);
await scrollToCard(103);
const screenshotD = await capture("diesel03-D-historical-paid-no-account");

// E — An unpaid row has no PAID indicator and retains the ordinary compact
// footprint.  Capture it separately so the evidence makes the negative case
// visible without relying on a hidden placeholder.
const eText = await cardText(104);
assert(!(await evaluate("!!document.querySelector('[data-testid=\"badge-payment-status-104\"]')")), `E unpaid row displayed a PAID indicator: ${eText}`);
const eHeight = await cardHeight(104);
assert(eHeight === eHeightBeforePaid, `E unpaid row changed from its baseline height: ${eHeightBeforePaid}px -> ${eHeight}px`);
await scrollToCard(104);
const screenshotE = await capture("diesel03-E-unpaid-no-indicator");

// Mobile desktop-width evidence is not enough for this absolute badge: at
// 375px it must remain visible, inside the card, and below the existing
// status/receipt badges rather than being clipped by a wrapping row.
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 375,
  height: 900,
  deviceScaleFactor: 1,
  mobile: true,
});
await sleep(150);
await scrollToCard(101);
const cMobileBadges = await badgeGeometry(101);
assert(cMobileBadges?.paid && cMobileBadges?.card && cMobileBadges?.receipt, "Mobile C badge geometry is missing");
assert(cMobileBadges.paid.top >= cMobileBadges.receipt.bottom - 0.1, "Mobile C PAID badge overlaps the receipt badge");
assert(cMobileBadges.paid.bottom <= cMobileBadges.card.bottom + 0.1, `Mobile C PAID badge is clipped below card: ${JSON.stringify(cMobileBadges)}`);
assert(cMobileBadges.paid.left >= cMobileBadges.card.left - 0.1 &&
  cMobileBadges.paid.right <= cMobileBadges.card.right + 0.1,
  `Mobile C PAID badge is clipped horizontally: ${JSON.stringify(cMobileBadges)}`);
const screenshotCMobile = await capture("diesel03-C-new-paid-timestamp-mobile");

const finalState = await fixtureState();
assert(finalState.paymentPayloads.length === 2, `Expected exactly two in-memory payment writes, got ${finalState.paymentPayloads.length}`);
assert(finalState.accountsRequests >= 1, "No company-accounts request was observed");
assert(finalState.requests.every((request) => !request.path.includes("vendor-bills") || request.path.includes("company-accounts")), "Fixture reached an unrelated Vendor Bills endpoint");

console.log(JSON.stringify({
  scenario: "DIESEL-03 bank/account payment and paid timestamp browser evidence",
  evidence: {
    productionDatabaseUsed: false,
    authBypassUsed: true,
    writes: "in-memory fetch mock only; no production API writes",
    fixtureUrl: "http://127.0.0.1:4181/plant/diesel-requirements?scenario=diesel03",
    screenshots: [screenshotA, screenshotB, screenshotC, screenshotD, screenshotE, screenshotCMobile],
  },
  verified: {
    A_companyAccountRequiredAndPersisted: true,
    A_accountRequests: finalState.accountsRequests,
    A_paymentPayload: finalState.paymentPayloads[0],
    B_personalHidesAccountAndPersistsWithoutIt: true,
    B_paymentPayload: finalState.paymentPayloads[1],
    C_newPaidTimestamp: true,
    C_paidRowHeightBeforePx: aHeightBeforePaid,
    C_paidRowHeightPx: cHeight,
    E_unpaidRowHeightBeforePx: eHeightBeforePaid,
    E_unpaidRowHeightPx: eHeight,
    C_to_E_heightDeltaPx: cHeight - eHeight,
    C_existingBadgesUnchanged: true,
    C_mobileBadgeVisibleAndUnclipped: true,
    D_historicalPaidTimestampWithoutAccount: true,
    E_unpaidHasNoPaidIndicator: true,
  },
}, null, 2));

socket.close();