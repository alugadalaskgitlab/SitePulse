import fs from "node:fs";
import { execFileSync } from "node:child_process";
const directory = ".agents/outputs/vb-export-02-d/";
const changes = new Map();
function baselineLine(file, line) {
  if (!changes.has(file)) {
    const diff = execFileSync("git", ["diff", "f3cae60", "--unified=0", "--", file], { encoding: "utf8" });
    changes.set(file, [...diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)]
      .map(m => ({ oldCount: Number(m[2] ?? 1), newStart: Number(m[3]), newCount: Number(m[4] ?? 1) })));
  }
  let offset = 0;
  for (const h of changes.get(file)) {
    if (line < h.newStart) break;
    if (h.newCount && line < h.newStart + h.newCount) return `changed:${line}`;
    offset += h.oldCount - h.newCount;
  }
  return line + offset;
}
function parse(name, current) {
  const result = {};
  for (const line of fs.readFileSync(directory + name, "utf8").split("\n")) {
    const m = line.match(/((?:client|server|shared)\/[^(:]+)\((\d+),\d+\): error (TS\d+)/);
    if (!m) continue;
    const key = `${m[1]}:${current ? baselineLine(m[1], Number(m[2])) : m[2]}:${m[3]}`;
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}
const baseline = parse("typecheck-f3cae60.log", false);
const current = parse("typecheck-final.log", true);
const summary = {
  baselineCount: Object.values(baseline).reduce((a,b) => a+b, 0),
  currentCount: Object.values(current).reduce((a,b) => a+b, 0),
  added: Object.entries(current).filter(([k,v]) => v > (baseline[k] || 0)),
  removed: Object.entries(baseline).filter(([k,v]) => v > (current[k] || 0)),
  method: "Compare source file, baseline-mapped line, TypeScript error code and multiplicity. Ignore columns and inferred-type display/property-order differences. Baseline extracted from f3cae60 with the same installed dependencies.",
};
fs.writeFileSync(directory + "typecheck-comparison.json", JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
