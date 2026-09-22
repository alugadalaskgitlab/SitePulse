// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { readFileSync } from "node:fs";
import { deliveryProgress, DestinationFields, PurchaseIndentDeliveryPanel } from "@/components/purchase-indent-delivery";

afterEach(cleanup);
const item = { id: 12, description: "WMM", qty: 1500, uom: "MT", requiredBy: "2026-02-10", purchaseStatus: "ordered", deliveredQty: 600 };
const today = new Date(2026, 1, 20);
describe("PI-01 delivery display", () => {
  it("keeps partial overdue progress informative and prioritizes Delivered over dates", () => {
    expect(deliveryProgress(item, null, today)).toBe("600 of 1,500 MT delivered — partially delivered · past required date");
    expect(deliveryProgress({ ...item, deliveredQty: 1500 }, null, today)).toMatch(/^Delivered/);
    expect(deliveryProgress({ ...item, deliveredQty: 0 }, null, today)).toMatch(/^Overdue — 0 of/);
    expect(deliveryProgress({ ...item, qtyPurchased: 600 }, null, today)).toMatch(/^Delivered/);
  });
  it("shows near dates but not every future date as due soon", () => {
    expect(deliveryProgress({ ...item, deliveredQty: 0, requiredBy: "2026-02-20" }, null, today)).toMatch(/^Due today/);
    expect(deliveryProgress({ ...item, deliveredQty: 0, requiredBy: "2026-02-22" }, null, today)).toMatch(/^Due soon/);
    expect(deliveryProgress({ ...item, deliveredQty: 0, requiredBy: "2026-03-22" }, null, today)).toMatch(/^Pending/);
  });
  it("does not preselect a destination and requires a site choice", () => {
    const onChange = vi.fn();
    const { rerender } = render(<DestinationFields value="" siteId="" sites={[{ id: 3, name: "Site A" }]} onChange={onChange} id="new" />);
    expect(screen.getByLabelText("Delivery destination")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Delivery destination"), { target: { value: "site" } });
    expect(onChange).toHaveBeenCalledWith("site", "");
    rerender(<DestinationFields value="site" siteId="" sites={[{ id: 3, name: "Site A" }]} onChange={onChange} id="new" />);
    expect(screen.getByLabelText("Receiving site")).toHaveValue("");
  });
  it("shows receipt and trip quantities together including excluded evidence", () => {
    render(<PurchaseIndentDeliveryPanel item={{ ...item, deliveryEvidence: [
      { kind: "receipt", id: 1, date: "2026-02-11", quantity: 400, uom: "MT", status: "active", countedQty: 400 },
      { kind: "trip", id: 2, date: "2026-02-12", quantity: 200, uom: "MT", status: "active", countedQty: 200 },
      { kind: "trip", id: 3, date: "2026-02-12", quantity: 20, uom: "Cum", status: "cancelled", countedQty: 0 },
    ] }} sites={[]} canEdit={false} onSave={vi.fn()} />);
    expect(screen.getByText("Plant receipt #1")).toBeInTheDocument();
    expect(screen.getByText("Site trip #2")).toBeInTheDocument();
    expect(screen.getByText("400 MT")).toBeInTheDocument();
    expect(screen.getByText("200 MT")).toBeInTheDocument();
    expect(screen.getByText("cancelled")).toBeInTheDocument();
  });
  it("allows legacy ordered destination correction and surfaces save errors", async () => {
    const save = vi.fn().mockRejectedValue(new Error("No permission"));
    render(<PurchaseIndentDeliveryPanel item={item} sites={[{ id: 3, name: "Site A" }]} canEdit onSave={save} />);
    fireEvent.click(screen.getByText("Confirm destination"));
    expect(screen.getByText("Save destination")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Delivery destination"), { target: { value: "site" } });
    expect(screen.getByText("Save destination")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Receiving site"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Save destination"));
    await waitFor(() => expect(save).toHaveBeenCalledWith(12, "site", 3));
    expect(await screen.findByRole("alert")).toHaveTextContent("No permission");
  });
  it("routes confirmed destinations to the existing recording paths with PI linkage", () => {
    const props = { sites: [{ id: 3, name: "Site A" }], canEdit: true, onSave: vi.fn(), indentId: 21, indentNo: "HLC/PI/A/2026/0001" };
    const { rerender } = render(<PurchaseIndentDeliveryPanel {...props} item={{ ...item, receivingLocation: "site", receivingSiteId: 3 }} />);
    expect(screen.getByText("Log Site Delivery →")).toHaveAttribute("href", expect.stringContaining("/site/material-trips?piIndentId=21&piItemId=12"));
    rerender(<PurchaseIndentDeliveryPanel {...props} item={{ ...item, receivingLocation: "hmp_plant" }} />);
    expect(screen.getByText("Record Plant Receipt →")).toHaveAttribute("href", expect.stringContaining("/plant/material-receipts?autoOpen=1&piRef="));
    expect(screen.queryByText("Log Site Delivery →")).not.toBeInTheDocument();
  });
  it("guards bulk spec fields and all legacy spec display surfaces", () => {
    const source = readFileSync("client/src/pages/PurchaseIndents.tsx", "utf8");
    expect(source).toMatch(/formPiType !== "material" && <div[^]*?SPEC \/ DIMENSIONS[^]*?input-item-partno/);
    for (const line of source.split("\n").filter(l => l.includes("(item as any).spec") && (l.includes("<p") || l.includes("<span") || l.includes("{item.description}")))) {
      expect(line).toContain('piType !== "material"');
    }
    expect(source).toContain('data-testid={`list-delivery-progress-${item.id}`}');
    expect(source).toContain("PurchaseIndentDeliveryPanel");
  });
});