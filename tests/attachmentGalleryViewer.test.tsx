// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AttachmentGrid } from "@/components/AttachmentGallery";
import { getSafeAttachmentObjectPath } from "@/components/AttachmentViewer";
import type { Attachment } from "@shared/schema";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 17,
    moduleType: "site_purchase",
    linkedRecordId: 99,
    siteId: null,
    boqProjectId: null,
    boqItemId: null,
    structureId: null,
    equipmentId: null,
    materialId: null,
    fileName: "bill.jpg",
    objectPath: "/objects/uploads/bill.jpg",
    mimeType: "image/jpeg",
    fileSize: 100,
    caption: "Bill photo",
    progressEntryKey: null,
    docType: "bill",
    uploadedBy: 3,
    uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
    uploadedByName: "A. Operator",
    isLinked: false,
    ...overrides,
  };
}

function renderGrid(items: Attachment[]) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AttachmentGrid
        items={items}
        moduleType="site_purchase"
        linkedRecordId={99}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    setPointerCapture: { configurable: true, value: () => undefined },
    releasePointerCapture: { configurable: true, value: () => undefined },
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  window.history.replaceState({ fixture: "attachment-grid" }, "", "/receipts#sentinel");
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  window.history.replaceState({ fixture: "attachment-grid" }, "", "/receipts#sentinel");
});

describe("shared attachment gallery viewer", () => {
  it("fits an image in an in-app dialog and closes without changing the route", async () => {
    renderGrid([attachment()]);

    fireEvent.click(screen.getByTestId("button-open-attachment-17"));
    expect(await screen.findByTestId("viewer-image-17")).toBeInTheDocument();
    expect(screen.getByTestId("button-close-attachment-viewer")).toHaveTextContent("Close");
    expect(window.location.pathname + window.location.hash).toBe("/receipts#sentinel");

    fireEvent.click(screen.getByTestId("button-close-attachment-viewer"));
    await waitFor(() => expect(screen.queryByTestId("attachment-viewer")).not.toBeInTheDocument());
    expect(window.location.pathname + window.location.hash).toBe("/receipts#sentinel");
    await waitFor(() => expect(window.history.state).toEqual({ fixture: "attachment-grid" }));
  });

  it("closes on browser back and supports a fresh reopen without stacking entries", async () => {
    renderGrid([attachment()]);

    fireEvent.click(screen.getByTestId("button-open-attachment-17"));
    await screen.findByTestId("viewer-image-17");
    const historyLengthWithViewer = window.history.length;

    window.history.back();
    await waitFor(() => expect(screen.queryByTestId("attachment-viewer")).not.toBeInTheDocument());
    expect(window.location.pathname + window.location.hash).toBe("/receipts#sentinel");

    fireEvent.click(screen.getByTestId("button-open-attachment-17"));
    await screen.findByTestId("viewer-image-17");
    expect(window.history.length).toBe(historyLengthWithViewer);
  });

  it("shows a safe PDF preview with explicit open/download actions", async () => {
    const pdf = attachment({
      id: 18,
      fileName: "invoice.pdf",
      objectPath: "/objects/uploads/invoice.pdf",
      mimeType: "application/pdf",
    });
    renderGrid([pdf]);

    fireEvent.click(screen.getByTestId("button-open-attachment-18"));
    const frame = await screen.findByTestId("viewer-pdf-18");
    expect(frame).toHaveAttribute("sandbox", "allow-same-origin");
    expect(screen.getByRole("link", { name: /open in new tab/i })).toHaveAttribute(
      "href",
      "/objects/uploads/invoice.pdf",
    );
    expect(screen.getByRole("link", { name: /download/i })).toHaveAttribute(
      "download",
      "invoice.pdf",
    );
  });

  it("rejects unsafe attachment paths without creating preview or navigation actions", async () => {
    expect(getSafeAttachmentObjectPath("javascript:alert(1)")).toBeNull();
    expect(getSafeAttachmentObjectPath("data:text/html,unsafe")).toBeNull();
    expect(getSafeAttachmentObjectPath("https://evil.example/objects/file.jpg")).toBeNull();
    expect(getSafeAttachmentObjectPath("/objects/uploads/legacy-file.jpg")).toBe(
      "/objects/uploads/legacy-file.jpg",
    );

    renderGrid(
      [attachment({
        id: 21,
        objectPath: "javascript:alert(1)",
        mimeType: "image/jpeg",
      })],
    );
    fireEvent.click(screen.getByTestId("button-open-attachment-21"));
    expect(await screen.findByText("This attachment path is not available safely.")).toBeInTheDocument();
    expect(screen.queryByTestId("viewer-image-21")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open in new tab/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /download/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-close-attachment-viewer"));
    await waitFor(() => expect(window.history.state).toEqual({ fixture: "attachment-grid" }));
  });

  it("keeps the Linked badge, uploader/date caption, and delete behavior unchanged", () => {
    renderGrid([
      attachment({ id: 19, isLinked: true }),
      attachment({ id: 20, isLinked: false }),
    ]);

    expect(screen.getByText("Linked")).toBeInTheDocument();
    expect(screen.getAllByTestId(/text-attachment-meta-/)).toHaveLength(2);
    expect(screen.queryByTestId("button-delete-attachment-19")).not.toBeInTheDocument();
    expect(screen.getByTestId("button-delete-attachment-20")).toBeInTheDocument();
  });
});