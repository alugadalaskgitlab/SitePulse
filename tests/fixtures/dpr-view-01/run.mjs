import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, openSync, closeSync } from "node:fs";
import path from "node:path";
const output = path.resolve(".agents/outputs/dpr-view-01");
mkdirSync(output, { recursive: true });
execFileSync("node", ["tests/fixtures/dpr-view-01/prepare-baseline.mjs"], { stdio: "inherit" });
const children = [];
const fds = [];
const start = (command, args, logfile) => {
  const fd = openSync(path.join(output, logfile), "w");
  fds.push(fd);
  const child = spawn(command, args, { detached: true, stdio: ["ignore", fd, fd] });
  children.push(child);
  return child;
};
const waitFor = async url => {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Fixture server unavailable: ${url}`);
};
try {
  // Dedicated ports/profile; never touches the application workflow/session.
  start("node", ["node_modules/vite/bin/vite.js", "--config", "tests/fixtures/dpr-view-01/vite.config.ts", "--host", "127.0.0.1", "--port", "4189", "--strictPort"], "fixture-server.log");
  start(process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium", ["--headless", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--remote-debugging-port=9239", "--user-data-dir=/tmp/dpr-view-01-chromium", "about:blank"], "chromium.log");
  await Promise.all([waitFor("http://127.0.0.1:4189"), waitFor("http://127.0.0.1:9239/json/version")]);
  const verifier = spawn("node", ["tests/fixtures/dpr-view-01/verify.mjs"], { stdio: "inherit" });
  const code = await new Promise((resolve, reject) => { verifier.once("error", reject); verifier.once("exit", resolve); });
  if (code !== 0) throw new Error(`Browser verification failed (${code})`);
} finally {
  for (const child of children) {
    try { process.kill(-child.pid, "SIGTERM"); } catch {}
  }
  for (const fd of fds) closeSync(fd);
}