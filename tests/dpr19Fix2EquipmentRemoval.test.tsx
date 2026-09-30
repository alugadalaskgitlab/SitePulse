// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DprEquipmentCompact } from "../client/src/components/DprEquipmentCompact";
import { EquipmentRowRemove, committedEquipmentRemovalIndex, resolveEquipmentRemovalIndex } from "../client/src/components/EquipmentRowRemove";
import { readFileSync } from "node:fs";

afterEach(cleanup);

const row = { machine: "Roller", equipmentId: 12, diesel: 7, operator: "A", startTime: "08:00", endTime: "16:00", closingReading: 10 };
function Fixture({ identity = "saved:12", disabled = false, blank = false, onRemove = vi.fn() }: {
  identity?: string; disabled?: boolean; blank?: boolean; onRemove?: () => void;
}) {
  return <EquipmentRowRemove identity={identity} index={0} label={blank ? "Equipment 1" : "Roller"}
    disabled={disabled} onRemove={onRemove}>
    {({ action, prompt, dismiss }) => blank
      ? <div><div>Choose equipment</div><div>{action}</div>{prompt}</div>
      : <DprEquipmentCompact row={row} sectionPresentation index={0} headerActionSlot={action}
          headerConfirmationSlot={prompt} onToggle={dismiss} onChange={vi.fn()} />}
  </EquipmentRowRemove>;
}

