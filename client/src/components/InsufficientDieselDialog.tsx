/**
 * 06M-B — shared "INSUFFICIENT DIESEL IN PLANT STOCK" dialog.
 *
 * The server hard-blocks any plant-stock diesel issue (DPR equipment log or
 * Equipment & Fleet usage) that would push the recorded Diesel balance below
 * zero, returning a 409 with code INSUFFICIENT_PLANT_STOCK. This component
 * renders that structured payload with the required/available/shortage
 * litres and offers a direct jump to the existing Material Receipt screen
 * (prefilled with Diesel via its autoOpen/materialId query params).
 *
 * It never creates a receipt itself — the user records the physical receipt
 * through the normal flow, then retries the issue.
 */
import { useLocation } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface InsufficientPlantStockPayload {
  code: "INSUFFICIENT_PLANT_STOCK";
  material: string;
  source: string;
  materialId: number;
  requestedQty: number;
  availableQty: number;
  shortageQty: number;
}

/** Parse an apiRequest error ("409: {json}") into the structured payload, or null. */
export function parseInsufficientPlantStock(err: unknown): InsufficientPlantStockPayload | null {
  const msg = String((err as any)?.message ?? "");
  if (!msg.startsWith("409") || !msg.includes("INSUFFICIENT_PLANT_STOCK")) return null;
  try {
    const jsonStart = msg.indexOf("{");
    if (jsonStart === -1) return null;
    const body = JSON.parse(msg.slice(jsonStart));
    if (body?.code !== "INSUFFICIENT_PLANT_STOCK") return null;
    return body as InsufficientPlantStockPayload;
  } catch {
    return null;
  }
}

const fmtL = (n: number) => `${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })} L`;

export function InsufficientDieselDialog({
  payload,
  onClose,
}: {
  payload: InsufficientPlantStockPayload | null;
  onClose: () => void;
}) {
  const [, setLocation] = useLocation();
  return (
    <AlertDialog open={!!payload} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent data-testid="dialog-insufficient-diesel">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-red-600">INSUFFICIENT DIESEL IN PLANT STOCK</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              {payload && (
                <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span>Required:</span><span className="font-semibold" data-testid="text-required-qty">{fmtL(payload.requestedQty)}</span></div>
                  <div className="flex justify-between"><span>Available:</span><span className="font-semibold" data-testid="text-available-qty">{fmtL(payload.availableQty)}</span></div>
                  <div className="flex justify-between text-red-600 dark:text-red-400"><span>Short:</span><span className="font-semibold" data-testid="text-shortage-qty">{fmtL(payload.shortageQty)}</span></div>
                </div>
              )}
              <p>
                If purchased Diesel has already arrived, first enter its physical
                receipt under Material Receipt so it is added to Plant Stock.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-insufficient-diesel">CANCEL</AlertDialogCancel>
          <AlertDialogAction
            data-testid="button-go-material-receipt"
            onClick={() => {
              const materialParam = payload?.materialId ? `&materialId=${payload.materialId}` : "";
              onClose();
              setLocation(`/plant/material-receipts?autoOpen=1${materialParam}`);
            }}
          >
            GO TO MATERIAL RECEIPT
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
