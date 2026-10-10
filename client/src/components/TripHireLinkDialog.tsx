import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TripHireLinkDialog({ trip, onClose }: { trip: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState("");
  const [reason, setReason] = useState("");
  const [acceptConflict, setAcceptConflict] = useState(false);
  const url = `/api/site-material-trips/${trip.id}/hire-link`;
  const review = useQuery<any>({ queryKey: [url], staleTime: 0 });
  const data = review.data;
  const equipmentId = Number(chosen || data?.confirmation?.equipmentId || data?.suggestedEquipmentId || 0);
  const confirm = useMutation({
    mutationFn: async () => apiRequest("POST", url, { equipmentId, reason, acceptConflict,
      fingerprint: data.fingerprint, version: data.version }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-bills/hire-activities"] });
      queryClient.invalidateQueries({ queryKey: [url] });
      onClose();
    },
  });
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent><DialogHeader><DialogTitle>Confirm vehicle for hire billing</DialogTitle></DialogHeader>
      <p className="text-sm">{trip.date} · {trip.vehicleNumber || "Registration missing"} · Transport owner: {trip.supplier || "Not recorded"}</p>
      <p className="text-xs text-muted-foreground">This links billing evidence only. Original trip, material, supplier and quantities stay unchanged.</p>
      {review.isLoading && <p>Loading identity evidence…</p>}
      {review.isError && <p role="alert">Could not load the trip. <Button onClick={() => review.refetch()}>Retry</Button></p>}
      {data && <>
        {data.issue && <p role="status" className="text-sm text-amber-700">{data.issue}. Review the vehicle and owner manually.</p>}
        {data.confirmation && <p className="text-xs">Previous confirmation: {data.confirmation.actor} · {data.confirmation.reason}
          {data.confirmation.valid ? " · Current" : " · Stale—trip or master identity changed"}</p>}
        <Label htmlFor="hire-link-equipment">Hired Equipment Master vehicle</Label>
        <select id="hire-link-equipment" className="w-full rounded border bg-background p-2" value={equipmentId || ""} onChange={e => { setChosen(e.target.value); setAcceptConflict(false); }}>
          <option value="">Select vehicle</option>
          {data.equipment.map((e: any) => <option key={e.id} value={e.id}>{e.registrationNumber || e.name} · {e.vendorName} · {e.hireBillingBasis || "Terms missing"}</option>)}
        </select>
        <Label htmlFor="hire-link-reason">Verification reason / reference</Label>
        <Input id="hire-link-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="How the vehicle and transport owner were verified" />
        {equipmentId !== data.suggestedEquipmentId && <label className="flex gap-2 text-sm">
          <input type="checkbox" checked={acceptConflict} onChange={e => setAcceptConflict(e.target.checked)} />
          I verified this identity despite missing or conflicting registration/owner information.
        </label>}
        {confirm.isError && <p role="alert" className="text-sm text-destructive">{confirm.error.message}</p>}
        <Button disabled={confirm.isPending || !equipmentId || reason.trim().length < 3 || (equipmentId !== data.suggestedEquipmentId && !acceptConflict)} onClick={() => confirm.mutate()}>Confirm billing link</Button>
      </>}
    </DialogContent>
  </Dialog>;
}
