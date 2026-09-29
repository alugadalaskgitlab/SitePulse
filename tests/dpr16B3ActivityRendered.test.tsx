// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DprActivityReadOnly } from "../client/src/components/DprActivityReadOnly";
import { shortItemName } from "../shared/boqItemName";

afterEach(cleanup);

const row = {
  id: 12, entryKey: "stable-12", activity: "Excavation", chainageFrom: "1.000",
  chainageTo: "1.200", side: "LHS", length: 200, width: 6, thickness: 0.5,
  layerNo: 2, quantity: 600, uom: "Cum", boqItemId: 44, programmeBarId: 18,
  personnelIds: [7], materialOutcome: "partly_reusable", reusableQty: 320,
  earthworkArrangementId: 13, quantitySource: "survey", quantitySourceNote: "Measured on site",
};
const boqItem = { id: 44, itemCode: "BOQ-44", description: "Excavation work", displayName: "Excavation", unit: "Cum" };

describe("DPR16 B3 activity summaries", () => {
  it("collapses by default, expands all physical, BOQ, personnel and material facts and collapses again", () => {
    const { container } = render(
      <DprActivityReadOnly item={row} boqItem={boqItem} personnelNames="Ravi Kumar" index={0}>
        <p>Receipt and material-source evidence</p>
      </DprActivityReadOnly>,
    );
    const details = screen.getByTestId("row-progress-0") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByText(/BOQ-44 · Excavation/)).toBeTruthy();
    expect(within(details).getByText(/1.000 → 1.200/)).toBeTruthy();
    expect(within(details).getByText(/Measured: 600 Cum/i)).toBeTruthy();
    expect(within(details).getByText(/BOQ: 600 Cum/i)).toBeTruthy();
    fireEvent.click(within(details).getByText(/Details/));
    expect(details.open).toBe(true);
    for (const fact of ["LHS", "200", "6", "0.5", "Ravi Kumar", "partly reusable", "320", "Linked", "Receipt and material-source evidence"]) {
      expect(within(details).getByText(fact, { exact: true })).toBeTruthy();
    }
    expect(within(details).getByText("Execution arrangement")).toBeTruthy();
    expect(within(details).queryByText("Material source")).toBeNull();
    expect(within(details).getAllByText("600 Cum", { exact: true }).length).toBeGreaterThan(0);
    expect(within(details).getByText("Material outcome")).toBeTruthy();
    expect(within(details).queryByText("BOQ item ID")).toBeNull();
    expect(container.querySelectorAll("input, select, textarea, button")).toHaveLength(0);
    fireEvent.click(within(details).getByText(/Details/));
    expect(details.open).toBe(false);
  });

  it("retains no-site-work descriptions and incidental work without claiming BOQ credit", () => {
    const { rerender } = render(<DprActivityReadOnly index={1} item={{ ...row, noSiteWork: true, noSiteWorkDescription: "Weather interruption" }} />);
    expect(screen.getAllByText("No site work").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText(/Details/));
    expect(screen.getByText("Weather interruption")).toBeTruthy();
    expect(within(screen.getByTestId("row-progress-1")).getByText("BOQ credit").nextElementSibling?.textContent).toBe("—");
    rerender(<DprActivityReadOnly index={1} item={{ ...row, isIncidental: true, incidentalDescription: "Extra verge cleanup" }} boqItem={boqItem} />);
    expect(screen.getByText("BOQ: No BOQ credit")).toBeTruthy();
    expect(screen.getByText("Extra verge cleanup")).toBeTruthy();
  });

  it("uses shared chainage parsing and each route's existing naming contract", () => {
    const chainage = { ...row, activity: "Full activity label", length: null, chainageFrom: "1+200", chainageTo: "1+350" };
    const item = { ...boqItem, displayName: "Saved BOQ name", canonicalDisplayName: "Classification label" };
    const { rerender } = render(<DprActivityReadOnly item={chainage} boqItem={item} index={0} />);
    expect(screen.getByText(/Saved BOQ name/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Details/));
    expect(screen.getByText("150")).toBeTruthy();
    rerender(<DprActivityReadOnly item={chainage} boqItem={item} index={0} nameStyle="activity" />);
    expect(screen.getByText(new RegExp(shortItemName(chainage.activity) || chainage.activity))).toBeTruthy();
    expect(screen.queryByText(/Saved BOQ name/)).toBeNull();
  });

  it("does not infer length over a recorded zero even when chainage implies a positive distance", () => {
    render(<DprActivityReadOnly item={{ ...row, length: 0, chainageFrom: "1+200", chainageTo: "1+350" }} index={2} />);
    fireEvent.click(screen.getByText(/Details/));
    expect(screen.getByText("Length (m)").nextElementSibling?.textContent).toBe("0");
  });

  it("both live read-only routes render the same shared component and keep photo groups", () => {
    for (const page of ["DprDetails", "SiteReport"]) {
      const source = readFileSync(resolve(process.cwd(), `client/src/pages/${page}.tsx`), "utf8");
      expect(source).toContain("<DprActivityReadOnly");
      expect(source).toContain("<DprPhotoGroups");
      expect(source).toContain("<DprEquipmentCompact");
    }
  });
});