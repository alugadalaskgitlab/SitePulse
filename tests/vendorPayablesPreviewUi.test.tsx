// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PayablesPreviewPanel from "../client/src/components/vendor-bills/PayablesPreviewPanel";
import { PAYABLES_CATEGORIES, PAYABLES_PREVIEW_LABEL, type VendorPayablesPreview } from "../shared/vendorPayablesPreview";

const mocks = vi.hoisted(() => ({
  request: vi.fn(), download: vi.fn(), update: vi.fn(), toast: vi.fn(), query: vi.fn(),
}));
vi.mock("@/hooks/use-payables-preview", () => ({ requestPayablesPreview: mocks.request, usePayablesPreview: mocks.query }));
vi.mock("@/lib/queryClient", () => ({ queryClient: { setQueryData: mocks.update } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/vendor-bills/payablesPreviewExport", () => ({ exportPayablesPreview: mocks.download }));
const totals = { preTax: 847.3, gst: null, withGst: null };
const preview: VendorPayablesPreview = {
  label: PAYABLES_PREVIEW_LABEL, generatedAt: "2026-06-30T10:11:12Z", vendorName: "KAVERI WORKS",
  periodFrom: "2026-06-01", periodTo: "2026-06-30", siteId: null, siteName: null,
  gstRates: { equipment: null, material: 0, transport: null, labour: null, other: null },
  gstSources: { equipment: "missing", material: "from last bill — check", transport: "missing", labour: "missing", other: "missing" },
  categories: PAYABLES_CATEGORIES.map(category => ({ category, items: [], totals })),
  hireGroups: [], grandTotal: totals, siteTotal: totals, unallocatedTotal: totals,
  warnings: [], excludedCount: 3, unpricedCount: 0,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockReturnValue({ data: preview, isFetching: false, isError: false });
  mocks.request.mockResolvedValue({ ...preview, generatedAt: "2026-06-30T11:12:13Z" });
});
afterEach(cleanup);
function openAndGenerate() {
  render(<PayablesPreviewPanel vendors={["KAVERI WORKS"]} sites={[]} />);
  fireEvent.click(screen.getByRole("button", { name: /Payables preview/ }));
  fireEvent.change(screen.getByLabelText("Vendor"), { target: { value: "KAVERI WORKS" } });
  fireEvent.change(screen.getByLabelText("Period from"), { target: { value: "2026-06-01" } });
  fireEvent.change(screen.getByLabelText("Period to"), { target: { value: "2026-06-30" } });
  fireEvent.click(screen.getByRole("button", { name: "Generate preview" }));
}
describe("VB-EXPORT-01 Part B unsaved panel and export revalidation", () => {
  it("shows explicit-zero suggestion, unknown blank amber inputs including Other, and generation label", () => {
    openAndGenerate();
    expect(screen.getByLabelText("Materials %").getAttribute("value")).toBe("0");
    expect(screen.getByLabelText("Other %").getAttribute("value")).toBe("");
    expect(screen.getByLabelText("Other %").className).toContain("border-amber-400");
    expect(screen.getByText("from last bill — check")).toBeTruthy();
    expect(screen.getByText(PAYABLES_PREVIEW_LABEL)).toBeTruthy();
    expect(screen.getByText(/3 already-billed/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^save(?: bill| draft)?$/i })).toBeNull();
  });
  it.each(["Excel", "PDF"])("%s revalidates endpoint immediately before downloading its fresh canonical data", async format => {
    openAndGenerate();
    fireEvent.click(screen.getByRole("button", { name: `Export ${format}` }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledOnce());
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ vendorName: "KAVERI WORKS", gstRates: {} }));
    expect(mocks.download).toHaveBeenCalledWith(expect.objectContaining({ generatedAt: "2026-06-30T11:12:13Z" }), format === "PDF" ? "pdf" : "xlsx");
    expect(mocks.request.mock.invocationCallOrder[0]).toBeLessThan(mocks.download.mock.invocationCallOrder[0]);
    expect(mocks.update).toHaveBeenCalledOnce();
  });
  it.each(["Excel", "PDF"])("%s does not generate a file after permission rejection", async format => {
    mocks.request.mockRejectedValue(new Error("403: forbidden"));
    openAndGenerate();
    fireEvent.click(screen.getByRole("button", { name: `Export ${format}` }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledOnce());
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("GST edits are unsaved local state and disable downloads until regenerated", () => {
    openAndGenerate();
    fireEvent.change(screen.getByLabelText("Other %"), { target: { value: "12" } });
    expect(screen.getByRole("button", { name: "Export Excel" }).hasAttribute("disabled")).toBe(true);
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Generate preview" }));
    expect(mocks.query).toHaveBeenLastCalledWith(expect.objectContaining({ gstRates: { other: 12 } }));
  });
});