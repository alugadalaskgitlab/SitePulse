// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { emptyMatrix } from "@shared/permissions";
import { HierarchicalPermissionsEditor } from "./HierarchicalPermissionsEditor";
import { type PreviewOverrides } from "./model";

afterEach(cleanup);
function fixture(options: { privileged?: boolean; partial?: boolean; creation?: boolean } = {}) {
  const baseline = emptyMatrix();
  baseline.site_hub.export = true;
  baseline.site_procurement.approve = true;
  const changed = vi.fn();
  const reviewed = vi.fn();
  function Harness() {
    const [matrix, setMatrix] = useState(baseline);
    const [previews, setPreviews] = useState<PreviewOverrides>({});
    return <HierarchicalPermissionsEditor baseline={baseline} value={matrix}
      onChange={next => { changed(next); setMatrix(next); }}
      canGrant={(s, a) => !options.partial || s === "site_dprs" && a === "view"}
      target={{ fullName: "Nirmala Rao", isAdmin: options.privileged, isOwner: options.privileged, notificationsEnabled: false }}
      previews={previews} onPreviewsChange={setPreviews} onReviewed={reviewed}
      readOnly={options.creation} context={options.creation ? "creation" : "existing"}
    />;
  }
  render(<Harness />);
  return { changed, reviewed, baseline };
}
function search(value: string) {
  fireEvent.change(screen.getByRole("searchbox", { name: "Search functions and actions" }), { target: { value } });
}

describe("authority workbench interactions (isolated, not signed-in acceptance)", () => {
  it("opening and searching are inert; actual requirement subfunctions appear", () => {
    const { changed } = fixture();
    expect(screen.getByText("Allocate / update labour status")).toBeTruthy();
    expect(screen.getByText("Decide revision")).toBeTruthy();
    expect(screen.getByText("Confirm readiness")).toBeTruthy();
    search("VendorBills");
    expect(screen.getByText("Record payment")).toBeTruthy();
    expect(screen.getByText("Mark paid")).toBeTruthy();
    expect(changed).not.toHaveBeenCalled();
  });
  it("edits one bit without normalizing hidden grants and reviews exact legacy change", () => {
    const { changed, reviewed } = fixture();
    fireEvent.click(screen.getByRole("checkbox", { name: "Site DPRs — File & View — View" }));
    expect(changed).toHaveBeenCalledTimes(1);
    const next = changed.mock.calls[0][0];
    expect(next.site_dprs.view).toBe(true);
    expect(next.site_hub.export).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Review 1 legacy/ }));
    const review = screen.getByRole("region", { name: "Permission change review" });
    expect(within(review).getByText(/Grant bit/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm legacy change review" }));
    expect(reviewed).toHaveBeenCalledWith(JSON.stringify(next));
  });
  it("proposal-only deny appears separately and never changes legacy bits", () => {
    const { changed } = fixture();
    const select = screen.getByRole("combobox", { name: "Allocate / update labour status proposed override" });
    fireEvent.change(select, { target: { value: "deny" } });
    expect(screen.getByText(/Not revoked./)).toBeTruthy();
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Review 0 legacy \+ 1 proposed-only/ }));
    expect(screen.getByText("No persisted matrix changes.")).toBeTruthy();
    const review = screen.getByRole("region", { name: "Permission change review" });
    expect(within(review).getByText(/simulation only, not enforced/)).toBeTruthy();
    fireEvent.change(select, { target: { value: "inherit" } });
    expect(screen.queryByText(/Not revoked./)).toBeNull();
  });
  it("shared hub entries retain the same proposed choice", () => {
    fixture();
    const select = screen.getByRole("combobox", { name: "Allocate / update labour status proposed override" });
    fireEvent.change(select, { target: { value: "deny" } });
    search("MyPlans");
    const another = screen.getByRole("combobox", { name: "Allocate / update labour status proposed override" }) as HTMLSelectElement;
    expect(another.value).toBe("deny");
    fireEvent.change(screen.getByRole("combobox", { name: "Filter authority" }), { target: { value: "changed" } });
    expect(screen.getByText("My Plans", { selector: "h3" })).toBeTruthy();
  });
  it("shows unavailable actions without checkboxes and respects partial delegation", () => {
    fixture({ partial: true });
    expect((screen.getByRole("checkbox", { name: "Site DPRs — File & View — View" }) as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByRole("checkbox", { name: "Site DPRs — File & View — Create" }) as HTMLInputElement).disabled).toBe(true);
    search("legacy:hmp_operations");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getAllByText("Unavailable")).toHaveLength(8);
  });
  it("keeps creation review read-only for persisted settings and proposed overrides active", () => {
    const { changed } = fixture({ creation: true });
    const persisted = screen.getByRole("checkbox", { name: "Site DPRs — File & View — View" }) as HTMLInputElement;
    expect(persisted.disabled).toBe(true);
    expect(screen.getByText(/Individual persisted edits are available after creation/)).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Allocate / update labour status proposed override" }), { target: { value: "allow" } });
    expect(changed).not.toHaveBeenCalled();
    expect(screen.getByText(/Not granted./)).toBeTruthy();
  });
  it("discloses privilege bypass without pretending filters show effective access", () => {
    fixture({ privileged: true });
    expect(screen.getByText(/Privileged account: ordinary permission switches/)).toBeTruthy();
    expect(screen.getByRole("option", { name: "Stored grants: on" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Stored grants: off" })).toBeTruthy();
    expect(screen.getByText(/not authenticated runtime access/)).toBeTruthy();
  });
  it("renders a composed empty state and clears the search", () => {
    fixture();
    search("no such function qqqqx");
    expect(screen.getByText("No matching functions")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear search & filters" }));
    expect(screen.queryByText("No matching functions")).toBeNull();
  });
  it("searches actual tabs and distinguishes system-only operations", () => {
    fixture();
    search("WorkProgramme");
    expect(screen.getByText(/Tabs \/ nested views/)).toBeTruthy();
    expect(screen.getAllByText("Gantt").length).toBeGreaterThan(0);
    search("system:background");
    expect(screen.getByText(/no per-user execution switches/)).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("combobox", { name: /proposed override/ })).toBeNull();
  });
});
