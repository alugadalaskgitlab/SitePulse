import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TripEquipmentPicker } from "./TripEquipmentPicker";
import { equipmentIdentityLabel } from "./trip-link-utils";
import { useAuth } from "@/lib/auth-context";

/** Inline review is shared by the consolidated roles dialog and legacy wrapper. */
export function TripHireLinkReview({ trip, blocked = false, onBusyChange }: {
  trip: any; blocked?: boolean; onBusyChange?: (busy: boolean) => void;
}) {
  const { sectionCan } = useAuth();
  const canEdit = sectionCan("site_materials", "edit");
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState("");
  const [reason, setReason] = useState("");
  const [acceptConflict, setAcceptConflict] = useState(false);
  const [changing, setChanging] = useState(false);
  const url = `/api/site-material-trips/${trip.id}/hire-link`;
  const review = useQuery<any>({ queryKey: [url], staleTime: 0 });
  const data = review.data;
  const equipmentId = Number(chosen || data?.confirmation?.equipmentId || data?.suggestedEquipmentId || 0);
  const linkedEquipment = data?.equipment?.find((e: any) => e.id === data.confirmation?.equipmentId);
  const confirm = useMutation({
    mutationFn: async () => {
      if (!canEdit || blocked || review.isFetching || !data) throw new Error("Refresh trip evidence before confirming.");
      onBusyChange?.(true);
      return apiRequest("POST", url, { equipmentId, reason, acceptConflict,
        fingerprint: data.fingerprint, version: data.version });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/vendor-bills") });
      await queryClient.invalidateQueries({ queryKey: [url] });
      setChanging(false);
      setChosen("");
      setReason("");
      setAcceptConflict(false);
    },
    onSettled: () => onBusyChange?.(false),
  });
  return <section className="space-y-3 rounded-lg border p-4" data-testid="trip-hire-link-review">
      <h3 className="font-semibold">Equipment Master match / Hire link</h3>
      <p className="text-sm">{trip.date} · {trip.vehicleNumber || "Registration missing"} · Transport owner: {trip.supplier || "Not recorded"}</p>
      <p className="text-xs text-muted-foreground">An audited vehicle association only. Original registration, names and quantities stay unchanged. Hire terms are reviewed separately in the authorised bill workflow.</p>
      {review.isLoading && <div className="h-24 animate-pulse rounded-md bg-muted" role="status" aria-label="Loading identity evidence" />}
      {review.isError && <p role="alert">Could not load the trip. <Button type="button" variant="outline" onClick={() => review.refetch()}>Retry</Button></p>}
      {data && !review.isError && <>
        <p role="status" className="text-sm font-medium">{data.confirmation?.valid ? "Vehicle Linked" : data.confirmation ? "Review Required" : "Vehicle Link Pending"}</p>
        {data.issue && !data.confirmation?.valid && <p role="status" className="text-sm text-amber-700">{data.issue}. Review the vehicle and owner manually.</p>}
        {data.confirmation && <div className="rounded-md bg-muted/20 p-3 space-y-1" data-testid="trip-hire-saved-result">
          <p className="text-sm">{linkedEquipment ? equipmentIdentityLabel(linkedEquipment) : `Equipment #${data.confirmation.equipmentId} · no longer available`}</p>
          <p className="text-xs">Confirmed by {data.confirmation.actor || "Reviewer"}{data.confirmation.at ? ` · ${new Date(data.confirmation.at).toLocaleString()}` : ""} · {data.confirmation.reason}
            {data.confirmation.valid ? " · Current" : " · Trip or master identity changed"}</p>
        </div>}
        {linkedEquipment?.ownerReviewIssue && <p role="status" className="text-sm text-amber-700">Owner Review Required: {linkedEquipment.ownerReviewIssue}. Review separately in Vendor Master → Link Vendors.</p>}
        {canEdit && data.confirmation?.valid && !changing && <Button type="button" variant="outline" disabled={blocked || review.isFetching} onClick={() => setChanging(true)}>Change link</Button>}
        {canEdit && (!data.confirmation?.valid || changing) && <fieldset disabled={blocked || confirm.isPending || review.isFetching} className="space-y-3">
        <TripEquipmentPicker options={data.equipment || []} value={equipmentId ? String(equipmentId) : ""} registration={trip.vehicleNumber || ""}
          onChange={id => { setChosen(id || "0"); setAcceptConflict(false); }} />
        <Label htmlFor="hire-link-reason">Verification reason / reference</Label>
        <Input id="hire-link-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="How the vehicle and transport owner were verified" />
        {equipmentId !== data.suggestedEquipmentId && <label className="flex gap-2 text-sm">
          <input type="checkbox" checked={acceptConflict} onChange={e => setAcceptConflict(e.target.checked)} />
          I verified this identity despite missing or conflicting registration/owner information.
        </label>}
        {confirm.isError && <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>{confirm.error.message}</p>
          <Button type="button" variant="outline" onClick={() => { setAcceptConflict(false); review.refetch(); }}>Refresh vehicle review</Button>
        </div>}
        <Button type="button" disabled={blocked || review.isFetching || confirm.isPending || !equipmentId || reason.trim().length < 3 || (equipmentId !== data.suggestedEquipmentId && !acceptConflict)} onClick={() => confirm.mutate()}>Confirm vehicle link</Button>
        {changing && <Button type="button" variant="ghost" onClick={() => { setChanging(false); setChosen(""); setReason(""); setAcceptConflict(false); }}>Keep saved link</Button>}
        </fieldset>}
        {!canEdit && !data.confirmation?.valid && <p className="text-xs text-muted-foreground">An authorised editor can review this vehicle link.</p>}
      </>}
      {blocked && <p className="text-xs text-amber-700">Save or discard role corrections first. Vehicle evidence must be refreshed before confirming.</p>}
  </section>;
}

export function TripHireLinkDialog({ trip, onClose }: { trip: any; onClose: () => void }) {
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent><DialogHeader><DialogTitle>Trip vehicle review</DialogTitle></DialogHeader>
      <TripHireLinkReview trip={trip} />
    </DialogContent>
  </Dialog>;
}