describe("DPR19 Fix2 equipment removal", () => {
  it("keeps both header targets separate, touch-sized and confirmation below header; first click and repeated initial clicks cannot delete", () => {
    const remove = vi.fn();
    render(<Fixture onRemove={remove} />);
    const action = screen.getByTestId("button-remove-equipment-0");
    const toggle = screen.getByRole("button", { name: "Expand Roller" });
    expect(action.className).toContain("h-11 w-11");
    expect(toggle.className).toContain("h-11 w-11");
    expect(toggle.className).not.toContain("sm:h-9");
    expect(action.parentElement).toBe(toggle.parentElement);
    expect(action.parentElement?.className).toContain("gap-2");
    fireEvent.click(action);
    fireEvent.click(action);
    expect(remove).not.toHaveBeenCalled();
    const prompt = screen.getByTestId("confirm-remove-equipment-0");
    expect(prompt.previousElementSibling?.tagName).toBe("HEADER");
    expect(action.getAttribute("type")).toBe("button");
    expect(screen.getByRole("button", { name: "Remove row" }).getAttribute("type")).toBe("button");
    fireEvent.click(screen.getByRole("button", { name: "Remove row" }));
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("Cancel, Escape, and expanding or collapsing dismiss without deleting", () => {
    const remove = vi.fn();
    render(<Fixture onRemove={remove} />);
    const action = screen.getByTestId("button-remove-equipment-0");
    fireEvent.click(action);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Remove row" })).toBeNull();
    fireEvent.click(action);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Remove row" })).toBeNull();
    fireEvent.click(action);
    fireEvent.click(screen.getByRole("button", { name: "Expand Roller" }));
    expect(screen.queryByRole("button", { name: "Remove row" })).toBeNull();
    fireEvent.click(action);
    fireEvent.click(screen.getByRole("button", { name: "Collapse Roller" }));
    expect(screen.queryByRole("button", { name: "Remove row" })).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });

  it("blank rows have an independent safe action and the last row cannot be removed", () => {
    const remove = vi.fn();
    const { rerender } = render(<Fixture blank onRemove={remove} />);
    fireEvent.click(screen.getByTestId("button-remove-equipment-0"));
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "Remove Equipment 1?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove row" }));
    expect(remove).toHaveBeenCalledTimes(1);
    rerender(<Fixture blank disabled onRemove={remove} />);
    expect((screen.getByTestId("button-remove-equipment-0") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("button-remove-equipment-0"));
    expect(screen.queryByRole("button", { name: "Remove row" })).toBeNull();
  });

  it("puts the prompt label on its own full-width mobile row, above two distinct buttons", () => {
    render(<Fixture />);
    fireEvent.click(screen.getByTestId("button-remove-equipment-0"));
    const prompt = screen.getByTestId("confirm-remove-equipment-0");
    expect(prompt.className).toContain("grid-cols-2");
    expect(prompt.firstElementChild?.className).toContain("col-span-2");
    expect(prompt.firstElementChild?.className).toContain("break-words");
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Remove row" });
    expect(cancel.parentElement).toBe(prompt);
    expect(confirm.parentElement).toBe(prompt);
    expect(cancel.className).toContain("w-full sm:w-auto");
    expect(confirm.className).toContain("w-full sm:w-auto");
  });

  it("does not transfer a pending prompt to a replacement at the same index", () => {
    const remove = vi.fn();
    const { rerender } = render(<Fixture onRemove={remove} identity="saved:12" />);
    fireEvent.click(screen.getByTestId("button-remove-equipment-0"));
    rerender(<Fixture onRemove={remove} identity="new:abcd" />);
    expect(screen.queryByRole("button", { name: "Remove row" })).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });

  it("resolves moved identities against latest rows, rejects replacements and last-row removal, retains remaining data", () => {
    const token = Symbol("site entry row");
    const a = { identity: token, machine: "Roller", diesel: 7 };
    const b = { identity: Symbol("other"), machine: "Crane", diesel: 12 };
    const c = { identity: Symbol("third"), machine: "Paver", diesel: 5 };
    const latest = [b, c, a];
    const index = resolveEquipmentRemovalIndex(latest, token, item => item.identity);
    expect(index).toBe(2);
    expect(latest.filter((_, i) => i !== index)).toEqual([b, c]);
    expect(resolveEquipmentRemovalIndex([b, c, { ...a, identity: Symbol("replacement") }], token, item => item.identity)).toBe(-1);
    expect(resolveEquipmentRemovalIndex([a], token, item => item.identity)).toBe(-1);
    const saved = { persistedId: 22, machine: "Excavator", operator: "D" };
    const newRow = { editCreationKey: "xyz", machine: "Grader", operator: "E" };
    const editIdentity = (item: typeof saved | typeof newRow) => "persistedId" in item ? `saved:${item.persistedId}` : `new:${item.editCreationKey}`;
    expect(resolveEquipmentRemovalIndex([newRow, saved], "saved:22", editIdentity)).toBe(1);
    expect(resolveEquipmentRemovalIndex([newRow, { ...saved, persistedId: 23 }], "saved:22", editIdentity)).toBe(-1);
  });

  it("reindexes Other/Unlisted flags only after the guarded equipment removal actually commits", () => {
    const token = Symbol("selected");
    const a = { identity: Symbol("other row") };
    const b = { identity: token };
    const c = { identity: Symbol("other row") };
    const before = [a, b, c];
    const current = [a, { identity: Symbol("replacement") }, c];
    // A queued replacement wins before the guarded removal updater: it must
    // return rows unchanged, not silently reindex the selected Other rows.
    const guarded = current[1].identity === token ? current.filter((_, i) => i !== 1) : current;
    const rejectedIndex = committedEquipmentRemovalIndex(before, guarded, token, row => row.identity);
    expect(rejectedIndex).toBe(-1);
    const flags = new Set([0, 2]);
    const afterRejected = rejectedIndex < 0 ? flags : new Set([...flags].filter(i => i !== rejectedIndex).map(i => i > rejectedIndex ? i - 1 : i));
    expect(afterRejected).toEqual(new Set([0, 2]));
    const committed = before.filter((_, i) => i !== 1);
    const removedIndex = committedEquipmentRemovalIndex(before, committed, token, row => row.identity);
    expect(removedIndex).toBe(1);
    expect(new Set([...flags].filter(i => i !== removedIndex).map(i => i > removedIndex ? i - 1 : i))).toEqual(new Set([0, 1]));
    expect(committedEquipmentRemovalIndex(before, before, token, row => row.identity)).toBe(-1);
    expect(committedEquipmentRemovalIndex(before, [a, b], token, row => row.identity)).toBe(-1);
  });

  it("wires both parent screens to the guarded remove path without changing payload/save logic", () => {
    const entry = readFileSync("client/src/pages/SiteEntry.tsx", "utf8");
    const edit = readFileSync("client/src/pages/SiteEdit.tsx", "utf8");
    for (const source of [entry, edit]) {
      expect(source).toContain("resolveEquipmentRemovalIndex(latest,");
      expect(source).toContain("headerActionSlot={");
      expect(source).toContain("headerConfirmationSlot={");
      expect(source).toContain("onToggle={dismiss}");
      expect(source).not.toContain('className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"');
      expect(source).toContain("rows.filter((_, i) => i !== index)");
    }
    expect(entry).toContain("setOtherEquipmentRows(rows => new Set(");
    expect(entry).toContain("committedEquipmentRemovalIndex(previous, equipment, token,");
    expect(entry).toContain("if (removedIndex >= 0)");
    expect(entry).toMatch(/setEquipment\(rows => rows\.length > 1[\s\S]*?rows\.filter\(\(_, i\) => i !== index\) : rows\);\s*\} else if/);
    expect(entry).toContain("equipmentRowsRef.current[index]?.[equipmentRowToken] === expectedEquipmentToken");
    expect(edit).toContain("equipmentEditIdentity(rows[index]) === expectedEquipmentIdentity");
    expect(edit).toContain("editCreationKey: newEntryKey()");
  });
});