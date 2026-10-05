import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { captureWholeBillSnapshot, canExportWholeBill, type WholeBillSnapshot } from "./wholeBillSnapshot";
import { saveWholeBillFile, type WholeBillExportFormat } from "./wholeBillExport";

export type WholeBillExportButtonsProps = {
  canExport: boolean;
  isFieldEngineer?: boolean;
  isAdmin?: boolean;
  isOwner?: boolean;
  position: "header" | "footer";
  /** Called only on click. Supply the current form/view values, never a query. */
  getSnapshot: () => WholeBillSnapshot;
};

/** Existing SitePulse outline controls, no new visual system or status gating. */
export default function WholeBillExportButtons({
  canExport, isFieldEngineer, isAdmin, isOwner, position, getSnapshot,
}: WholeBillExportButtonsProps) {
  const [pending, setPending] = useState<WholeBillExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [lastFormat, setLastFormat] = useState<WholeBillExportFormat>("xlsx");
  if (!canExportWholeBill(canExport, isFieldEngineer, isAdmin, isOwner)) return null;
  const run = async (kind: WholeBillExportFormat) => {
    if (pending) return;
    setError(null);
    setLastFormat(kind);
    setNotes([]);
    setPending(kind);
    try {
      const snapshot = captureWholeBillSnapshot(getSnapshot());
      const result = await saveWholeBillFile(snapshot, kind);
      if (!result.cancelled) setNotes(result.notes);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The export could not be completed.");
    } finally {
      setPending(null);
    }
  };
  return <div className="flex flex-wrap items-center gap-2" data-testid={`whole-bill-export-${position}`}>
    <Button type="button" variant="outline" size="sm" disabled={!!pending}
      onClick={() => run("xlsx")} data-testid={`button-export-whole-bill-excel-${position}`}>
      <Download className="mr-1 h-4 w-4" />{pending === "xlsx" ? "PREPARING EXCEL…" : "EXPORT EXCEL"}
    </Button>
    <Button type="button" variant="outline" size="sm" disabled={!!pending}
      onClick={() => run("pdf")} data-testid={`button-export-whole-bill-pdf-${position}`}>
      <FileText className="mr-1 h-4 w-4" />{pending === "pdf" ? "PREPARING PDF…" : "EXPORT PDF"}
    </Button>
    {error && <div role="alert" className="basis-full text-xs text-destructive">
      Export failed: {error} <button type="button" className="underline" onClick={() => run(lastFormat)}>Retry export</button>
    </div>}
    {notes.map(note => <p key={note} role="status" className="basis-full text-xs text-muted-foreground">{note}</p>)}
  </div>;
}