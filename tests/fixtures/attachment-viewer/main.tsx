import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, useLocation } from "wouter";
import { AttachmentGrid } from "@/components/AttachmentGallery";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import type { Attachment } from "@shared/schema";
import "../../../client/src/index.css";

const queryClient = new QueryClient();

const attachments: Attachment[] = [
  {
    id: 1,
    moduleType: "site_purchase",
    linkedRecordId: 902,
    siteId: null,
    boqProjectId: null,
    boqItemId: null,
    structureId: null,
    equipmentId: null,
    materialId: null,
    fileName: "site-photo.svg",
    objectPath: "/objects/fixture-photo.svg",
    mimeType: "image/svg+xml",
    fileSize: 1200,
    caption: "Site photo",
    progressEntryKey: null,
    docType: "photo",
    uploadedBy: 41,
    uploadedAt: new Date("2026-02-02T00:00:00.000Z"),
    uploadedByName: "Fixture operator",
    isLinked: false,
  },
  {
    id: 2,
    moduleType: "site_purchase",
    linkedRecordId: 902,
    siteId: null,
    boqProjectId: null,
    boqItemId: null,
    structureId: null,
    equipmentId: null,
    materialId: null,
    fileName: "linked-bill.pdf",
    objectPath: "/objects/fixture-bill.pdf",
    mimeType: "application/pdf",
    fileSize: 1800,
    caption: "Linked bill",
    progressEntryKey: null,
    docType: "bill",
    uploadedBy: 42,
    uploadedAt: new Date("2026-02-03T00:00:00.000Z"),
    uploadedByName: "Accounts operator",
    isLinked: true,
  },
  {
    id: 3,
    moduleType: "site_purchase",
    linkedRecordId: 902,
    siteId: null,
    boqProjectId: null,
    boqItemId: null,
    structureId: null,
    equipmentId: null,
    materialId: null,
    fileName: "delivery-note.txt",
    objectPath: "/objects/fixture-delivery-note.txt",
    mimeType: "text/plain",
    fileSize: 55,
    caption: "Delivery note",
    progressEntryKey: null,
    docType: "other",
    uploadedBy: 43,
    uploadedAt: new Date("2026-02-04T00:00:00.000Z"),
    uploadedByName: "Stores operator",
    isLinked: false,
  },
];

let nextReceiptMountId = 0;

function ReceiptPage() {
  const [submitted, setSubmitted] = useState(false);
  const [, setDirty] = useState(true);
  const [, setLocation] = useLocation();
  const mountId = useRef(`receipt-mount-${++nextReceiptMountId}`).current;
  // This is intentionally the real dirty-form guard used by receipt pages.
  useBeforeUnload(true);

  return (
    <main
      className="min-h-[1800px] bg-slate-100 p-4 text-slate-900 sm:p-8"
      style={{ minHeight: 1800 }}
      data-testid="fixture-page"
    >
      <Dialog open>
        <DialogContent
          className="max-h-[80vh] max-w-3xl overflow-y-auto"
          data-testid="receipt-dialog"
        >
          <DialogHeader>
            <DialogTitle>Receipt evidence</DialogTitle>
            <DialogDescription>
              Dirty receipt-like dialog: viewing an attachment must not trigger its unsaved prompt.
            </DialogDescription>
          </DialogHeader>
          <span className="sr-only" data-testid="receipt-mount-id">{mountId}</span>
          <section className="space-y-5">
            <p className="text-sm text-slate-600">
              This form and scroll sentinel must remain unchanged while a file is viewed.
            </p>
            <label className="block text-sm font-medium">
              Form sentinel
              <input
                defaultValue="FORM SENTINEL RETAINED"
                onChange={() => setDirty(true)}
                data-testid="form-sentinel"
                className="mt-1 block w-full rounded-md border px-3 py-2"
              />
            </label>
            <button
              type="button"
              onClick={() => setSubmitted(true)}
              className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white"
              data-testid="sentinel-action"
            >
              {submitted ? "Saved sentinel" : "Save sentinel"}
            </button>
            <div
              className="h-[620px] rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-4"
              style={{ height: 620 }}
            >
              <p className="text-sm font-semibold">Scroll checkpoint</p>
              <p className="mt-2 text-sm text-slate-600">
                The viewer must return to this exact page and scroll position.
              </p>
            </div>
            <section className="rounded-lg border p-4" data-testid="attachment-section">
              <h2 className="font-semibold">Attachments</h2>
              <p className="mt-1 text-sm text-slate-600">Linked captions and delete affordances are part of the regression check.</p>
              <div className="mt-4">
                <AttachmentGrid items={attachments} moduleType="site_purchase" linkedRecordId={902} />
              </div>
            </section>
            <button
              type="button"
              onClick={() => setLocation("/fixture-other")}
              className="rounded-md border px-3 py-2 text-sm font-medium"
              data-testid="normal-route-navigation"
            >
              Navigate to another route
            </button>
          </section>
        </DialogContent>
      </Dialog>
      <p className="mx-auto mt-16 max-w-3xl text-center text-xs text-slate-500">Page bottom sentinel</p>
    </main>
  );
}

function OtherRoute() {
  return (
    <main className="min-h-screen bg-slate-100 p-8" data-testid="other-route">
      <h1 className="text-2xl font-bold">Other fixture route</h1>
    </main>
  );
}

function FixtureRouter() {
  return (
    <Switch>
      <Route path="/" component={ReceiptPage} />
      <Route component={OtherRoute} />
    </Switch>
  );
}

window.history.replaceState({ fixtureRoute: "before" }, "", "/fixture-before");
window.history.pushState({ fixtureRoute: "other" }, "", "/fixture-other");
window.history.pushState({ fixtureRoute: "receipt" }, "", "/");

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <FixtureRouter />
  </QueryClientProvider>,
);