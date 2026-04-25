import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { ChevronLeft, ArrowRightLeft, Loader2, ShieldAlert, Search } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useOrigin } from "@/hooks/use-origin";
import { useAuth } from "@/lib/auth-context";
import type { Party, PlantMaterial as Material } from "@shared/schema";

type PreviewRow = {
  id: number;
  date: string;
  transactionType: string;
  quantityIn: number;
  quantityOut: number;
  uom: string;
  notes: string | null;
};

const TX_TYPES = [
  "all",
  "dispatch",
  "receipt",
  "direct_purchase",
  "issue",
  "return",
  "adjustment",
  "equipment_usage",
  "dpr_equipment_usage",
  "opening",
];

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "Unknown error";
}

export default function PlantStockReassign() {
  const { toast } = useToast();
  const { getPlantBackLink } = useOrigin();
  const { isAdmin } = useAuth();
  const backLink = getPlantBackLink({ defaultTab: "stock" });

  const [materialId, setMaterialId] = useState<string>("");
  const [fromPartyId, setFromPartyId] = useState<string>("");
  const [toPartyId, setToPartyId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [transactionType, setTransactionType] = useState<string>("all");

  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [actor, setActor] = useState<string>("");

  const { data: parties } = useQuery<Party[]>({ queryKey: ["/api/plant-module/parties"], enabled: isAdmin });
  const { data: materials } = useQuery<Material[]>({ queryKey: ["/api/plant-module/materials"], enabled: isAdmin });

  const fromPartyName = useMemo(
    () => parties?.find(p => String(p.id) === fromPartyId)?.name || "",
    [parties, fromPartyId],
  );
  const toPartyName = useMemo(
    () => parties?.find(p => String(p.id) === toPartyId)?.name || "",
    [parties, toPartyId],
  );
  const materialName = useMemo(
    () => materials?.find(m => String(m.id) === materialId)?.name || "",
    [materials, materialId],
  );

  const totals = useMemo(() => {
    if (!preview) return { rows: 0, totalIn: 0, totalOut: 0 };
    return preview.reduce(
      (acc, r) => ({
        rows: acc.rows + 1,
        totalIn: acc.totalIn + (r.quantityIn || 0),
        totalOut: acc.totalOut + (r.quantityOut || 0),
      }),
      { rows: 0, totalIn: 0, totalOut: 0 },
    );
  }, [preview]);

  const canSearch = isAdmin && !!materialId && !!fromPartyId;
  const canExecute = canSearch && !!toPartyId && fromPartyId !== toPartyId && (preview?.length ?? 0) > 0 && actor.trim().length >= 2;

  const buildBody = () => ({
    materialId: parseInt(materialId),
    fromPartyId: parseInt(fromPartyId),
    toPartyId: toPartyId ? parseInt(toPartyId) : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    transactionType: transactionType === "all" ? undefined : transactionType,
  });

  const runPreview = async () => {
    if (!canSearch) return;
    setPreviewLoading(true);
    try {
      const res = await apiRequest("POST", "/api/plant-module/reassign-ledger/preview", buildBody());
      const rows = (await res.json()) as PreviewRow[];
      setPreview(rows);
    } catch (err) {
      toast({ title: "Preview failed", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  };

  const runExecute = async () => {
    if (!canExecute) return;
    setExecuting(true);
    try {
      const res = await apiRequest("POST", "/api/plant-module/reassign-ledger/execute", { ...buildBody(), actor: actor.trim() });
      const result = await res.json() as {
        moved: number;
        reconciled: { updated: number; created: number; errors: number };
      };
      toast({
        title: "Reassignment complete",
        description: `Moved ${result.moved} ledger row(s). Recomputed ${result.reconciled.updated + result.reconciled.created} balance row(s).`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      setPreview(null);
    } catch (err) {
      toast({ title: "Reassignment failed", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setExecuting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-4">
        <ShieldAlert className="w-10 h-10 mx-auto text-amber-600" />
        <h1 className="text-xl font-bold">Admin access required</h1>
        <p className="text-sm text-muted-foreground">Stock ledger reassignment is restricted to administrators.</p>
        <Link href={backLink}><Button variant="outline">Back</Button></Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <Link href={backLink}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <ArrowRightLeft className="w-6 h-6 text-amber-700 dark:text-amber-500" />
        <h1 className="text-2xl font-bold flex-1">Stock Ledger Reassignment</h1>
      </div>

      <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-3 text-sm flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 mt-0.5 text-amber-700 dark:text-amber-400 shrink-0" />
        <div>
          <div className="font-semibold text-amber-800 dark:text-amber-300">Admin only — corrects mis-assigned ledger entries.</div>
          <div className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
            Use this to move past dispatches or receipts from one party to another (for example, bitumen
            dispatches that were saved against HLC but actually belong to VATPALLY). Always preview first.
          </div>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Material</Label>
            <Select value={materialId} onValueChange={(v) => { setMaterialId(v); setPreview(null); }}>
              <SelectTrigger data-testid="select-material"><SelectValue placeholder="Select material" /></SelectTrigger>
              <SelectContent>
                {materials?.map(m => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>From party (current owner in ledger)</Label>
            <Select value={fromPartyId} onValueChange={(v) => { setFromPartyId(v); setPreview(null); }}>
              <SelectTrigger data-testid="select-from-party"><SelectValue placeholder="Select party" /></SelectTrigger>
              <SelectContent>
                {parties?.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>To party (correct owner)</Label>
            <Select value={toPartyId} onValueChange={setToPartyId}>
              <SelectTrigger data-testid="select-to-party"><SelectValue placeholder="Select party" /></SelectTrigger>
              <SelectContent>
                {parties?.filter(p => String(p.id) !== fromPartyId).map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date from</Label>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPreview(null); }} data-testid="input-date-from" />
          </div>
          <div className="space-y-1.5">
            <Label>Date to</Label>
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPreview(null); }} data-testid="input-date-to" />
          </div>
          <div className="space-y-1.5">
            <Label>Transaction type</Label>
            <Select value={transactionType} onValueChange={(v) => { setTransactionType(v); setPreview(null); }}>
              <SelectTrigger data-testid="select-tx-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TX_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-3 space-y-1.5">
            <Label>Operator name (for audit log)</Label>
            <Input
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              placeholder="e.g. Ramesh K."
              data-testid="input-actor"
            />
          </div>
          <div className="md:col-span-3 flex gap-2">
            <Button onClick={runPreview} disabled={!canSearch || previewLoading} data-testid="button-preview">
              {previewLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
              Preview matching rows
            </Button>
            <Button
              variant="default"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={!canExecute || executing}
              onClick={runExecute}
              data-testid="button-execute"
            >
              {executing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRightLeft className="w-4 h-4 mr-2" />}
              Reassign {totals.rows} row(s) → {toPartyName || "…"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Preview — {totals.rows} row(s) for {materialName} owned by {fromPartyName}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm mb-3 grid grid-cols-2 md:grid-cols-3 gap-2">
              <div>Total IN: <span className="font-semibold tabular-nums">{totals.totalIn.toFixed(3)}</span></div>
              <div>Total OUT: <span className="font-semibold tabular-nums">{totals.totalOut.toFixed(3)}</span></div>
              <div>Net change at {fromPartyName}: <span className="font-semibold tabular-nums">{(totals.totalOut - totals.totalIn).toFixed(3)}</span></div>
            </div>
            <div className="overflow-auto border rounded-md max-h-[480px]">
              <table className="w-full text-xs">
                <thead className="bg-muted/60 border-b sticky top-0">
                  <tr>
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-right p-2">Qty In</th>
                    <th className="text-right p-2">Qty Out</th>
                    <th className="text-left p-2">UoM</th>
                    <th className="text-left p-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.length === 0 && (
                    <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">No matching rows.</td></tr>
                  )}
                  {preview.map(r => (
                    <tr key={r.id} className="border-b last:border-0" data-testid={`row-preview-${r.id}`}>
                      <td className="p-2">{r.date}</td>
                      <td className="p-2">{r.transactionType}</td>
                      <td className="p-2 text-right tabular-nums">{(r.quantityIn || 0).toFixed(3)}</td>
                      <td className="p-2 text-right tabular-nums">{(r.quantityOut || 0).toFixed(3)}</td>
                      <td className="p-2">{r.uom}</td>
                      <td className="p-2">{r.notes || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
