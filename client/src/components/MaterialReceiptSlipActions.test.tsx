// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { apiRequestMock, buildPdfMock, invalidateMock, toastMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  buildPdfMock: vi.fn(),
  invalidateMock: vi.fn(),
  toastMock: vi.fn(),
}));
const originalOpen = window.open;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: apiRequestMock,
  queryClient: { invalidateQueries: invalidateMock },
}));
vi.mock("@/lib/materialReceiptSlipPdf", () => ({
  buildMaterialReceiptSlipPdf: buildPdfMock,
  materialReceiptSlipCaption: () => "Receipt caption",
  materialReceiptSlipFilename: () => "receipt.pdf",
}));

import { MaterialReceiptSlipActions } from "./MaterialReceiptSlipActions";

const company = { name: "Highlane Constructions" };
const record = {
  kind: "plant" as const,
  id: 64,
  date: "2026-11-01",
  time: "10:42",
  materialName: "WMM",
  quantity: 90,
  uom: "MT",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  delete (navigator as any).share;
  delete (navigator as any).canShare;
  Object.defineProperty(window, "open", { configurable: true, value: originalOpen });
  if (originalCreateObjectURL) Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
  else delete (URL as any).createObjectURL;
  if (originalRevokeObjectURL) Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL });
  else delete (URL as any).revokeObjectURL;
});

describe("receipt slip actions", () => {
  it("shows a standard-size WhatsApp action and a View receipt link, without Save PDF", () => {
    render(<MaterialReceiptSlipActions record={record} company={company} />);
    const sendButton = screen.getByRole("button", { name: "Send on WhatsApp" });
    expect(sendButton).toBeTruthy();
    expect(sendButton.className).not.toContain("w-full");
    expect(screen.getByRole("button", { name: "View receipt" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Save PDF/i })).toBeNull();
  });

  it("uses the revised-receipt label when supplied by the edit flow", () => {
    render(
      <MaterialReceiptSlipActions
        record={record}
        company={company}
        sendLabel="Send revised on WhatsApp"
      />,
    );
    expect(screen.getByRole("button", { name: "Send revised on WhatsApp" })).toBeTruthy();
  });

  it("renders the expected list statuses and hides pre-rollout records", () => {
    const { rerender } = render(
      <MaterialReceiptSlipActions record={{ ...record, slipSendTrackingEnabled: true, slipSendWindowOpen: true }} company={company} mode="row" />,
    );
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();

    rerender(<MaterialReceiptSlipActions
      record={{ ...record, slipSendTrackingEnabled: true, slipSendWindowOpen: false }}
      company={company}
      mode="row"
    />);
    expect(screen.getByText("Not sent")).toBeTruthy();

    rerender(<MaterialReceiptSlipActions
      record={{ ...record, slipSendTrackingEnabled: true, slipSendWindowOpen: false, slipSharedAt: "2026-11-01T04:00:00.000Z" }}
      company={company}
      mode="row"
    />);
    expect(screen.getByText(/✓ Sent/)).toBeTruthy();

    rerender(<MaterialReceiptSlipActions
      record={{
        ...record,
        slipSendTrackingEnabled: true,
        slipSendWindowOpen: true,
        slipSharedAt: "2026-11-01T04:00:00.000Z",
        latestEditAt: "2026-11-01T04:30:00.000Z",
      }}
      company={company}
      mode="row"
    />);
    expect(screen.getByRole("button", { name: "Send revised" })).toBeTruthy();

    rerender(<MaterialReceiptSlipActions record={record} company={company} mode="row" />);
    expect(screen.queryByText("Not sent")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });

  it("does not mark a receipt shared when native sharing is cancelled", async () => {
    buildPdfMock.mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
    const share = vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    render(<MaterialReceiptSlipActions record={record} company={company} />);

    fireEvent.click(screen.getByRole("button", { name: "Send on WhatsApp" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("records a native file share only after the share promise resolves", async () => {
    buildPdfMock.mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    apiRequestMock.mockResolvedValue({ ok: true });
    render(<MaterialReceiptSlipActions record={record} company={company} />);

    fireEvent.click(screen.getByRole("button", { name: "Send on WhatsApp" }));
    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith("POST", "/api/material-receipts/64/slip-shared"));
    expect(invalidateMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText("✓ Sent")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Send again" })).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: "Send on WhatsApp" })).toBeNull();
  });

  it("downloads and opens WhatsApp when file sharing is unavailable", async () => {
    buildPdfMock.mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
    apiRequestMock.mockResolvedValue({ ok: true });
    const open = vi.fn();
    Object.defineProperty(window, "open", { configurable: true, value: open });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:receipt") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<MaterialReceiptSlipActions record={record} company={company} />);

    fireEvent.click(screen.getByRole("button", { name: "Send on WhatsApp" }));
    await waitFor(() => expect(apiRequestMock).toHaveBeenCalled());
    expect(open).toHaveBeenCalledWith("https://wa.me/?text=Receipt%20caption", "_blank", "noopener,noreferrer");
    expect(toastMock).toHaveBeenCalledWith({ title: "PDF downloaded — attach it in WhatsApp." });
  });

  it("keeps the preview footer to Send on WhatsApp only", async () => {
    buildPdfMock.mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:test") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    render(<MaterialReceiptSlipActions record={record} company={company} />);
    fireEvent.click(screen.getByRole("button", { name: "View receipt" }));

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send on WhatsApp" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Save PDF/i })).toBeNull();
  });
});
