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
import { tankAssignmentPreview, type TankAssignmentPosition } from "@shared/tankAssignment";

const quantity = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 6 });

export function TankAssignmentButton({ row }: { row: TankAssignmentPosition }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState<TankAssignmentPosition | null>(null);
  const [tank, setTank] = useState<1 | 2>(1);
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      if (!snapshot) throw new Error("Open the review again.");
      return apiRequest("POST", "/api/plant-module/tank-assignments", {
        materialId: snapshot.materialId, partyId: snapshot.partyId, tankNumber: tank,
        date, amount: snapshot.unassigned, uom: snapshot.stockUom,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/packed-stock-positions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      toast({ title: "Unassigned stock moved to tank", description: "Total stock is unchanged." });
      setSnapshot(null);
    },
    onError: (failure: Error) => {
      setError(failure.message);
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/packed-stock-positions"] });
    },
  });
  if (!user?.isOwner || ![row.tank1, row.tank2, row.unassigned, row.total].every(Number.isFinite) || row.unassigned === 0) return null;
  const after = snapshot ? tankAssignmentPreview(snapshot, tank) : null;
  return <>
    <Button size="sm" variant="outline" onClick={() => {
      setSnapshot({ ...row }); setTank(1); setDate(format(new Date(), "yyyy-MM-dd")); setError("");
    }}>Move to tank</Button>
    <Dialog open={snapshot != null} onOpenChange={open => { if (!open && !mutation.isPending) setSnapshot(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Move old unassigned stock to a tank</DialogTitle></DialogHeader>
        {snapshot && after && <>
          <p>{snapshot.partyName} · {snapshot.materialName}</p>
          <p>Full unassigned amount: <strong>{quantity(snapshot.unassigned)} {snapshot.stockUom}</strong></p>
          <Label>Tank
            <select aria-label="Tank" className="block w-full rounded-md border bg-background p-2" value={tank}
              disabled={mutation.isPending} onChange={event => setTank(Number(event.target.value) as 1 | 2)}>
              <option value="1">Tank 1</option><option value="2">Tank 2</option>
            </select>
          </Label>
          <Label>Date<Input aria-label="Assignment date" type="date" value={date} disabled={mutation.isPending} onChange={event => setDate(event.target.value)} /></Label>
          <table className="w-full text-sm" data-testid="tank-assignment-preview">
            <thead><tr><th className="text-left">Position</th><th>Before → after ({snapshot.stockUom})</th></tr></thead>
            <tbody>{([["tank1", "Tank 1"], ["tank2", "Tank 2"], ["unassigned", "Unassigned"], ["total", "Total"]] as const).map(([key, label]) =>
              <tr key={key}><th className="text-left">{label}</th><td className="text-center">{quantity(snapshot[key])} → {quantity(after[key])}</td></tr>)}</tbody>
          </table>
          <p className="text-sm text-muted-foreground">Total stock will not change. This is not a receipt or consumption entry.</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </>}
        <DialogFooter>
          <Button variant="outline" disabled={mutation.isPending} onClick={() => setSnapshot(null)}>Cancel</Button>
          <Button disabled={mutation.isPending || !date || !!error} onClick={() => mutation.mutate()}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
