import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { describe, expect, it, vi } from "vitest";

// Execute the actual unchanged closure from VendorBills, with isolated dependencies.
// Generated hire rows are excluded from the ordinary edit table, so exercise
// these defensive branches directly rather than inventing an impossible UI state.
const source = readFileSync("client/src/pages/VendorBills.tsx", "utf8");
const start = source.indexOf("  const removeItemGroup = ");
const end = source.indexOf("\n  const calcAmount", start);
const code = transformSync(source.slice(start, end), { loader: "ts" }).code;
function harness(accept: boolean) {
  const confirm = vi.fn(() => accept), toast = vi.fn(), removeLineItem = vi.fn();
  const remove = new Function("window", "toast", "removeLineItem", `${code}; return removeItemGroup;`)({ confirm }, toast, removeLineItem);
  return { confirm, toast, removeLineItem, remove };
}
describe("unchanged vendor bill group removal safeguards", () => {
  it.each(["hire_group", "hire_statement"])("blocks %s before confirmation", source => {
    const h = harness(true);
    h.remove([{ item: { source: "manual" }, idx: 0 }, { item: { source }, idx: 4 }], "Sample group");
    expect(h.toast).toHaveBeenCalledWith({ title: "Remove generated hire items through their hire selection", variant: "destructive" });
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.removeLineItem).not.toHaveBeenCalled();
  });
  it.each([false, true])("preserves original confirm text and cancel/confirm behavior: %s", accept => {
    const h = harness(accept);
    h.remove([{ item: { source: "manual" }, idx: 2 }, { item: { source: "manual" }, idx: 8 }], "Sample group");
    expect(h.confirm).toHaveBeenCalledWith("Remove all 2 items from Sample group?");
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.removeLineItem.mock.calls).toEqual(accept ? [[8], [2]] : []);
  });
});