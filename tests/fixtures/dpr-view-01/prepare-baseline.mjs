import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname);
const files = [
  "pages/SiteReport.tsx", "pages/DprDetails.tsx",
  "components/DprEquipmentTableDetails.tsx", "components/DprEquipmentCompact.tsx",
  "components/EquipmentActivityAllocationEditor.tsx",
];
for (const file of files) {
  let source = execFileSync("git", ["show", `HEAD:client/src/${file}`], { encoding: "utf8" });
  for (const dependency of files) {
    source = source.replaceAll(`@/${dependency.slice(0, -4)}`, `@before/${dependency.slice(0, -4)}`);
  }
  const target = path.join(root, "baseline", file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, source);
}
console.log(`Extracted HEAD ${execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()} to fixture-only baseline; production files untouched.`);