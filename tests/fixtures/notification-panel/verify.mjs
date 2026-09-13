import WebSocket from "ws";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const waitFor = async (expression, label) => {
  for (let index = 0; index < 100; index++) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const geometry = () => evaluate(`(() => {
  const area = document.querySelector('[data-testid=notification-scroll-area]');
  const viewport = area?.querySelector('[data-radix-scroll-area-viewport]');
  const panel = document.querySelector('[data-testid=notification-popover-panel]');
  const oldest = document.querySelector('[data-testid=notification-1]');
  const oldestAction = document.querySelector('[data-testid=button-delete-notification-1]');
  const footer = document.querySelector('[data-testid=button-notification-settings]');
  const rect = (element) => {
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, height: box.height };
  };
  return {
    width: window.innerWidth,
    clientHeight: viewport?.clientHeight,
    scrollHeight: viewport?.scrollHeight,
    scrollTop: viewport?.scrollTop,
    viewport: rect(viewport),
    panel: rect(panel),
    oldest: rect(oldest),
    oldestAction: rect(oldestAction),
    footer: rect(footer),
    state: window.notificationFixture,
  };
})()`);

const dragUp = async () => {
  const { width, viewport } = await geometry();
  const x = Math.round(width / 2);
  const startY = Math.round(viewport.bottom - 30);
  const endY = Math.round(viewport.top + 30);
  await cdp("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: startY, id: 1 }] });
  for (let step = 1; step <= 5; step++) {
    await cdp("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: Math.round(startY + ((endY - startY) * step) / 5), id: 1 }],
    });
  }
  await cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(100);
};

const navigate = async (width, height, mobile) => {
  await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await cdp("Runtime.enable");
  await cdp("Page.navigate", { url: "http://127.0.0.1:4177/" });
  await evaluate("import('/main.tsx').then(() => true)");
  await waitFor("!!document.querySelector('[data-testid=button-notifications]')", "notification trigger");
  await evaluate("document.querySelector('[data-testid=button-notifications]').click()");
  for (let index = 0; index < 100 && !(await evaluate("window.notificationFixture && window.notificationFixture.syncCalls === 1")); index++) {
    await sleep(50);
  }
  if (!await evaluate("window.notificationFixture && window.notificationFixture.syncCalls === 1")) {
    throw new Error(`Silent subscription sync did not run: ${await evaluate("JSON.stringify(window.notificationFixture)")} support=${await evaluate("'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window")}`);
  }
  await waitFor("!!document.querySelector('[data-testid=notification-1]')", "long notification list");
};

const verify = async (name, width, height, mobile) => {
  await navigate(width, height, mobile);
  const before = await geometry();
  if (!(before.clientHeight > 0 && before.scrollHeight > before.clientHeight)) throw new Error(`${name}: list is not scrollable`);
  if (!(before.panel.top >= -1 && before.panel.bottom <= height + 1)) throw new Error(`${name}: panel exceeds viewport`);
  if (!(before.footer.top >= 0 && before.footer.bottom <= height + 1)) throw new Error(`${name}: footer is not reachable`);
  if (mobile) {
    for (let index = 0; index < 8 && (await geometry()).scrollTop < (await geometry()).scrollHeight - (await geometry()).clientHeight - 2; index++) {
      await dragUp();
    }
  } else {
    await evaluate(`(() => {
      const viewport = document.querySelector('[data-testid=notification-scroll-area] [data-radix-scroll-area-viewport]');
      viewport.scrollBy({ top: viewport.clientHeight, behavior: 'instant' });
    })()`);
    await sleep(100);
  }
  const afterInput = await geometry();
  if (!(afterInput.scrollTop > 0)) throw new Error(`${name}: ${mobile ? "synthetic touch" : "native scroll API"} did not scroll the real viewport`);
  await evaluate(`(() => {
    const viewport = document.querySelector('[data-testid=notification-scroll-area] [data-radix-scroll-area-viewport]');
    viewport.scrollTop = viewport.scrollHeight;
    viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
  })()`);
  await sleep(50);
  const atOldest = await geometry();
  if (!(atOldest.oldest.top >= atOldest.viewport.top && atOldest.oldest.bottom <= atOldest.viewport.bottom)
    || !(atOldest.oldestAction.top >= atOldest.viewport.top && atOldest.oldestAction.bottom <= atOldest.viewport.bottom)) {
    throw new Error(`${name}: oldest entry or its action is not reachable`);
  }
  await evaluate("document.querySelector('[data-testid=button-notifications]').click()");
  await waitFor("!document.querySelector('[data-testid=notification-popover-panel]')", "notification panel close");
  await evaluate("document.querySelector('[data-testid=button-notifications]').click()");
  await waitFor("!!document.querySelector('[data-testid=notification-popover-panel]')", "notification panel reopen");
  await waitFor("window.notificationFixture.syncCalls === 2", "silent subscription resync on reopen");
  const reopened = await geometry();
  if (reopened.state.syncCalls !== 2 || reopened.state.activationCalls !== 0 || reopened.state.permissionCalls !== 0) {
    throw new Error(`${name}: reopening was not silent`);
  }
  return { name, before, afterInput, atOldest, reopened: reopened.state };
};

const results = [];
results.push(await verify("mobile-390x844", 390, 844, true));
results.push(await verify("short-mobile-390x420", 390, 420, true));
results.push(await verify("desktop-1440x900", 1440, 900, false));
console.log(JSON.stringify(results.map(({ name, before, afterInput, atOldest, reopened }) => ({
  name,
  viewport: { clientHeight: before.clientHeight, scrollHeight: before.scrollHeight, initialScrollTop: before.scrollTop },
  panel: before.panel,
  footer: before.footer,
  inputScrollTop: afterInput.scrollTop,
  oldest: atOldest.oldest,
  oldestAction: atOldest.oldestAction,
  reopened,
})), null, 2));
socket.close();