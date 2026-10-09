// Offline planning inventory only. No database import, connection or apply mode.
// Execution of ANY repair needs a separately reviewed plan and approval.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
if (process.argv.slice(2).some(arg => arg !== "--plan")) {
  throw new Error("Planning only. Repair execution requires a separately reviewed plan and approval.");
}
const paths = ["server/index.ts", "server/routes.ts"];
const result = paths.map(path => {
  const original = execFileSync("git", ["show", `89c947d6:${path}`], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  const current = fs.readFileSync(path, "utf8");
  const scope = text => path.endsWith("routes.ts") ? text.slice(text.indexOf("async function seedDatabase()"), text.indexOf("async function seedPlanningMasters()")) : text;
  const calls = text => new Set([...scope(text).matchAll(/storage(?: as any\))?\.(\w+)\(/g)].map(m => m[1]));
  const now = calls(current);
  return { path, retiredAutomaticCalls: [...calls(original)].filter(name => !now.has(name)) };
});
console.log(JSON.stringify({
  mode: "read-only offline planning inventory", executable: false,
  requiredBeforeExecution: ["Named operation and target database", "Read-only candidate and balance-impact analysis",
    "Preservation snapshot", "Separately reviewed plan and approval", "Locking and failure/rollback design"],
  note: "This inventory is not an approved repair plan; the obsolete dip-model repair must not be run.",
  operations: result,
}, null, 2));
