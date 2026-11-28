import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { tankAssignmentDisplay, type TankAssignmentPosition } from "@shared/tankAssignment";
import { roundStockQuantity } from "@shared/stockUnits";

const quantity = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 6 });
export function TankAssignmentButton({ row }: { row: TankAssignmentPosition }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState<TankAssignmentPosition | null>(null);
  const [tank1, setTank1] = useState(""), [tank2, setTank2] = useState("");
  const [date, setDate] = useState(""), [error, setError] = useState("");
  const display = tankAssignmentDisplay(snapshot || row);
  const factor = display.factor;
  const actual1 = factor && tank1.trim() ? roundStockQuantity(Number(tank1) / factor) : NaN;
  const actual2 = factor && tank2.trim() ? roundStockQuantity(Number(tank2) / factor) : NaN;
  const difference = snapshot ? roundStockQuantity(actual1 + actual2 + (snapshot.packed ?? 0) - snapshot.total) : NaN;
  const valid = [actual1, actual2].every(value => Number.isFinite(value) && value >= 0) && difference === 0;
  const mutation = useMutation({
    mutationFn: async () => {
      if (!snapshot || !valid) throw new Error("Tank 1 + Tank 2 + barrels must equal total.");
      return apiRequest("POST", "/api/plant-module/tank-assignments", {
        materialId: snapshot.materialId, partyId: snapshot.partyId, date, uom: snapshot.stockUom,
        actualTank1: actual1, actualTank2: actual2,
        preview: { tank1: snapshot.tank1, tank2: snapshot.tank2, packed: snapshot.packed ?? 0,
          packedCount: snapshot.packedCount ?? 0, unassigned: snapshot.unassigned, total: snapshot.total },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/packed-stock-positions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      toast({ title: "Tank stock corrected", description: "Party total and barrels are unchanged." }); setSnapshot(null);
    },
    onError: (failure: Error) => {
      let body: any; try { body = JSON.parse(failure.message.replace(/^\d{3}:\s*/, "")); } catch {}
      setError(body?.message || failure.message);
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/packed-stock-positions"] });
    },
  });
  if (!user?.isOwner || ![row.tank1, row.tank2, row.unassigned, row.total, row.packed ?? 0].every(Number.isFinite)) return null;
  return <>
    <Button size="sm" variant="outline" onClick={() => {
      const display = tankAssignmentDisplay(row);
      setSnapshot({ ...row }); setTank1(display.factor ? String(Math.max(0, row.tank1 * display.factor)) : "");
      setTank2(display.factor ? String(Math.max(0, row.tank2 * display.factor)) : "");
      setDate(format(new Date(), "yyyy-MM-dd")); setError("");
    }}>Correct tank stock</Button>
    <Dialog open={snapshot != null} onOpenChange={open => { if (!open && !mutation.isPending) setSnapshot(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Correct tank stock</DialogTitle></DialogHeader>
        {snapshot && <>
          <p>{snapshot.partyName} · {snapshot.materialName}</p>
          <table className="w-full text-sm" data-testid="tank-assignment-preview">
            <thead><tr><th className="text-left">Position</th><th>Before → after ({display.unit})</th></tr></thead>
            <tbody>{([
              ["Tank 1", snapshot.tank1, actual1], ["Tank 2", snapshot.tank2, actual2],
              [`Barrels (${snapshot.packedCount ?? 0}, read-only)`, snapshot.packed ?? 0, snapshot.packed ?? 0],
              ["Not in a tank", snapshot.unassigned, 0], ["Total", snapshot.total, snapshot.total],
            ] as const).map(([label, before, after]) => <tr key={label}><th className="text-left">{label}</th>
              <td className="text-center">{factor == null ? "Conversion needed" : `${quantity(before * factor)} → ${Number.isFinite(after) ? quantity(after * factor) : "—"}`}</td></tr>)}</tbody>
          </table>
          <Label>Actual in Tank 1 ({display.unit})<Input aria-label="Actual in Tank 1" type="number" step="any" min="0" value={tank1} disabled={mutation.isPending || factor == null} onChange={event => setTank1(event.target.value)} /></Label>
          <Label>Actual in Tank 2 ({display.unit})<Input aria-label="Actual in Tank 2" type="number" step="any" min="0" value={tank2} disabled={mutation.isPending || factor == null} onChange={event => setTank2(event.target.value)} /></Label>
          <Label>Date<Input aria-label="Assignment date" type="date" value={date} disabled={mutation.isPending} onChange={event => setDate(event.target.value)} /></Label>
          {Number.isFinite(difference) && difference !== 0 && factor != null && <p role="alert">{quantity(Math.abs(difference * factor))} {display.unit} {difference < 0 ? "short" : "over"} — record a physical stock correction for that separately.</p>}
          <p className="text-sm text-muted-foreground">Book positions only. Party total and barrels will not change.</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </>}
        <DialogFooter>
          <Button variant="outline" disabled={mutation.isPending} onClick={() => setSnapshot(null)}>Cancel</Button>
          <Button disabled={mutation.isPending || !date || !valid || !!error} onClick={() => mutation.mutate()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
