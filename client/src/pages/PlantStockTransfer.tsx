import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { ChevronLeft, MoveHorizontal, Loader2, ShieldAlert, AlertTriangle, CheckCircle2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useOrigin } from "@/hooks/use-origin";
import { useAuth } from "@/lib/auth-context";
import { format } from "date-fns";
import type { Party, PlantMaterial as Material, StockLedgerEntry } from "@shared/schema";

type StockBalance = {
  partyId: number | null;
  materialId: number;
  balance: number;
  uom: string | null;
};

type StockTransferResult = {
  message: string;
  outEntry: StockLedgerEntry;
  inEntry: StockLedgerEntry;
  reconciled: { updated: number; created: number; errors: number };
};

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "Unknown error";
}

export default function PlantStockTransfer() {
  const { toast } = useToast();
  const { getPlantBackLink } = useOrigin();
  const { isAdmin, sectionCan } = useAuth();
  const canTransfer = isAdmin || sectionCan("plant_stock", "create");
  const backLink = getPlantBackLink({ defaultTab: "stock" });

  const today = format(new Date(), "yyyy-MM-dd");

  const [materialId, setMaterialId] = useState<string>("");
  const [fromPartyId, setFromPartyId] = useState<string>("");
  const [toPartyId, setToPartyId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [date, setDate] = useState<string>(today);
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<StockTransferResult | null>(null);

  const { data: parties } = useQuery<Party[]>({ queryKey: ["/api/plant-module/parties"], enabled: canTransfer });
  const { data: materials } = useQuery<Material[]>({ queryKey: ["/api/plant-module/materials"], enabled: canTransfer });
  const { data: allBalances } = useQuery<StockBalance[]>({ queryKey: ["/api/plant-module/stock-balances"], enabled: canTransfer });

  const fromPartyBalance = useMemo(() => {
    if (!allBalances || !materialId || !fromPartyId) return null;
    const b = allBalances.find(
      (b) => String(b.partyId) === fromPartyId && b.materialId === Number(materialId)
    );
    return b ?? null;
  }, [allBalances, materialId, fromPartyId]);

  const toPartyBalance = useMemo(() => {
    if (!allBalances || !materialId || !toPartyId) return null;
    const b = allBalances.find(
      (b) => String(b.partyId) === toPartyId && b.materialId === Number(materialId)
    );
    return b ?? null;
  }, [allBalances, materialId, toPartyId]);

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
  const materialUom = useMemo(
    () => materials?.find(m => String(m.id) === materialId)?.defaultUom || "MT",
    [materials, materialId],
  );

  const qtyNum = parseFloat(quantity) || 0;
  const fromBalance = fromPartyBalance?.balance ?? null;
  const isOverBalance = fromBalance !== null && qtyNum > fromBalance && fromBalance >= 0;
  const canSave =
    canTransfer &&
    !!materialId &&
    !!fromPartyId &&
    !!toPartyId &&
    fromPartyId !== toPartyId &&
    qtyNum > 0 &&
    !!date;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await apiRequest("POST", "/api/plant-module/stock-transfer", {
        materialId: parseInt(materialId),
        fromPartyId: parseInt(fromPartyId),
        toPartyId: parseInt(toPartyId),
        quantity: qtyNum,
        date,
        notes: notes.trim() || undefined,
      });
      const data = await res.json();
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      toast({
        title: "Transfer recorded",
        description: `${qtyNum} ${materialUom} of ${materialName} transferred from ${fromPartyName} to ${toPartyName}.`,
      });
      // Reset form
      setQuantity("");
      setNotes("");
    } catch (err) {
      toast({ title: "Transfer failed", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!canTransfer) {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-4">
        <ShieldAlert className="w-10 h-10 mx-auto text-amber-600" />
        <h1 className="text-xl font-bold">Access required</h1>
        <p className="text-sm text-muted-foreground">Stock transfers require admin or manager create access.</p>
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
        <MoveHorizontal className="w-6 h-6 text-blue-700 dark:text-blue-400" />
        <h1 className="text-2xl font-bold flex-1">Stock Transfer Between Parties</h1>
      </div>

      <div className="rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-800 p-3 text-sm flex items-start gap-2">
        <MoveHorizontal className="w-4 h-4 mt-0.5 text-blue-700 dark:text-blue-400 shrink-0" />
        <div>
          <div className="font-semibold text-blue-800 dark:text-blue-300">Forward stock transfer — use to return borrowed material.</div>
          <div className="text-xs text-blue-800/80 dark:text-blue-200/80 mt-0.5">
            When a dispatch borrowed material from HLC and the party has since received their own stock, 
            use this form to transfer the equivalent quantity back to HLC. Two ledger entries are created 
            (debit source party, credit destination party) with a full audit trail.
          </div>
        </div>
      </div>

      {result && (
        <div className="rounded-md border border-green-300 bg-green-50 dark:bg-green-950/40 dark:border-green-800 p-3 text-sm flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-700 dark:text-green-400 shrink-0" />
          <div>
            <div className="font-semibold text-green-800 dark:text-green-300">Transfer recorded successfully</div>
            <div className="text-xs text-green-800/80 dark:text-green-200/80 mt-0.5">
              Ledger entries created and balances updated for both parties.
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Transfer Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Material</Label>
            <Select value={materialId} onValueChange={(v) => { setMaterialId(v); setResult(null); }}>
              <SelectTrigger data-testid="select-material">
                <SelectValue placeholder="Select material" />
              </SelectTrigger>
              <SelectContent>
                {materials?.map(m => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              data-testid="input-date"
            />
          </div>

          <div className="space-y-1.5">
            <Label>From party (source — will be debited)</Label>
            <Select value={fromPartyId} onValueChange={(v) => { setFromPartyId(v); setResult(null); }}>
              <SelectTrigger data-testid="select-from-party">
                <SelectValue placeholder="Select party" />
              </SelectTrigger>
              <SelectContent>
                {parties?.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fromPartyBalance !== null && materialId && (
              <p className="text-xs text-muted-foreground">
                Current balance: <span className={`font-semibold ${fromPartyBalance.balance < 0 ? "text-red-600" : "text-green-700 dark:text-green-400"}`}>
                  {fromPartyBalance.balance.toFixed(3)} {fromPartyBalance.uom || materialUom}
                </span>
              </p>
            )}
            {fromPartyId && materialId && fromPartyBalance === null && (
              <p className="text-xs text-muted-foreground">Current balance: <span className="font-semibold">0.000 {materialUom}</span></p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>To party (destination — will be credited)</Label>
            <Select value={toPartyId} onValueChange={(v) => { setToPartyId(v); setResult(null); }}>
              <SelectTrigger data-testid="select-to-party">
                <SelectValue placeholder="Select party" />
              </SelectTrigger>
              <SelectContent>
                {parties?.filter(p => String(p.id) !== fromPartyId).map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {toPartyBalance !== null && materialId && (
              <p className="text-xs text-muted-foreground">
                Current balance: <span className={`font-semibold ${toPartyBalance.balance < 0 ? "text-red-600" : "text-green-700 dark:text-green-400"}`}>
                  {toPartyBalance.balance.toFixed(3)} {toPartyBalance.uom || materialUom}
                </span>
              </p>
            )}
            {toPartyId && materialId && toPartyBalance === null && (
              <p className="text-xs text-muted-foreground">Current balance: <span className="font-semibold">0.000 {materialUom}</span></p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Quantity ({materialUom})</Label>
            <Input
              type="number"
              min="0.001"
              step="0.001"
              value={quantity}
              onChange={(e) => { setQuantity(e.target.value); setResult(null); }}
              placeholder="e.g. 2.400"
              data-testid="input-quantity"
            />
            {isOverBalance && (
              <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Quantity ({qtyNum.toFixed(3)}) exceeds current balance ({fromBalance!.toFixed(3)} {materialUom}).
                  Transfer will proceed but source party will go into negative balance.
                </span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Reason / Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Returning material borrowed on dispatch #45"
              data-testid="input-notes"
            />
          </div>

          <div className="md:col-span-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="bg-blue-700 hover:bg-blue-800 text-white"
              data-testid="button-save-transfer"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
              ) : (
                <><MoveHorizontal className="w-4 h-4 mr-2" />
                  {canSave
                    ? `Transfer ${qtyNum > 0 ? qtyNum.toFixed(3) + " " + materialUom + " " : ""}from ${fromPartyName || "…"} → ${toPartyName || "…"}`
                    : "Fill all fields to transfer"
                  }
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
