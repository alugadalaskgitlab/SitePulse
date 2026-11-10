import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeftRight, Check, Loader2, RefreshCw, Scale } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { normalizeWeightUnit } from "@shared/stockUnits";

type BalanceRow = {
  materialId: number;
  materialName: string;
  partyId: number | null;
  partyName: string;
  stockUom: string;
  before: number;
  after: number;
  existingBalanceIds: number[];
};

type NormalizationPreview = {
  token: string;
  unitChanges: Array<{ table: string; originalUnit: string; rowCount: number; newUnit: "MT" }>;
  balanceRows: BalanceRow[];
  errors: string[];
  canApply: boolean;
};

type CorrectableTransfer = {
  outId: number;
  inId: number;
  materialId: number;
  materialName: string;
  date: string;
  fromPartyId: number | null;
  fromPartyName: string;
  toPartyId: number | null;
  toPartyName: string;
  quantity: number;
  uom: string;
  receivedQuantity: number;
  receivedUom: string;
  notes: string;
  linkedByReference: boolean;
};

type TransferAdminData = {
  transfers: CorrectableTransfer[];
  history: Array<{
    id: number;
    transactionId: number;
    userName: string;
    oldValues: Record<string, unknown> | null;
    newValues: Record<string, unknown> | null;
    reason: string | null;
    createdAt: string | null;
  }>;
};
type PartyChoice = { id: number; name: string };

const fmtQty = (value: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 6 }).format(Number(value || 0));

