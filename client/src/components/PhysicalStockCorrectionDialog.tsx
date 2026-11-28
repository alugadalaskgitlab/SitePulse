import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/featureFlags";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { calculateHlcBitumenCorrectionTarget } from "@shared/plantNormVsActual";
import { formatQty, toFiniteNumber } from "@shared/stockReconciliation";
import { normalizeWeightUnit } from "@shared/stockUnits";
import { BITUMEN_DENSITY_KG_PER_LITER, LDO_DENSITY_KG_PER_LITER } from "@shared/bitumen-dip-chart";

type Balance = { materialId: number; partyId: number | null; balance: number; uom: string };
type Dip = { tankNumber: number; date: string; time?: string | null; volumeLiters: number };
type Position = { materialName: string; partyId: number | null; stockUom: string; packed: number; packedL?: number | null; tank1: number; tank2: number; tank1L?: number | null; tank2L?: number | null };
const balanceToL = (balance: number, uom: string) => {
  const unit = normalizeWeightUnit(uom).toUpperCase();
  if (unit === "MT") return balance * 1000 / LDO_DENSITY_KG_PER_LITER;
  if (unit === "KG") return balance / LDO_DENSITY_KG_PER_LITER;
  return balance;
};

export function PhysicalStockCorrectionButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user?.isOwner) return null;
  return <>
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Physical stock correction</Button>
    {open && <PhysicalStockCorrectionDialog onClose={() => setOpen(false)} />}
  </>;
}

