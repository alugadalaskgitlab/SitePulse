import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const baselineModulePath = path.join(fixtureDir, "baseline-head.tsx");
const baselineSource = execFileSync("git", ["show", "HEAD:client/src/pages/VendorBills.tsx"], {
  cwd: process.cwd(),
  encoding: "utf8",
});
writeFileSync(baselineModulePath, baselineSource);
process.on("exit", () => {
  try { unlinkSync(baselineModulePath); } catch { /* already removed */ }
});

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find((target) => target.type === "page");
if (!page) throw new Error("Chromium did not expose a page target");

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
    console.error(`Browser exception: ${message.params.exceptionDetails.text}`);
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
  const result = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
};

const waitFor = async (expression, label, attempts = 160) => {
  for (let index = 0; index < attempts; index += 1) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const devFixturePath = "/tmp/vb09-dev-fixture.json";
const devFixture = JSON.parse(readFileSync(devFixturePath, "utf8"));
const actualDevBills = (devFixture.historicalHireBills || []).map((bill) => ({
  ...bill,
  billType: String(bill.billType || "equipment").toLowerCase(),
  // The dev records deliberately have zero linked monthly statements. Keep
  // that absence truthful; representative records below cover frozen exports.
  items: [],
}));
assert(actualDevBills.length >= 2, `Expected two actual dev bills in ${devFixturePath}`);
await cdp("Page.addScriptToEvaluateOnNewDocument", {
  source: `window.__VB09_DEV_BILLS__ = ${JSON.stringify(actualDevBills)};`,
});

const quote = (value) => JSON.stringify(value);
const hasTestId = (testId) => evaluate(`!!document.querySelector('[data-testid=${quote(testId)}]')`);
const textContent = () => evaluate("document.body.innerText");

const clickTestId = async (testId) => {
  const clicked = await evaluate(`(() => {
    const element = document.querySelector('[data-testid=${quote(testId)}]');
    if (!element) return false;
    element.click();
    return true;
  })()`);
  assert(clicked, `Could not click [data-testid=${testId}]`);
};

const clickEnabledExport = async (testId, expectedFiles, label) => {
  await waitFor(`(() => {
    const element = document.querySelector('[data-testid=${quote(testId)}]');
    return !!element && !element.disabled;
  })()`, `${label} enabled`);
  await clickTestId(testId);
  await waitFor(`window.__VB09Fixture?.downloadFiles.length >= ${expectedFiles}`, `${label} generated file`);
};

const clickOption = async (label) => {
  const clicked = await evaluate(`(() => {
    const options = Array.from(document.querySelectorAll('[role="option"]'));
    const option = options.find(candidate => candidate.textContent?.trim() === ${quote(label)});
    if (!option) return false;
    option.click();
    return true;
  })()`);
  assert(clicked, `Could not select option ${label}`);
};

const setInput = async (testId, value) => {
  const changed = await evaluate(`(() => {
    const element = document.querySelector('[data-testid=${quote(testId)}]');
    if (!element) return false;
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(element, ${quote(String(value))});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  assert(changed, `Could not set [data-testid=${testId}]`);
};

const blurTestId = async (testId) => {
  await evaluate(`document.querySelector('[data-testid=${quote(testId)}]')?.blur()`);
};

const rect = (selector) => evaluate(`(() => {
  const element = document.querySelector(${quote(selector)});
  if (!element) return null;
  const box = element.getBoundingClientRect();
  return { left: box.left, top: box.top, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
})()`);

const formGeometry = () => evaluate(`(() => {
  const rect = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
  };
  const formTitle = document.querySelector('[data-testid="text-form-title"]');
  const root = formTitle?.closest(".max-w-5xl");
  const table = document.querySelector("table");
  const addItem = document.querySelector('[data-testid="button-add-item"]');
  const lineCard = addItem?.closest(".border") || table?.closest(".border");
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    root: root ? (() => { const box = root.getBoundingClientRect(); return { width: box.width, height: box.height }; })() : null,
    lineCard: lineCard ? (() => { const box = lineCard.getBoundingClientRect(); return { width: box.width, height: box.height }; })() : null,
    table: table ? (() => { const box = table.getBoundingClientRect(); return { width: box.width, height: box.height }; })() : null,
    banner: rect('[data-testid="card-auto-items-banner"]'),
    gstInput: rect('[data-testid="input-gst-equipment-rate"]'),
    scrollHeight: document.documentElement.scrollHeight,
  };
})()`);

const capture = async (name) => {
  const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(result.data, "base64"));
  return target;
};

const state = () => evaluate("window.__VB09Fixture || null");

const navigate = async (name, width, height, mobile = false, mode = "current") => {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  const query = mode === "baseline" ? "?mode=baseline" : "";
  await cdp("Page.navigate", { url: `http://127.0.0.1:4177/${query}` });
  await waitFor("document.readyState === 'complete'", `${name} document`);
  await waitFor("!!document.querySelector('[data-testid=\"text-page-title\"]')", `${name} vendor bills list`);
};

const selectBillType = async (label) => {
  await clickTestId("select-bill-type");
  await waitFor("document.querySelectorAll('[role=\"option\"]').length > 0", `${label} bill type menu`);
  await clickOption(label);
  await sleep(80);
};

const prepareEquipmentForm = async () => {
  await clickTestId("button-new-bill");
  await waitFor("!!document.querySelector('[data-testid=\"text-form-title\"]')", "new bill form");
  await setInput("input-period-from", "2026-08-01");
  await setInput("input-period-to", "2026-09-13");
  await waitFor("!!document.querySelector('[data-testid=\"button-show-vendors\"]')", "equipment vendor discovery button");
  await clickTestId("button-show-vendors");
  await waitFor("window.__VB09Fixture?.requests.some(request => request.path.startsWith('/api/vendor-bills/discover-vendors'))", "shared equipment vendor discovery");
  await waitFor("!!document.querySelector('[data-testid=\"row-vendor-NARASIMHULU\"]')", "NARASIMHULU discovery row");
  await clickTestId("button-select-vendor-NARASIMHULU");
  await waitFor("document.querySelector('[data-testid=\"input-vendor-name\"]')?.value === 'NARASIMHULU'", "selected equipment vendor");
  await waitFor("document.body.innerText.includes('Equipment usage for NARASIMHULU')", "shared equipment activity banner");
  await waitFor("window.__VB09Fixture?.requests.some(request => request.path.startsWith('/api/vendor-bills/auto-items'))", "equipment auto-item request");
  assert(!(await hasTestId("equipment-hire-straight-form")), "dedicated equipment-hire-straight-form is still rendered");
  assert(await hasTestId("button-add-item"), "shared itemized ADD ITEM control is missing for equipment");
};

const pullAndEditEquipmentItems = async () => {
  const button = await evaluate(`(() => {
    const candidates = Array.from(document.querySelectorAll("button"));
    const item = candidates.find(candidate => /^PULL \\d+ (?:ITEM|ITEMS|OTHER ITEM|OTHER ITEMS)$/i.test(candidate.textContent?.trim() || ""));
    if (!item) return false;
    item.click();
    return true;
  })()`);
  assert(button, "shared PULL N ITEMS control is missing for equipment");
  await waitFor("document.querySelectorAll('[data-testid^=\"text-item-desc-\"]').length >= 1", "JCB auto item");
  await waitFor("document.body.innerText.includes('JCB')", "JCB activity line");

  await clickTestId("button-add-item");
  await waitFor("document.querySelectorAll('[data-testid^=\"input-item-date-\"]').length >= 1", "manual equipment line");
  // Generated activity rows intentionally render a read-only date span, so
  // the editable row index is not the count of editable date inputs.
  const editableRowIds = await evaluate(`Array.from(document.querySelectorAll('[data-testid^="input-item-date-"]'))
    .map(element => element.getAttribute("data-testid"))`);
  assert(editableRowIds.length >= 1, "manual equipment date input is missing after ADD ITEM");
  const dateTestId = editableRowIds[editableRowIds.length - 1];
  const index = Number(dateTestId.match(/-(\d+)$/)?.[1]);
  assert(Number.isInteger(index), `Could not determine manual equipment row index from ${dateTestId}`);
  await setInput(dateTestId, "2026-08-01");
  await setInput(`input-item-desc-${index}`, "JCB AGREED MONTHLY HIRE — MANUAL MONTHLY LINE");
  await setInput(`input-item-qty-${index}`, "1");
  await setInput(`input-item-rate-${index}`, "90000");
  await waitFor(`document.querySelector('[data-testid="text-item-amount-${index}"]')?.textContent?.includes('90,000.00')`, "manual monthly amount");

  await setInput("input-gst-equipment-rate", "18");
  await waitFor("document.body.innerText.includes('GST ON EQUIPMENT')", "shared GST ON EQUIPMENT card");
  await waitFor("document.querySelector('[data-testid=\"text-gst-equipment-amount\"]')?.textContent?.includes('21,240.00')", "equipment GST amount");
  return index;
};

const verifyNewEquipment = async ({ width, height, mobile, save, screenshotName }) => {
  await navigate(`new equipment ${width}x${height}`, width, height, mobile);
  await prepareEquipmentForm();
  const manualIndex = await pullAndEditEquipmentItems();
  const geometry = await formGeometry();
  assert(geometry.table?.width > 0, "equipment item table has no geometry");
  const image = await capture(screenshotName);

  if (!save) return { geometry, image, manualIndex };

  await clickTestId("button-save-bill");
  await waitFor("window.__VB09Fixture?.createdPayloads.length === 1", "mock equipment bill save");
  const fixtureState = await state();
  const payload = fixtureState.createdPayloads[0];
  assert(payload.billType === "equipment", `saved bill type was ${payload.billType}`);
  assert(payload.vendorName === "NARASIMHULU", `saved vendor was ${payload.vendorName}`);
  assert(payload.periodFrom === "2026-08-01" && payload.periodTo === "2026-09-13", "saved equipment period changed");
  assert(payload.gstRateEquipment === 18, `saved GST rate was ${payload.gstRateEquipment}`);
  assert(payload.hireGroups === undefined, "shared itemized equipment save still serializes hireGroups");
  assert(payload.items.some(item => item.source?.startsWith("auto:") && item.description.includes("JCB")), "JCB auto activity was not saved");
  assert(payload.items.some(item => item.source === "manual" && item.description.includes("JCB AGREED MONTHLY HIRE") && Number(item.rate) === 90000), "manual monthly equipment line was not saved");
  return { geometry, image, manualIndex, payload };
};

const verifyHistoricalBills = async () => {
  await navigate("historical desktop", 1440, 900, false);
  for (const id of [29, 28, 901, 902]) {
    assert(await hasTestId(`card-bill-${id}`), `historical bill ${id} is missing`);
  }

  const actualDevImages = [];
  for (const [id, billNo] of [[29, "HLC/VB/2026/0029"], [28, "HLC/VB/2026/0028"]]) {
    await clickTestId(`card-bill-${id}`);
    await waitFor("!!document.querySelector('[data-testid=\"text-detail-title\"]')", `actual dev bill ${id} detail`);
    assert((await textContent()).includes(billNo), `actual dev bill ${id} number is missing from detail`);
    assert(await hasTestId("button-print"), `actual dev bill ${id} print/view export is missing`);
    const actualDevBill = actualDevBills.find((bill) => bill.id === id);
    const genericPdfExpected = ["verified", "approved", "paid"].includes(String(actualDevBill?.status || "").toLowerCase());
    assert((await hasTestId("button-export-pdf")) === genericPdfExpected, `actual dev bill ${id} generic PDF action status mismatch`);
    assert(!(await hasTestId("button-export-equipment-hire-pdf")), `actual dev bill ${id} unexpectedly has a frozen hire PDF without statements`);
    assert(!(await hasTestId("button-export-equipment-hire-excel")), `actual dev bill ${id} unexpectedly has a frozen hire Excel export without statements`);
    const printsBefore = (await state()).printDocuments.length;
    await clickTestId("button-print");
    await waitFor(`window.__VB09Fixture?.printDocuments.length > ${printsBefore}`, `actual dev bill ${id} print document`);
    const printDocument = (await state()).printDocuments.at(-1) || "";
    assert(printDocument.includes(billNo) && printDocument.includes("<table"), `actual dev bill ${id} print document is incomplete`);
    actualDevImages.push(await capture(`actual-dev-bill-${id}-desktop`));
    await clickTestId("button-back-detail");
    await waitFor("!!document.querySelector('[data-testid=\"card-bill-901\"]')", `historical list after actual bill ${id}`);
  }

  await clickTestId("card-bill-901");
  await waitFor("!!document.querySelector('[data-testid=\"text-detail-title\"]')", "historical bill 901 detail");
  assert(await hasTestId("button-export-equipment-hire-pdf"), "historical bill 901 PDF export is missing");
  assert(await hasTestId("button-export-equipment-hire-excel"), "historical bill 901 Excel export is missing");
  assert(await hasTestId("button-edit-bill"), "draft historical bill 901 edit action is missing");
  await clickTestId("button-edit-bill");
  await waitFor("document.querySelector('[data-testid=\"text-form-title\"]')?.textContent?.includes('EDIT')", "historical bill edit form");
  await clickTestId("button-back-form");
  await waitFor("!!document.querySelector('[data-testid=\"card-bill-901\"]')", "historical list after edit check");
  await clickTestId("card-bill-901");
  await waitFor("!!document.querySelector('[data-testid=\"button-export-equipment-hire-pdf\"]')", "historical bill 901 exports after edit check");

  await clickTestId("button-detail-view-daily-activity");
  await waitFor("document.body.innerText.includes('Daily Activity')", "historical daily activity view");
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await clickEnabledExport("button-export-equipment-hire-pdf", 1, "historical bill 901 PDF export");
  await clickEnabledExport("button-export-equipment-hire-excel", 2, "historical bill 901 Excel export");
  const firstImage = await capture("historical-bill-901-desktop");

  await clickTestId("button-back-detail");
  await waitFor("!!document.querySelector('[data-testid=\"card-bill-902\"]')", "historical bill 902 list");
  await clickTestId("card-bill-902");
  await waitFor("!!document.querySelector('[data-testid=\"text-detail-title\"]')", "historical bill 902 detail");
  assert(await hasTestId("button-export-equipment-hire-pdf"), "historical bill 902 PDF export is missing");
  assert(await hasTestId("button-export-equipment-hire-excel"), "historical bill 902 Excel export is missing");
  await clickEnabledExport("button-export-equipment-hire-pdf", 3, "historical bill 902 PDF export");
  await clickEnabledExport("button-export-equipment-hire-excel", 4, "historical bill 902 Excel export");
  const secondImage = await capture("historical-bill-902-desktop");
  const fixtureState = await state();
  assert(fixtureState.downloadClicks.length >= 4, `historical export clicks recorded ${fixtureState.downloadClicks.length}/4`);
  assert(fixtureState.downloadFiles.length >= 4, `historical export files captured ${fixtureState.downloadFiles.length}/4`);
  const exportFiles = fixtureState.downloadFiles.slice(0, 4);
  assert(exportFiles.every(file => file.bytes > 100), `historical export contained a short file: ${JSON.stringify(exportFiles)}`);
  assert(exportFiles.filter(file => file.name.toLowerCase().endsWith(".pdf")).every(file => file.signature === "25504446"), `historical PDF export did not begin with %PDF: ${JSON.stringify(exportFiles)}`);
  assert(exportFiles.filter(file => file.name.toLowerCase().endsWith(".xlsx")).every(file => file.signature === "504b0304"), `historical Excel export did not begin with ZIP signature: ${JSON.stringify(exportFiles)}`);

  await navigate("historical mobile", 390, 844, true);
  await clickTestId("card-bill-901");
  await waitFor("!!document.querySelector('[data-testid=\"text-detail-title\"]')", "historical mobile detail");
  const mobileImage = await capture("historical-bill-901-mobile");
  return {
    actualDevIds: [29, 28],
    representativeIds: [901, 902],
    actualDevImages,
    exportClicks: fixtureState.downloadClicks,
    exportFiles,
    images: [firstImage, secondImage, mobileImage],
  };
};

const collectNonEquipmentGeometry = async (mode) => {
  const labels = {
    material: "MATERIAL SUPPLY",
    transport: "TRANSPORT",
    labour: "LABOUR",
    other: "OTHER / MISCELLANEOUS",
  };
  const geometries = {};
  for (const [type, label] of Object.entries(labels)) {
    await navigate(`non-equipment ${mode} ${type}`, 1440, 900, false, mode);
    await clickTestId("button-new-bill");
    await waitFor("!!document.querySelector('[data-testid=\"text-form-title\"]')", `${type} form`);
    await selectBillType(label);
    await setInput("input-period-from", "2026-08-01");
    await setInput("input-period-to", "2026-09-13");
    await setInput("input-vendor-name", "NARASIMHULU");
    await blurTestId("input-vendor-name");
    await waitFor("document.querySelector('[data-testid=\"input-vendor-name\"]')?.value === 'NARASIMHULU'", `${type} vendor`);
    await sleep(120);
    assert(await hasTestId("button-add-item"), `${type} lost the shared ADD ITEM control`);
    geometries[type] = await formGeometry();
  }

  const sharedTypes = ["material", "transport", "labour", "other"];
  const widths = sharedTypes.map(type => geometries[type].table?.width || 0);
  assert(widths.every(width => width > 0), `non-equipment table geometry missing: ${JSON.stringify(geometries)}`);
  const widthRange = Math.max(...widths) - Math.min(...widths);
  assert(widthRange <= 1, `non-equipment table widths diverged by ${widthRange}px`);

  return geometries;
};

const verifyNonEquipmentGeometry = async () => {
  const currentGeometries = await collectNonEquipmentGeometry("current");
  const baselineGeometries = await collectNonEquipmentGeometry("baseline");
  const sharedTypes = ["material", "transport", "labour", "other"];
  const widths = sharedTypes.map(type => currentGeometries[type].table?.width || 0);
  assert(widths.every(width => width > 0), `non-equipment table geometry missing: ${JSON.stringify(currentGeometries)}`);
  const widthRange = Math.max(...widths) - Math.min(...widths);
  assert(widthRange <= 1, `non-equipment table widths diverged by ${widthRange}px`);

  const geometryDifferences = [];
  for (const type of sharedTypes) {
    for (const part of ["root", "lineCard", "table", "banner", "gstInput"]) {
      const before = baselineGeometries[type][part];
      const after = currentGeometries[type][part];
      if (!before && !after) continue;
      if (!before || !after) {
        geometryDifferences.push({ type, part, before, after });
        continue;
      }
      for (const key of ["left", "top", "width", "height", "right", "bottom"]) {
        if (Math.abs(Number(before[key] || 0) - Number(after[key] || 0)) > 1) {
          geometryDifferences.push({ type, part, key, before: before[key], after: after[key] });
        }
      }
    }
  }
  assert(geometryDifferences.length === 0, `non-equipment geometry differs from HEAD: ${JSON.stringify(geometryDifferences)}`);

  const repoRoot = process.cwd();
  const currentSource = readFileSync(path.join(repoRoot, "client/src/pages/VendorBills.tsx"), "utf8");
  const baselineMarkers = [
    'data-testid="button-add-item"',
    'const getDefaultCategory = () =>',
    'data-testid={`input-item-rate-${idx}`}',
  ];
  const markerEvidence = Object.fromEntries(baselineMarkers.map(marker => [marker, {
    baseline: baselineSource.includes(marker),
    current: currentSource.includes(marker),
  }]));
  assert(Object.values(markerEvidence).every(value => value.baseline && value.current), `non-equipment HEAD markers changed: ${JSON.stringify(markerEvidence)}`);
  return { baseline: baselineGeometries, current: currentGeometries, widthRange, geometryDifferences, markerEvidence };
};

const desktopNew = await verifyNewEquipment({
  width: 1440,
  height: 900,
  mobile: false,
  save: true,
  screenshotName: "new-equipment-desktop",
});
const mobileNew = await verifyNewEquipment({
  width: 390,
  height: 844,
  mobile: true,
  save: false,
  screenshotName: "new-equipment-mobile",
});
const historical = await verifyHistoricalBills();
const nonEquipment = await verifyNonEquipmentGeometry();

console.log(JSON.stringify({
  scenario: "VB-09 isolated VendorBills browser fixture",
  evidence: {
    productionDatabaseUsed: false,
    authBypassUsed: false,
    writes: "in-memory fetch mock only",
    actualDevFixturePath: devFixturePath,
    actualDevBills: actualDevBills.map(bill => ({
      id: bill.id,
      billNo: bill.billNo,
      vendorName: bill.vendorName,
      status: bill.status,
      hireStatements: Array.isArray(bill.hireStatements) ? bill.hireStatements.length : 0,
    })),
    representativeHistoricalFixtureWarning: "Bills 901/902 are representative frozen-statement fixtures used only for PDF/Excel/daily-activity coverage; actual dev bills 29/28 are injected from the fixture path above and verified separately without inventing monthly statements.",
  },
  newEquipment: {
    scenario: "NARASIMHULU · 2026-08-01 to 2026-09-13",
    activity: "JCB auto activity with no hire terms",
    desktop: desktopNew,
    mobile: mobileNew,
  },
  historical,
  nonEquipment,
  evidenceDirectory: evidenceDir,
}, null, 2));

socket.close();