export function StockUnitAdminPanel({ visible }: { visible: boolean }) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<NormalizationPreview | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [selectedTransferId, setSelectedTransferId] = useState("");
  const [correctionQty, setCorrectionQty] = useState("");
  const [correctionUom, setCorrectionUom] = useState("MT");
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionFromPartyId, setCorrectionFromPartyId] = useState("");
  const [correctionToPartyId, setCorrectionToPartyId] = useState("");

  const partiesQuery = useQuery<PartyChoice[]>({
    queryKey: ["/api/plant-module/parties"],
    enabled: visible,
    retry: false,
  });
  const transfersQuery = useQuery<TransferAdminData>({
    queryKey: ["/api/admin/stock-transfers/correctable"],
    enabled: visible,
    retry: false,
  });
  const selectedTransfer = useMemo(
    () => transfersQuery.data?.transfers.find(row => String(row.outId) === selectedTransferId) ?? null,
    [transfersQuery.data?.transfers, selectedTransferId],
  );

  const previewMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/stock-units/preview", {});
      if (!response.ok) throw new Error((await response.json()).message || "Could not preview unit normalization");
      return response.json() as Promise<NormalizationPreview>;
    },
    onSuccess: data => setPreview(data),
    onError: (error: Error) => toast({ title: "Preview failed", description: error.message, variant: "destructive" }),
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!preview?.token) throw new Error("Preview the changes before applying.");
      const response = await apiRequest("POST", "/api/admin/stock-units/apply", { token: preview.token });
      if (!response.ok) throw new Error((await response.json()).message || "Could not apply unit normalization");
      return response.json();
    },
    onSuccess: data => {
      setConfirmApply(false);
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stock-transfers/correctable"] });
      toast({
        title: "Stock units normalized",
        description: `${data.relabelledRows} rows relabelled; ${data.balanceRowsUpdated} balances rebuilt.`,
      });
    },
    onError: (error: Error) => toast({ title: "Apply failed", description: error.message, variant: "destructive" }),
  });

  const correctionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTransfer) throw new Error("Select a transfer.");
      if (!correctionFromPartyId || !correctionToPartyId || correctionFromPartyId === correctionToPartyId) {
        throw new Error("Choose different source and destination parties.");
      }
      const response = await apiRequest("POST", "/api/admin/stock-transfers/correct", {
        outId: selectedTransfer.outId,
        inId: selectedTransfer.inId,
        quantity: Number(correctionQty),
        uom: correctionUom,
        fromPartyId: correctionFromPartyId === "__plant__" ? null : Number(correctionFromPartyId),
        toPartyId: correctionToPartyId === "__plant__" ? null : Number(correctionToPartyId),
        reason: correctionReason,
      });
      if (!response.ok) throw new Error((await response.json()).message || "Could not correct transfer");
      return response.json();
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stock-transfers/correctable"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      setSelectedTransferId("");
      setCorrectionQty("");
      setCorrectionReason("");
      toast({
        title: "Transfer corrected",
        description: `${data.fromPartyName}: ${fmtQty(data.fromQuantity)} ${data.fromUom}; ${data.toPartyName}: ${fmtQty(data.toQuantity)} ${data.toUom}.`,
      });
    },
    onError: (error: Error) => toast({ title: "Correction failed", description: error.message, variant: "destructive" }),
  });

  function selectTransfer(value: string) {
    setSelectedTransferId(value);
    const transfer = transfersQuery.data?.transfers.find(row => String(row.outId) === value);
    setCorrectionQty(transfer ? String(transfer.quantity) : "");
    setCorrectionUom(normalizeWeightUnit(transfer?.uom || "MT"));
    setCorrectionFromPartyId(transfer ? String(transfer.fromPartyId ?? "__plant__") : "");
    setCorrectionToPartyId(transfer ? String(transfer.toPartyId ?? "__plant__") : "");
    setCorrectionReason("");
  }

  if (!visible) return null;

  const transferUoms = selectedTransfer
    ? Array.from(new Set([selectedTransfer.uom, selectedTransfer.receivedUom, "MT", "CFT", "Cum"].map(normalizeWeightUnit).filter(Boolean)))
    : ["MT", "CFT", "Cum"];

  return (
    <>
      <Card data-testid="card-stock-unit-normalization">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30">
              <Scale className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <CardTitle>Normalise weight units</CardTitle>
              <CardDescription>
                Owner-only. Preview legacy tonne labels and rebuild stock balances from the ledger. Quantities in source records are not changed.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending} data-testid="button-preview-stock-unit-normalization">
              {previewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Preview
            </Button>
            {preview && (
              <Button
                variant="destructive"
                onClick={() => setConfirmApply(true)}
                disabled={!preview.canApply || applyMutation.isPending}
                data-testid="button-apply-stock-unit-normalization"
              >
                {applyMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Apply normalization
              </Button>
            )}
            {preview && (
              <span className="text-sm text-muted-foreground">
                {preview.unitChanges.reduce((sum, group) => sum + group.rowCount, 0)} legacy labels · {preview.balanceRows.length} balance groups
              </span>
            )}
          </div>

          {preview && (
            <div className="space-y-4">
              <div className="rounded-md border p-3">
                <h3 className="mb-2 text-sm font-semibold">Unit labels to relabel</h3>
                {preview.unitChanges.length ? (
                  <div className="max-h-48 overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead><tr className="border-b text-muted-foreground"><th className="py-1 pr-3">Table / field</th><th className="py-1 pr-3">Current unit</th><th className="py-1 pr-3">New unit</th><th className="py-1 text-right">Rows</th></tr></thead>
                      <tbody>
                        {preview.unitChanges.map((change, index) => (
                          <tr key={`${change.table}-${change.originalUnit}-${index}`} className="border-b last:border-0">
                            <td className="py-1 pr-3">{change.table}</td>
                            <td className="py-1 pr-3">{change.originalUnit}</td>
                            <td className="py-1 pr-3">MT</td>
                            <td className="py-1 text-right">{change.rowCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="text-sm text-muted-foreground">No legacy weight labels need relabelling.</p>}
              </div>
              <div className="rounded-md border p-3">
                <h3 className="mb-2 text-sm font-semibold">Ledger rebuild preview</h3>
                <p className="mb-2 text-xs text-muted-foreground">Summary balances may change because the ledger rows are converted into the material’s stock unit. Each row shows the result that will be stored.</p>
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead><tr className="border-b text-muted-foreground"><th className="py-1 pr-3">Party</th><th className="py-1 pr-3">Material</th><th className="py-1 pr-3 text-right">Before</th><th className="py-1 pr-3">→</th><th className="py-1 text-right">After</th></tr></thead>
                    <tbody>
                      {preview.balanceRows.map((row, index) => (
                        <tr key={`${row.materialId}-${row.partyId ?? "common"}-${index}`} className="border-b last:border-0">
                          <td className="py-1 pr-3">{row.partyName}</td>
                          <td className="py-1 pr-3">{row.materialName}</td>
                          <td className="py-1 pr-3 text-right tabular-nums">{fmtQty(row.before)} {row.stockUom}</td>
                          <td className="py-1 pr-3">→</td>
                          <td className="py-1 text-right tabular-nums">{fmtQty(row.after)} {row.stockUom}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!preview.balanceRows.length && <p className="py-2 text-sm text-muted-foreground">No balance groups found.</p>}
                </div>
              </div>
              {preview.errors.length > 0 && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                  <div className="mb-2 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Apply is blocked; conversion needs attention</div>
                  <ul className="list-inside list-disc space-y-1">{preview.errors.map((error, index) => <li key={index}>{error}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-correct-stock-transfer">
        <CardHeader>
          <div className="flex items-center gap-3">
            <ArrowLeftRight className="h-5 w-5 text-indigo-600" />
            <div>
              <CardTitle>Correct a transfer</CardTitle>
              <CardDescription>Owner-only, append-only correction. The original transfer remains in the ledger; enter the correct quantity and unit with a reason.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {transfersQuery.isLoading && <p className="text-sm text-muted-foreground">Loading transfer history…</p>}
          {transfersQuery.isError && <p className="text-sm text-destructive">Could not load transfer history.</p>}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Transfer to correct</Label>
              <Select value={selectedTransferId} onValueChange={selectTransfer}>
                <SelectTrigger data-testid="select-stock-transfer-correction"><SelectValue placeholder="Select a paired transfer" /></SelectTrigger>
                <SelectContent>
                  {transfersQuery.data?.transfers.map(transfer => (
                    <SelectItem key={transfer.outId} value={String(transfer.outId)}>
                      {transfer.date} · {transfer.materialName} · {transfer.fromPartyName} → {transfer.toPartyName} · {fmtQty(transfer.quantity)} {transfer.uom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!transfersQuery.data?.transfers.length && !transfersQuery.isLoading && (
                <p className="text-xs text-muted-foreground">No uniquely paired transfer rows are available to correct.</p>
              )}
            </div>
            {selectedTransfer && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="stock-transfer-correction-quantity">Correct quantity</Label>
                  <Input id="stock-transfer-correction-quantity" type="number" min="0.000001" step="any" value={correctionQty} onChange={event => setCorrectionQty(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Quantity unit</Label>
                  <Select value={correctionUom} onValueChange={setCorrectionUom}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{transferUoms.map(unit => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Correct source party</Label>
                  <Select value={correctionFromPartyId} onValueChange={setCorrectionFromPartyId}>
                    <SelectTrigger><SelectValue placeholder="Choose source" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__plant__">Plant common</SelectItem>
                      {partiesQuery.data?.map(party => <SelectItem key={party.id} value={String(party.id)}>{party.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Correct destination party</Label>
                  <Select value={correctionToPartyId} onValueChange={setCorrectionToPartyId}>
                    <SelectTrigger><SelectValue placeholder="Choose destination" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__plant__">Plant common</SelectItem>
                      {partiesQuery.data?.map(party => <SelectItem key={party.id} value={String(party.id)}>{party.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="stock-transfer-correction-reason">Reason</Label>
                  <Textarea id="stock-transfer-correction-reason" value={correctionReason} onChange={event => setCorrectionReason(event.target.value)} placeholder="Explain the correction" />
                </div>
                <div className="md:col-span-2">
                  <Button
                    onClick={() => correctionMutation.mutate()}
                    disabled={correctionMutation.isPending || !Number(correctionQty) || correctionReason.trim().length < 4 || !correctionFromPartyId || !correctionToPartyId || correctionFromPartyId === correctionToPartyId}
                    data-testid="button-correct-stock-transfer"
                  >
                    {correctionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Append correction
                  </Button>
                </div>
              </>
            )}
          </div>
          {transfersQuery.data?.history?.length ? (
            <div className="border-t pt-3">
              <h3 className="mb-2 text-sm font-semibold">Correction history</h3>
              <div className="max-h-52 space-y-2 overflow-auto">
                {transfersQuery.data.history.map(entry => (
                  <div key={entry.id} className="rounded border p-2 text-xs">
                    <div className="font-medium">Transfer #{entry.transactionId} · {entry.userName} · {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "time unavailable"}</div>
                    <div className="text-muted-foreground">{entry.reason}</div>
                    <div className="text-muted-foreground">
                      {String(entry.oldValues?.fromPartyName ?? entry.oldValues?.fromPartyId ?? "")} → {String(entry.oldValues?.toPartyName ?? entry.oldValues?.toPartyId ?? "")}
                      {" · corrected to "}
                      {String(entry.newValues?.fromPartyName ?? entry.newValues?.fromPartyId ?? "")} → {String(entry.newValues?.toPartyName ?? entry.newValues?.toPartyId ?? "")}
                      {": "}
                      {String(entry.newValues?.fromQuantity ?? "")} {String(entry.newValues?.fromUom ?? "")} / {String(entry.newValues?.toQuantity ?? "")} {String(entry.newValues?.toUom ?? "")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog open={confirmApply} onOpenChange={setConfirmApply}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply stock unit normalization?</AlertDialogTitle>
            <AlertDialogDescription>
              This relabels listed tonne-unit fields as MT without changing their quantities, then rebuilds stock balances from converted ledger rows. The original ledger quantities remain unchanged. This action is recorded in the audit history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applyMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={applyMutation.isPending || !preview?.canApply}
              onClick={event => { event.preventDefault(); applyMutation.mutate(); }}
            >
              {applyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
