import { useEffect, useState } from "react";
import { Download, Eye, MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { buildMaterialReceiptSlipPdf, materialReceiptSlipCaption, materialReceiptSlipFilename } from "@/lib/materialReceiptSlipPdf";
import type { MaterialReceiptSlipData } from "@/lib/materialReceiptSlipTypes";

export function MaterialReceiptSlipActions({
  record, companyName, logoFile, compact = false,
}: {
  record: MaterialReceiptSlipData;
  companyName: string;
  logoFile?: string | null;
  compact?: boolean;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState<"view" | "save" | "send" | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  const createPdf = async () => {
    const blob = await buildMaterialReceiptSlipPdf(record, companyName, logoFile);
    return { blob, filename: materialReceiptSlipFilename(record) };
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
  const run = async (action: "view" | "save" | "send") => {
    setLoadingAction(action);
    try {
      const { blob, filename } = await createPdf();
      if (action === "view") {
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        setPdfUrl(URL.createObjectURL(blob));
        setOpen(true);
      } else if (action === "save") {
        download(blob, filename);
      } else {
        const caption = materialReceiptSlipCaption(record);
        const file = new File([blob], filename, { type: "application/pdf" });
        const shareNavigator = navigator as Navigator & {
          canShare?: (data?: ShareData) => boolean;
        };
        if (typeof shareNavigator.share === "function" && shareNavigator.canShare?.({ files: [file] })) {
          await shareNavigator.share({ files: [file], text: caption });
        } else {
          download(blob, filename);
          window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, "_blank", "noopener,noreferrer");
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
  const buttonSize = compact ? "sm" : "default";
  return <>
    <div className={`flex flex-wrap items-center gap-1 ${compact ? "" : "mt-3"}`}>
      <Button type="button" size={buttonSize} variant="outline" onClick={() => void run("send")} disabled={loadingAction !== null} data-testid={`button-receipt-send-${record.kind}-${record.id}`}>
        {loadingAction === "send" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="mr-1 h-3.5 w-3.5" />}
        Send on WhatsApp
      </Button>
      <Button type="button" size={buttonSize} variant="outline" onClick={() => void run("view")} disabled={loadingAction !== null} data-testid={`button-receipt-view-${record.kind}-${record.id}`}>
        {loadingAction === "view" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
        View
      </Button>
      <Button type="button" size={buttonSize} variant="outline" onClick={() => void run("save")} disabled={loadingAction !== null} data-testid={`button-receipt-save-${record.kind}-${record.id}`}>
        {loadingAction === "save" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
        Save PDF
      </Button>
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
          <Button type="button" variant="outline" onClick={() => void run("send")} disabled={loadingAction !== null}>Send on WhatsApp</Button>
          <Button type="button" onClick={() => void run("save")} disabled={loadingAction !== null}>Save PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>}
  </>;
}
