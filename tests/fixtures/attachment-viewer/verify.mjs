import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import WebSocket from "ws";

const fixtureUrl = "http://127.0.0.1:4189/";
const outputDir = path.resolve("screenshots/attachment-viewer");
fs.mkdirSync(outputDir, { recursive: true });

async function waitForHttp(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The temporary Vite process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function openTarget(url) {
  const endpoint = "http://127.0.0.1:9239/json/new?" + encodeURIComponent(url);
  let response;
  try {
    response = await fetch(endpoint, { method: "PUT" });
  } catch {
    response = await fetch(endpoint);
  }
  if (!response.ok) throw new Error(`Could not create Chromium target: ${response.status}`);
  return response.json();
}

class CdpPage {
  constructor(target) {
    this.socket = new WebSocket(target.webSocketDebuggerUrl);
    this.nextId = 0;
    this.pending = new Map();
    this.dialogMessages = [];
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.once("open", resolve);
      this.socket.once("error", reject);
    });
    this.socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.method === "Page.javascriptDialogOpening") {
        this.dialogMessages.push(message.params.message || "");
        this.send("Page.handleJavaScriptDialog", { accept: false }).catch(() => {});
        return;
      }
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    await this.send("Page.enable");
    await this.send("Runtime.enable");
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.text || "Runtime evaluation failed");
    }
    return response.result?.value;
  }

  async waitFor(expression, label, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    let diagnostic = "";
    try {
      diagnostic = await this.evaluate("document.body?.innerText?.slice(0, 500)");
    } catch (error) {
      diagnostic = String(error);
    }
    throw new Error(`Timed out waiting for ${label}; body=${JSON.stringify(diagnostic)}`);
  }

  async screenshot(name) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    const result = await this.send("Page.captureScreenshot", { format: "png" });
    const filePath = path.join(outputDir, name);
    fs.writeFileSync(filePath, Buffer.from(result.data, "base64"));
    console.log(`screenshot: ${filePath}`);
  }

  async close() {
    this.socket.close();
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function setViewport(page, width, height, mobile) {
  await page.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
}

async function load(page) {
  await page.send("Page.navigate", { url: fixtureUrl });
  await page.waitFor(
    "Boolean(document.querySelector('[data-testid=\"fixture-page\"]'))",
    "fixture page",
  );
  await page.waitFor(
    "Boolean(document.querySelector('[data-testid=\"img-attachment-1\"]'))",
    "attachment grid",
  );
}

async function readSentinels(page) {
  return page.evaluate(`({
    path: location.pathname + location.search + location.hash,
    scrollY: Math.round(window.scrollY),
    dialogScrollTop: Math.round(document.querySelector('[data-testid="receipt-dialog"]')?.scrollTop || 0),
    form: document.querySelector('[data-testid="form-sentinel"]')?.value,
    mount: document.querySelector('[data-testid="receipt-mount-id"]')?.textContent,
    viewer: Boolean(document.querySelector('[data-testid="attachment-viewer"]')),
  })`);
}

async function click(page, testId) {
  await page.evaluate(
    `document.querySelector('[data-testid="${testId}"]').click()`,
  );
}

async function verifyPhoneImage(page) {
  await setViewport(page, 390, 844, true);
  await load(page);
  await page.evaluate("document.querySelector('[data-testid=\"receipt-dialog\"]').scrollTop = 620");
  const before = await readSentinels(page);
  assert(before.form === "FORM SENTINEL RETAINED", "phone form sentinel before image");
  assert(before.dialogScrollTop > 500, `phone receipt dialog should be scrolled (got ${before.dialogScrollTop})`);

  await click(page, "button-open-attachment-1");
  await page.waitFor(
    "Boolean(document.querySelector('[data-testid=\"viewer-image-1\"]'))",
    "phone image viewer",
  );
  const viewer = await page.evaluate(`({
    close: document.querySelector('[data-testid="button-close-attachment-viewer"]')?.textContent,
    path: location.pathname,
    image: Boolean(document.querySelector('[data-testid="viewer-image-1"]')),
  })`);
  assert(viewer.image, "phone image is visible in the in-app viewer");
  assert(viewer.close?.includes("Close"), "phone viewer has visible Close text");
  assert(viewer.path === "/", "phone image did not change the route");
  await page.screenshot("attachment-viewer-phone-image.png");

  await click(page, "button-close-attachment-viewer");
  await page.waitFor(
    "!Boolean(document.querySelector('[data-testid=\"attachment-viewer\"]'))",
    "phone viewer close",
  );
  const after = await readSentinels(page);
  assert(after.path === before.path, "phone close preserved route");
  assert(after.form === before.form, "phone close preserved form sentinel");
  assert(after.dialogScrollTop === before.dialogScrollTop, `phone close preserved dialog scroll (${before.dialogScrollTop} -> ${after.dialogScrollTop})`);
  console.log("D phone: image, visible Close, route/form/scroll retained");
}

async function verifyTabletBackAndPdf(page) {
  await setViewport(page, 820, 1180, false);
  await load(page);
  await page.evaluate("document.querySelector('[data-testid=\"receipt-dialog\"]').scrollTop = 620");
  const beforeBack = await readSentinels(page);
  await click(page, "button-open-attachment-1");
  await page.waitFor(
    "Boolean(document.querySelector('[data-testid=\"viewer-image-1\"]'))",
    "tablet image viewer before back",
  );
  await page.screenshot("attachment-viewer-tablet-image.png");

  await page.evaluate("history.back()");
  await page.waitFor(
    "!Boolean(document.querySelector('[data-testid=\"attachment-viewer\"]'))",
    "tablet browser back close",
  );
  const afterBack = await readSentinels(page);
  assert(afterBack.path === beforeBack.path, "tablet browser back preserved route");
  assert(afterBack.form === beforeBack.form, "tablet browser back preserved form sentinel");
  assert(afterBack.mount === beforeBack.mount, "tablet browser back preserved mounted receipt component");
  assert(afterBack.dialogScrollTop === beforeBack.dialogScrollTop, `tablet browser back preserved dialog scroll (${beforeBack.dialogScrollTop} -> ${afterBack.dialogScrollTop})`);

  await click(page, "button-open-attachment-2");
  await page.waitFor(
    "Boolean(document.querySelector('[data-testid=\"viewer-pdf-2\"]'))",
    "tablet PDF viewer",
  );
  const pdfState = await page.evaluate(`({
    sandbox: document.querySelector('[data-testid="viewer-pdf-2"]')?.getAttribute("sandbox"),
    close: document.querySelector('[data-testid="button-close-attachment-viewer"]')?.textContent,
    open: Boolean(document.querySelector('a[href="/objects/fixture-bill.pdf"][target="_blank"]')),
    download: document.querySelector('a[download="linked-bill.pdf"]')?.getAttribute("href"),
  })`);
  assert(pdfState.sandbox === "allow-same-origin", "PDF is sandboxed in the embedded preview");
  assert(pdfState.close?.includes("Close"), "PDF viewer has visible Close text");
  assert(pdfState.open, "PDF viewer offers explicit Open in new tab action");
  assert(pdfState.download === "/objects/fixture-bill.pdf", "PDF viewer offers explicit Download action");
  await page.screenshot("attachment-viewer-tablet-pdf.png");

  await click(page, "button-close-attachment-viewer");
  await page.waitFor(
    "!Boolean(document.querySelector('[data-testid=\"attachment-viewer\"]'))",
    "tablet PDF viewer close",
  );
  console.log("E tablet: PDF iframe, safe embed, Open/Download, visible Close");
}

async function verifyLinkedAndFallback(page) {
  const state = await readSentinels(page);
  const evidence = await page.evaluate(`({
    linked: Array.from(document.querySelectorAll('[data-testid^="card-attachment-"]')).find((el) => el.textContent?.includes("Linked"))?.textContent,
    linkedDelete: Boolean(document.querySelector('[data-testid="button-delete-attachment-2"]')),
    unlinkedDelete: Boolean(document.querySelector('[data-testid="button-delete-attachment-1"]')),
    metadata: document.querySelectorAll('[data-testid^="text-attachment-meta-"]').length,
  })`);
  assert(evidence.linked?.includes("Linked"), "Linked badge remains visible");
  assert(!evidence.linkedDelete, "linked attachment still cannot be deleted");
  assert(evidence.unlinkedDelete, "unlinked attachment still has delete control");
  assert(evidence.metadata === 3, "uploader/date caption metadata remains on every card");

  await click(page, "button-open-attachment-3");
  await page.waitFor(
    "Boolean(document.querySelector('[data-testid=\"attachment-viewer\"]'))",
    "fallback viewer",
  );
  const fallback = await page.evaluate(`({
    message: document.querySelector('[data-testid="attachment-viewer"]')?.textContent,
    close: document.querySelector('[data-testid="button-close-attachment-viewer"]')?.textContent,
    open: Boolean(document.querySelector('a[href="/objects/fixture-delivery-note.txt"][target="_blank"]')),
    download: document.querySelector('a[download="delivery-note.txt"]')?.getAttribute("href"),
  })`);
  assert(fallback.message?.includes("Preview isn't available"), `non-PDF fallback is explicit (${fallback.message})`);
  assert(fallback.close?.includes("Close"), "fallback viewer has visible Close text");
  assert(fallback.open && fallback.download === "/objects/fixture-delivery-note.txt", "fallback offers Open/Download");
  await page.screenshot("attachment-viewer-tablet-fallback.png");
  await click(page, "button-close-attachment-viewer");
  await page.waitFor(
    "!Boolean(document.querySelector('[data-testid=\"attachment-viewer\"]'))",
    "fallback viewer close",
  );
  const after = await readSentinels(page);
  assert(after.path === state.path, "fallback close preserved route");
  assert(after.form === state.form, "fallback close preserved form sentinel");
  console.log("F tablet: Linked/caption/delete unchanged; fallback Close/Open/Download verified");
  await page.screenshot("attachment-viewer-tablet-grid.png");

  const promptCountBeforeNavigation = page.dialogMessages.length;
  const mountBeforeRoutePrompt = state.mount;
  await click(page, "normal-route-navigation");
  await new Promise((resolve) => setTimeout(resolve, 250));
  const routeAfterDeclinedNavigation = await page.evaluate("location.pathname");
  console.log(`dirty prompt count after normal navigation: ${page.dialogMessages.length}`);
  assert(routeAfterDeclinedNavigation === "/", "normal dirty route navigation was declined");
  assert(page.dialogMessages.length === promptCountBeforeNavigation + 1, "normal route navigation still raised unsaved prompt");
  assert((await readSentinels(page)).mount === mountBeforeRoutePrompt, "declined route navigation preserved mounted receipt component");

  await click(page, "button-open-attachment-1");
  await page.waitFor(
    "Boolean(document.querySelector('[data-testid=\"viewer-image-1\"]'))",
    "reopen after route prompt",
  );
  const beforeGoMinusTwo = await readSentinels(page);
  const promptCountBeforeGoMinusTwo = page.dialogMessages.length;
  await page.evaluate("history.go(-2)");
  await new Promise((resolve) => setTimeout(resolve, 600));
  const afterDeclinedGoMinusTwo = await readSentinels(page);
  assert(page.dialogMessages.length === promptCountBeforeGoMinusTwo + 1, "dirty history.go(-2) raised one prompt");
  assert(afterDeclinedGoMinusTwo.path === beforeGoMinusTwo.path, "declined history.go(-2) restored exact route");
  assert(afterDeclinedGoMinusTwo.mount === beforeGoMinusTwo.mount, `declined history.go(-2) preserved mounted receipt component (${beforeGoMinusTwo.mount} -> ${afterDeclinedGoMinusTwo.mount}, path ${afterDeclinedGoMinusTwo.path})`);
  assert(afterDeclinedGoMinusTwo.form === beforeGoMinusTwo.form, "declined history.go(-2) preserved form sentinel");
  assert(afterDeclinedGoMinusTwo.viewer, "declined history.go(-2) kept viewer open");
  const promptCountBeforeDoubleBack = page.dialogMessages.length;
  const beforeDoubleBack = await readSentinels(page);
  await page.evaluate("history.back(); setTimeout(() => history.back(), 80)");
  await page.waitFor(
    "!Boolean(document.querySelector('[data-testid=\"attachment-viewer\"]'))",
    "rapid double-back closes viewer",
  );
  await new Promise((resolve) => setTimeout(resolve, 600));
  const afterDoubleBack = await readSentinels(page);
  assert(page.dialogMessages.length === promptCountBeforeDoubleBack + 1, "rapid double-back raised one route prompt");
  assert(afterDoubleBack.path === beforeDoubleBack.path, "declined rapid double-back restored exact route");
  assert(afterDoubleBack.mount === beforeDoubleBack.mount, "declined rapid double-back preserved mounted receipt component");
  assert(afterDoubleBack.form === beforeDoubleBack.form, "declined rapid double-back preserved form sentinel");
  assert(!afterDoubleBack.viewer, "rapid double-back left viewer closed");

  const promptCountBeforeStaleForward = page.dialogMessages.length;
  await page.evaluate("history.forward()");
  await new Promise((resolve) => setTimeout(resolve, 250));
  await page.waitFor(
    "!Boolean(document.querySelector('[data-testid=\"attachment-viewer\"]'))",
    "stale forward marker cleanup",
  );
  assert(await page.evaluate("location.pathname") === "/", "forward stale marker stayed on same route");
  assert(page.dialogMessages.length === promptCountBeforeStaleForward, "stale forward marker did not raise dirty prompt");

  await click(page, "button-open-attachment-1");
  await page.waitFor(
    "Boolean(document.querySelector('[data-testid=\"viewer-image-1\"]'))",
    "reopen after forward cleanup",
  );
  await page.evaluate("history.back()");
  await page.waitFor(
    "!Boolean(document.querySelector('[data-testid=\"attachment-viewer\"]'))",
    "back close after reopen cycle",
  );
  assert(page.dialogMessages.length === promptCountBeforeNavigation + 3, `viewer X/back/reopen did not trigger extra dirty prompt (count ${page.dialogMessages.length}, expected ${promptCountBeforeNavigation + 3})`);
  console.log("nested dirty receipt dialog: prompt unaffected for route nav; X/back/forward/reopen clean");
}

async function main() {
  await waitForHttp(fixtureUrl);
  const target = await openTarget(fixtureUrl);
  const page = new CdpPage(target);
  await page.connect();
  try {
    await verifyPhoneImage(page);
    await verifyTabletBackAndPdf(page);
    await verifyLinkedAndFallback(page);
    console.log("AttachmentGrid/Viewer browser fixture D/E/F passed.");
  } finally {
    await page.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});