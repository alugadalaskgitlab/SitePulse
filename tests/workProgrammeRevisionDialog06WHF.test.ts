/**
 * Instruction 06W-HF — road-row revision dialogs must outlive the Radix menu.
 *
 * The page is intentionally tested as a render-boundary contract: dropdown
 * content is transient by design, so menu items may only send a request to a
 * ScheduleRevisionActions owner rendered after the DropdownMenu.
 */
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

async function stretchRowSource() {
  const source = await readFile("client/src/pages/WorkProgramme.tsx", "utf8");
  const start = source.indexOf("function StretchRow(");
  const end = source.indexOf("function StructureLocationRow(", start);
  return source.slice(start, end);
}

describe("06W-HF: persistent schedule revision dialog ownership", () => {
  it("routes road-row menu selections to a persistent dialog owner outside DropdownMenuContent", async () => {
    const source = await stretchRowSource();
    const contentStart = source.indexOf("<DropdownMenuContent");
    const menuItems = source.indexOf("<ScheduleRevisionMenuItems", contentStart);
    const contentEnd = source.indexOf("</DropdownMenuContent>", menuItems);
    const dropdownEnd = source.indexOf("</DropdownMenu>", contentEnd);
    const persistentOwner = source.indexOf("<ScheduleRevisionActions", dropdownEnd);

    expect(contentStart).toBeGreaterThanOrEqual(0);
    expect(menuItems).toBeGreaterThan(contentStart);
    expect(contentEnd).toBeGreaterThan(menuItems);
    expect(dropdownEnd).toBeGreaterThan(contentEnd);
    expect(persistentOwner).toBeGreaterThan(dropdownEnd);
    expect(source.slice(contentStart, contentEnd)).not.toContain("<ScheduleRevisionActions");
    expect(source.slice(persistentOwner, persistentOwner + 360)).toContain('variant="dialog-only"');
    expect(source.slice(persistentOwner, persistentOwner + 360)).toContain("requestedAction={scheduleRevisionAction}");
  });

  it("keeps Revise Schedule and Schedule History as normal-closing menu actions", async () => {
    const source = await readFile("client/src/pages/WorkProgramme.tsx", "utf8");
    const menuStart = source.indexOf("function ScheduleRevisionMenuItems(");
    const menuEnd = source.indexOf("// ─── Coverage Badge", menuStart);
    const menu = source.slice(menuStart, menuEnd);

    expect(menu).toContain('onSelect={() => onRequestAction("revise")}');
    expect(menu).toContain('onSelect={() => onRequestAction("history")}');
    expect(menu).toContain("Revise Schedule");
    expect(menu).toContain("Schedule History");
    expect(menu).not.toContain("preventDefault");
  });

  it("opens revision/history from the persistent one-shot action signal without changing programme APIs", async () => {
    const source = await readFile("client/src/pages/WorkProgramme.tsx", "utf8");
    const ownerStart = source.indexOf("function ScheduleRevisionActions(");
    const ownerEnd = source.indexOf("function ScheduleRevisionMenuItems(", ownerStart);
    const owner = source.slice(ownerStart, ownerEnd);

    expect(owner).toContain('if (requestedAction === "revise") beginRevision()');
    expect(owner).toContain("else setHistoryOpen(true)");
    expect(owner).toContain("onRequestedActionHandled?.()");
    expect(owner).toContain("revision-preview");
    expect(owner).toContain("revise-schedule");
    expect(owner).toContain("Preview revision");
    expect(owner).toContain("Confirm & commit");
  });

  it("leaves the structure/location inline instance unchanged", async () => {
    const source = await readFile("client/src/pages/WorkProgramme.tsx", "utf8");
    const structureStart = source.indexOf("function StructureLocationRow(");
    const structureEnd = source.indexOf("function StructureImportWizard(", structureStart);
    const structure = source.slice(structureStart, structureEnd);

    expect(structure).toContain("<ScheduleRevisionActions bar={bar} projectId={projectId} />");
    expect(structure).not.toContain("ScheduleRevisionMenuItems");
  });
});