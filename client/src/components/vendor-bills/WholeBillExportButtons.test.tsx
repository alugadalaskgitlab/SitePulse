// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FormEvent } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import WholeBillExportButtons from "./WholeBillExportButtons";
import { saveWholeBillFile } from "./wholeBillExport";
import type { WholeBillSnapshot } from "./wholeBillSnapshot";

vi.mock("./wholeBillExport", () => ({ saveWholeBillFile: vi.fn() }));
const save = vi.mocked(saveWholeBillFile);
const snapshot = (): WholeBillSnapshot => ({
  companyName: "HLC", vendorName: "NARASIMHULU", billNo: "VB-128", billDate: "2026-10-04",
  periodFrom: "2026-08-01", periodTo: "2026-10-04", site: "Kondapur", billType: "material",
  billTypeLabel: "MATERIAL SUPPLY", saved: true, status: "paid", generatedAt: "04 Oct 2026 14:23",
  sections: [], calendars: [],
  totals: { subtotal: 483.17, gst: [], totalGst: 0, adjustments: [],
    tds: { label: "IT TDS", amount: 0 }, netPayable: 483.17 },
});
beforeEach(() => {
  vi.resetAllMocks();
  save.mockResolvedValue({ cancelled: false, filename: "bill.xlsx", notes: [] });
});
afterEach(cleanup);

describe("whole-bill export controls wiring", () => {
  it.each([
    [false, false], [true, true], [false, true],
  ])("renders no controls in DOM for permission=%s / field engineer=%s", (canExport, isFieldEngineer) => {
    const getSnapshot = vi.fn(snapshot);
    const { container } = render(<WholeBillExportButtons canExport={canExport}
      isFieldEngineer={isFieldEngineer} position="header" getSnapshot={getSnapshot} />);
    expect(container.innerHTML).toBe("");
    expect(getSnapshot).not.toHaveBeenCalled();
  });
  it.each(["draft", "verified", "approved", "paid"])("exports status %s without a status disable", async status => {
    const current = { ...snapshot(), status };
    const getSnapshot = vi.fn(() => current);
    render(<WholeBillExportButtons canExport position="header" getSnapshot={getSnapshot} />);
    const excel = screen.getByTestId("button-export-whole-bill-excel-header");
    expect((excel as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(excel);
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].status).toBe(status);
    expect(save.mock.calls[0][1]).toBe("xlsx");
    expect(getSnapshot).toHaveBeenCalledOnce();
  });
  it("captures live unsaved values only on click, never submits the bill form", async () => {
    const submit = vi.fn((event: FormEvent) => event.preventDefault());
    let current = snapshot();
    const getSnapshot = vi.fn(() => current);
    render(<form onSubmit={submit}><WholeBillExportButtons canExport position="footer" getSnapshot={getSnapshot} /></form>);
    expect(getSnapshot).not.toHaveBeenCalled();
    current = { ...current, saved: false, vendorName: "NARA — edited", totals: { ...current.totals, netPayable: 941.37 } };
    fireEvent.click(screen.getByTestId("button-export-whole-bill-pdf-footer"));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].totals.netPayable).toBe(941.37);
    expect(save.mock.calls[0][0].saved).toBe(false);
    expect(save.mock.calls[0][0]).not.toBe(current);
    expect(save.mock.calls[0][1]).toBe("pdf");
    expect(submit).not.toHaveBeenCalled();
  });
  it("supports both header/footer controls with distinct verification selectors", () => {
    render(<><WholeBillExportButtons canExport position="header" getSnapshot={snapshot} />
      <WholeBillExportButtons canExport position="footer" getSnapshot={snapshot} /></>);
    expect(screen.getAllByRole("button", { name: "EXPORT EXCEL" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "EXPORT PDF" })).toHaveLength(2);
  });
  it("shows export error and retries the same format against current state", async () => {
    save.mockRejectedValueOnce(new Error("No space")).mockResolvedValueOnce({ cancelled: false, filename: "bill.pdf", notes: [] });
    render(<WholeBillExportButtons canExport position="header" getSnapshot={snapshot} />);
    fireEvent.click(screen.getByTestId("button-export-whole-bill-pdf-header"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("No space"));
    fireEvent.click(screen.getByRole("button", { name: "Retry export" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][1]).toBe("pdf");
  });
  it("does not show a failure after save picker cancellation", async () => {
    save.mockResolvedValueOnce({ cancelled: true, filename: "bill.pdf", notes: [] });
    render(<WholeBillExportButtons canExport position="header" getSnapshot={snapshot} />);
    fireEvent.click(screen.getByTestId("button-export-whole-bill-pdf-header"));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});