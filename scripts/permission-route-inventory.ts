/** Read-only source inventory; does not import or start the application. */
import fs from "node:fs";
import ts from "typescript";

const files: string[] = [];
function walk(dir: string) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p) && !/\.test\./.test(p)) files.push(p);
  }
}
walk("server");
const routes: object[] = [];
for (const file of files) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
      && /^(get|post|put|patch|delete)$/.test(n.expression.name.text)
      && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      const body = n.getText(sf);
      const guards = [...body.matchAll(/\b(assert\w+|requirePermission)\s*\(([^;\n]+)/g)].map(m => m[0]);
      const route = n.arguments[0].text;
      routes.push({
        file, line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
        method: n.expression.name.text.toUpperCase(), route, guards,
        output: /export|download|print|pdf|xlsx|csv/i.test(route)
          || /res\.(download|attachment)\s*\(|Content-Disposition|application\/pdf|text\/csv/.test(body),
        adminOnly: guards.some(g => g.startsWith("assertAdmin(")),
      });
    }
    n.forEachChild(visit);
  };
  visit(sf);
}
process.stdout.write(JSON.stringify(routes, null, 2) + "\n");
