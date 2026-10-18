// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CompleteVendorBillExportMenu, { completeVendorBillExportUrl } from "../client/src/components/vendor-bills/CompleteVendorBillExportMenu";

afterEach(cleanup);

describe("complete Vendor Bills export control", () => {
  it("requests the complete endpoint without page filters", () => {
    expect(completeVendorBillExportUrl("xlsx")).toBe("/api/vendor-bills/export?format=xlsx");
    expect(completeVendorBillExportUrl("json")).toBe("/api/vendor-bills/export?format=json");
  });

  it("requires both financial visibility and export access", () => {
    const onExport = vi.fn();
    const { rerender } = render(
      <CompleteVendorBillExportMenu canViewFinancials={false} canExport={true} isAdmin={true} isOwner={false} onExport={onExport} />,
    );
    expect(screen.queryByTestId("button-export-all-vendor-bills")).toBeNull();

    rerender(<CompleteVendorBillExportMenu canViewFinancials={true} canExport={false} isAdmin={true} isOwner={false} onExport={onExport} />);
    expect(screen.queryByTestId("button-export-all-vendor-bills")).toBeNull();

    rerender(<CompleteVendorBillExportMenu canViewFinancials={true} canExport={true} isAdmin={false} isOwner={false} onExport={onExport} />);
    expect(screen.queryByTestId("button-export-all-vendor-bills")).toBeNull();

    rerender(<CompleteVendorBillExportMenu canViewFinancials={true} canExport={true} isAdmin={true} isOwner={false} onExport={onExport} />);
    expect(screen.getByText("Export all bills in your permitted scope (ignores page filters)")).toBeTruthy();
  });

  it("offers both workbook and JSON choices", async () => {
    const onExport = vi.fn();
    render(<CompleteVendorBillExportMenu canViewFinancials={true} canExport={true} isAdmin={true} isOwner={false} onExport={onExport} />);

    const trigger = screen.getByTestId("button-export-all-vendor-bills");
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Excel workbook (.xlsx)" }));
    expect(onExport).toHaveBeenCalledWith("xlsx");

    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "JSON file (.json)" }));
    expect(onExport).toHaveBeenCalledWith("json");
  });
});