/** Moved tracker correction callers. The existing route still owns validation and audit. */
function PhysicalStockCorrectionDialog({ onClose }: { onClose: () => void }) {
  const { ownCompanyPartyId, ownCompanyPartyName, defaultPlantName } = useFeatureFlags();
  const { toast } = useToast();
  const plantName = new URLSearchParams(window.location.search).get("plant") || defaultPlantName;
  const [kind, setKind] = useState("bitumen"), [party, setParty] = useState("");
  const [tank1, setTank1] = useState(""), [tank2, setTank2] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd")), [notes, setNotes] = useState("");
  const materials = useQuery<{ id: number; name: string }[]>({ queryKey: ["/api/plant-module/materials"] });
  const parties = useQuery<{ id: number; name: string }[]>({ queryKey: ["/api/plant-module/parties"] });
  const balances = useQuery<Balance[]>({ queryKey: ["/api/plant-module/stock-balances"] });
  const positions = useQuery<{ rows?: Position[] }>({ queryKey: ["/api/plant-module/packed-stock-positions"] });
  const bitumenDips = useQuery<Dip[]>({
    queryKey: ["/api/plant-module/bitumen-dip-readings", { plantName }],
    queryFn: async () => {
      const res = await fetch(`/api/plant-module/bitumen-dip-readings?plantName=${encodeURIComponent(plantName)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not load bitumen dips.");
      return res.json();
    },
  });
  const ldoDips = useQuery<Dip[]>({ queryKey: ["/api/plant-module/ldo-dip-readings"] });
  const ldo = kind === "ldo", unit = ldo ? "L" : "MT";
  const material = materials.data?.find(m => m.name.toUpperCase() === (ldo ? "LDO" : "BITUMEN"));
  const partyId = ldo ? party : ownCompanyPartyId == null ? "" : String(ownCompanyPartyId);
  const partyBalances = (balances.data ?? []).filter(b => b.materialId === material?.id);
  const book = partyBalances.reduce<number | null>((s, b) => {
    const q = toFiniteNumber(b.balance);
    return s == null || q == null ? null : s + q;
  }, 0);
  const selectedBalance = partyBalances.find(b => String(b.partyId) === partyId);
  const selectedBook = selectedBalance ? toFiniteNumber(selectedBalance.balance) : null;
  const selectedPositions = (positions.data?.rows ?? []).filter(row => row.materialName.trim().toUpperCase() === "LDO" && String(row.partyId) === partyId);
  const packedL = selectedPositions.reduce((sum, row) => sum + (row.packedL ?? (row.stockUom.toLowerCase().startsWith("lit") ? row.packed : 0)), 0);
  const tankBookL = selectedPositions.reduce((sum, row) => sum + (row.tank1L != null && row.tank2L != null ? row.tank1L + row.tank2L : balanceToL(row.tank1 + row.tank2, row.stockUom)), 0);
  const dips = ldo ? ldoDips : bitumenDips;
  const latest = (tank: number) => (dips.data ?? []).filter(r => r.tankNumber === tank)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.time || "").localeCompare(a.time || ""))[0];
  const dipValue = (tank: number) => ldo ? String(Math.round(latest(tank)?.volumeLiters || 0))
    : ((latest(tank)?.volumeLiters || 0) * BITUMEN_DENSITY_KG_PER_LITER / 1000).toFixed(3);
  const ready = material && balances.data && dips.data && (!ldo || positions.data);
  const initialized = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || initialized.current === kind) return;
    initialized.current = kind;
    setTank1(dipValue(1)); setTank2(dipValue(2));
    if (ldo && partyBalances.length) setParty(String(partyBalances[0].partyId));
  }, [ready, kind]);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!ready || !partyId || (!ldo && book == null)) throw new Error("Stock information is not ready.");
      const first = parseFloat(tank1) || 0, second = parseFloat(tank2) || 0;
      const partyName = ldo ? parties.data?.find(p => String(p.id) === partyId)?.name || `Party ${partyId}` : ownCompanyPartyName || "HLC";
      const correction = ldo ? null : calculateHlcBitumenCorrectionTarget({
        physicalTotalMt: first + second, allPartyBookMt: book!, hlcBookMt: selectedBook ?? 0,
      });
      const res = await apiRequest("POST", "/api/plant-module/stock-correction", ldo ? {
        materialId: material.id, partyId: parseInt(partyId),
        physicalQty: (first + second + packedL) * LDO_DENSITY_KG_PER_LITER / 1000,
        tank1L: first, tank2L: second, uom: "MT", date,
        notes: notes || `LDO dip reconciliation — Boiler: ${first.toFixed(0)} L, Dryer: ${second.toFixed(0)} L (${partyName})`,
        correctedBy: "admin",
      } : {
        materialId: material.id, partyId: parseInt(partyId), physicalQty: correction!.targetHlcMt, uom: "MT", date,
        notes: notes || `Shared-tank dip/book difference ${correction!.adjustmentMt.toFixed(3)} MT posted to ${partyName} only — T1: ${first.toFixed(3)} MT, T2: ${second.toFixed(3)} MT`,
        correctedBy: "admin",
      });
      return res.json();
    },
    onSuccess: result => {
      for (const key of ["stock-balances", "stock-ledger", "packed-stock-positions"]) queryClient.invalidateQueries({ queryKey: [`/api/plant-module/${key}`] });
      toast({ title: ldo ? "LDO stock correction posted" : "Stock correction posted",
        description: ldo ? `Adjustment: ${balanceToL(Number(result.adjustment || 0), result.uom || "MT").toFixed(0)} L. Book stock now ${balanceToL(Number(result.newBalance || 0), result.uom || "MT").toFixed(0)} L.`
          : `Adjustment: ${formatQty(result.adjustment, 3)} MT. Book stock now ${formatQty(result.newBalance, 3)} MT.` });
      onClose();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });
  return <Dialog open onOpenChange={open => { if (!open && !mutation.isPending) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>Physical stock correction</DialogTitle></DialogHeader>
      <Label>Material<select className="block h-9 w-full rounded border bg-background px-2" aria-label="Correction material" value={kind} disabled={mutation.isPending} onChange={e => { setKind(e.target.value); setTank1(""); setTank2(""); setNotes(""); setParty(""); }}>
        <option value="bitumen">Bitumen (MT)</option><option value="ldo">LDO (L)</option>
      </select></Label>
      {ldo ? <Label>Party to correct<select aria-label="Correction party" className="block h-9 w-full rounded border bg-background px-2" value={party} disabled={mutation.isPending} onChange={e => setParty(e.target.value)}>
        <option value="">Select party</option>{parties.data?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></Label> : <><p data-testid="text-bitumen-correction-party">{ownCompanyPartyName || "HLC company party"}</p><p className="text-sm">The shared dip/book difference posts to HLC only; party balances stay dispatch-based.</p></>}
      <p className="text-sm">{ldo ? `Current tank book stock: ${tankBookL.toFixed(0)} L · Packed stock: ${packedL.toFixed(0)} L` : `Total book stock (all parties): ${formatQty(book, 3)} MT · HLC book stock: ${formatQty(selectedBook ?? 0, 3)} MT`}</p>
      <Label>As on date<Input type="date" aria-label="Correction date" value={date} onChange={e => setDate(e.target.value)} disabled={mutation.isPending} /></Label>
      {([1, 2] as const).map(tank => <Label key={tank}>Tank {tank} ({unit})<Input type="number" min="0" step={ldo ? "1" : "0.001"} aria-label={`Correction tank ${tank}`} value={tank === 1 ? tank1 : tank2}
        disabled={mutation.isPending} placeholder={dipValue(tank)} onChange={e => (tank === 1 ? setTank1 : setTank2)(e.target.value)} />
        <span className="text-sm text-muted-foreground">Dip: {dipValue(tank)} {unit}</span></Label>)}
      <p className="text-sm">Total physical: {((parseFloat(tank1) || 0) + (parseFloat(tank2) || 0)).toFixed(ldo ? 0 : 3)} {unit}{ldo && " · Packed stock stays unchanged."}</p>
      {(ldo || book != null) && <p className="text-sm font-semibold">{ldo ? "Adjustment" : "HLC adjustment"}: {((parseFloat(tank1) || 0) + (parseFloat(tank2) || 0) - (ldo ? tankBookL : book!)).toFixed(ldo ? 0 : 3)} {unit}</p>}
      <Label>Notes (optional)<Input aria-label="Correction notes" value={notes} disabled={mutation.isPending} onChange={e => setNotes(e.target.value)} /></Label>
      {[materials, parties, balances, positions, dips].some(q => q.isError) && <p role="alert">Could not load stock information. Close and try again.</p>}
      {!ldo && ownCompanyPartyId == null && <p role="alert">Company party is not configured.</p>}
      <DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={onClose}>Cancel</Button>
        <Button disabled={!ready || !partyId || (!ldo && book == null) || (!tank1 && !tank2) || mutation.isPending} onClick={() => mutation.mutate()}>Post correction</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
