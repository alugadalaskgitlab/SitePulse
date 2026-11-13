import { useEffect, useState } from "react";
import { Eye, MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { buildMaterialReceiptSlipPdf, materialReceiptSlipCaption, materialReceiptSlipFilename } from "@/lib/materialReceiptSlipPdf";
import type { MaterialReceiptSlipCompany, MaterialReceiptSlipData } from "@/lib/materialReceiptSlipTypes";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function MaterialReceiptSlipActions({
  record, company, logoFile, mode = "success", sendLabel = "Send on WhatsApp",
}: {
  record: MaterialReceiptSlipData;
  company: MaterialReceiptSlipCompany;
  logoFile?: string | null;
  mode?: "success" | "row";
  sendLabel?: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState<"view" | "send" | null>(null);
  const [hasShared, setHasShared] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  const createPdf = async () => {
    const blob = await buildMaterialReceiptSlipPdf(record, company, logoFile);
    const companyShortName = company.shortName?.trim() || "Your company";
    return { blob, filename: materialReceiptSlipFilename(record, companyShortName), companyShortName };
  };
  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const markShared = async () => {
    const path = record.kind === "plant" ? "material-receipts" : "site-material-trips";
    try {
      await apiRequest("POST", `/api/${path}/${record.id}/slip-shared`);
      queryClient.invalidateQueries({
        predicate: query => typeof query.queryKey[0] === "string" &&
          (query.queryKey[0].startsWith("/api/plant-module/material-receipts") ||
            query.queryKey[0].startsWith("/api/site-material-trips")),
      });
    } catch {
      toast({
        title: "Receipt shared, but status could not be recorded",
        description: "The PDF may already have been shared. Refresh the list to check its status.",
        variant: "destructive",
      });
    }
  };
  const run = async (action: "view" | "send") => {
    setLoadingAction(action);
    try {
      const { blob, filename } = await createPdf();
      if (action === "view") {
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        setPdfUrl(URL.createObjectURL(blob));
        setOpen(true);
      } else {
        const caption = materialReceiptSlipCaption(record, company.shortName?.trim() || "Your company");
        const file = new File([blob], filename, { type: "application/pdf" });
        const shareNavigator = navigator as Navigator & {
          canShare?: (data?: ShareData) => boolean;
        };
        let sharedByFile = false;
        if (typeof shareNavigator.share === "function" && shareNavigator.canShare?.({ files: [file] })) {
          try {
            await shareNavigator.share({ files: [file], text: caption });
            sharedByFile = true;
          } catch (error) {
            const name = error instanceof Error ? error.name : "";
            if (name === "AbortError") throw error;
            if (!(error instanceof TypeError) && name !== "NotSupportedError") throw error;
          }
        }
        if (sharedByFile) {
          await markShared();
          setHasShared(true);
        } else {
          download(blob, filename);
          window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, "_blank", "noopener,noreferrer");
          await markShared();
          setHasShared(true);
          toast({ title: "PDF downloaded — attach it in WhatsApp." });
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast({
        title: action === "send" ? "Could not share the receipt" : "Could not create receipt PDF",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingAction(null);
    }
  };
  if (mode === "row") {
    if (!record.slipSendTrackingEnabled) return null;
    const sharedAt = record.slipSharedAt ? new Date(record.slipSharedAt) : null;
    const validSharedAt = sharedAt && !Number.isNaN(sharedAt.getTime()) ? sharedAt : null;
    const editedAt = record.latestEditAt ? new Date(record.latestEditAt) : null;
    const revised = !!(validSharedAt && editedAt && editedAt.getTime() > validSharedAt.getTime());
    if (validSharedAt && !revised) {
      const sentLabel = new Intl.DateTimeFormat("en-IN", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(validSharedAt);
      return <span className="whitespace-nowrap text-xs text-muted-foreground" data-testid={`receipt-slip-status-${record.kind}-${record.id}`}>✓ Sent {sentLabel}</span>;
    }
    if (record.slipSendWindowOpen) {
      const text = revised ? "Send revised" : "Send";
      return (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto whitespace-nowrap p-0 text-xs text-primary underline-offset-4 hover:underline"
          onClick={(event) => { event.stopPropagation(); void run("send"); }}
          disabled={loadingAction !== null}
          data-testid={`button-receipt-send-${record.kind}-${record.id}`}
        >
          {loadingAction === "send" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <MessageCircle className="mr-1 h-3 w-3" />}
          {text}
        </Button>
      );
    }
    return <span className="whitespace-nowrap text-xs text-muted-foreground" data-testid={`receipt-slip-status-${record.kind}-${record.id}`}>Not sent</span>;
  }

  return <>
    <div className="mt-2 flex items-center gap-3 flex-wrap" data-testid={`receipt-slip-actions-${record.kind}-${record.id}`}>
      {hasShared ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">✓ Sent</span>
          <button
            type="button"
            className="text-xs text-primary underline underline-offset-4"
            onClick={() => void run("send")}
            disabled={loadingAction !== null}
            data-testid={`button-receipt-send-again-${record.kind}-${record.id}`}
          >
            {loadingAction === "send" ? "Sending…" : "Send again"}
          </button>
        </div>
      ) : (
        <Button
          type="button"
          onClick={() => void run("send")}
          disabled={loadingAction !== null}
          data-testid={`button-receipt-send-${record.kind}-${record.id}`}
        >
          {loadingAction === "send" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
          {sendLabel}
        </Button>
      )}
      <button
        type="button"
        className="inline-flex items-center text-sm text-primary underline underline-offset-4"
        onClick={() => void run("view")}
        disabled={loadingAction !== null}
        data-testid={`button-receipt-view-${record.kind}-${record.id}`}
      >
        {loadingAction === "view" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
        View receipt
      </button>
    </div>
    {open && <Dialog open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen && pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
        setPdfUrl(null);
      }
    }}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-5xl flex-col p-4" data-testid={`dialog-receipt-pdf-${record.kind}-${record.id}`}>
        <DialogHeader><DialogTitle>Receipt PDF</DialogTitle></DialogHeader>
        {pdfUrl && <iframe src={pdfUrl} title="Material receipt PDF" className="min-h-0 flex-1 rounded border" />}
        <DialogFooter>
          <Button type="button" onClick={() => void run("send")} disabled={loadingAction !== null}>
            {hasShared ? "Send again" : sendLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>}
  </>;
}
