// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useState } from "react";
import { AttachmentViewer } from "./AttachmentViewer";
import { DocumentPreviewHost } from "./DocumentPreviewHost";
import { InstalledDocumentLink } from "./InstalledDocumentLink";

const pdfAttachment = {
  id: 901,
  fileName: "invoice.pdf",
  objectPath: "/objects/invoice-901.pdf",
  mimeType: "application/pdf",
  caption: "Invoice",
} as any;

function setInstalledMode(installed: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: installed && query === "(display-mode: standalone)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  Object.defineProperty(navigator, "standalone", { configurable: true, value: false });
}

function ViewerHarness({ attachment }: { attachment: any }) {
  const [active, setActive] = useState(attachment);
  return <AttachmentViewer attachment={active} onClose={() => setActive(null)} />;
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", window.location.href);
  vi.restoreAllMocks();
});

describe("installed-app document viewing", () => {
  it("keeps PDFs in-app with no new-tab action and visible Close controls in standalone mode", () => {
    setInstalledMode(true);
    render(<ViewerHarness attachment={pdfAttachment} />);

    expect(screen.getByTestId("viewer-pdf-901")).toBeInTheDocument();
    expect(screen.getByTestId("viewer-pdf-901")).toHaveClass("h-full", "min-h-0");
    expect(screen.queryByText("Open in new tab")).not.toBeInTheDocument();
    expect(screen.getByTestId("button-close-attachment-viewer-top")).toBeInTheDocument();
    expect(screen.getByTestId("button-close-attachment-viewer")).toBeInTheDocument();
    expect(screen.getByTestId("button-download-attachment")).toBeInTheDocument();
  });

  it("preserves the new-tab action in a regular browser tab", () => {
    setInstalledMode(false);
    render(<ViewerHarness attachment={pdfAttachment} />);

    expect(screen.getByTestId("viewer-pdf-901")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in new tab" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Download" })).toBeInTheDocument();
  });

  it("shows phone images full-width with pinch and pan enabled", () => {
    setInstalledMode(true);
    render(<ViewerHarness attachment={{ ...pdfAttachment, fileName: "photo.jpg", mimeType: "image/jpeg" }} />);

    const image = screen.getByTestId("viewer-image-901");
    expect(image).toHaveClass("w-full");
    expect(image).toHaveStyle({ touchAction: "pan-x pan-y pinch-zoom" });
  });

  it("routes report links to the shared in-app PDF viewer in standalone mode", async () => {
    setInstalledMode(true);
    render(
      <>
        <DocumentPreviewHost />
        <InstalledDocumentLink href="/api/reports/invoice.pdf" fileName="invoice.pdf" title="Invoice PDF">
          Invoice PDF
        </InstalledDocumentLink>
      </>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Invoice PDF" }));
    expect(await screen.findByTestId("viewer-pdf-document")).toBeInTheDocument();
    expect(screen.getByTestId("button-close-attachment-viewer-top")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("link", { name: "Open in new tab" })).not.toBeInTheDocument());
  });

  it("keeps document links opening a new tab in normal browser mode", () => {
    setInstalledMode(false);
    render(
      <InstalledDocumentLink href="/api/reports/invoice.pdf" fileName="invoice.pdf">
        Open invoice
      </InstalledDocumentLink>,
    );
    expect(screen.getByRole("link", { name: "Open invoice" })).toHaveAttribute("target", "_blank");
  });
});
