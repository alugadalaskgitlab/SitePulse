import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SiteMaterialTrip } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TripVendorPicker } from "./TripVendorPicker";
import { buildTripIdentityLinkPayload } from "./trip-link-utils";
import type { ExistingTripVendor } from "./trip-role-utils";

export function TripIdentityLinks({ trip, vendors, canConfirm, blocked, vendorsLoading, vendorsError, onSaved, onBusyChange, onRefresh }: {
  trip: SiteMaterialTrip; vendors: ExistingTripVendor[]; canConfirm: boolean; blocked: boolean;
  vendorsLoading: boolean; vendorsError: boolean; onSaved: (trip: SiteMaterialTrip) => void; onBusyChange: (busy: boolean) => void;
  onRefresh: () => void;
}) {
  const qc = useQueryClient();
  const [changing, setChanging] = useState(false);
  const [source, setSource] = useState({ name: "", id: null as number | null });
  const [transporter, setTransporter] = useState({ name: "", id: null as number | null });
  const [reason, setReason] = useState("");
  const needsSource = trip.materialSourceType !== "own_source";
  const needsTransport = trip.transportType !== "in_house";
  const completed = (!needsSource || trip.materialSourceVendorId != null) && (!needsTransport || trip.supplierVendorId != null);
  const suggestionFor = (name: string | null) => {
    const matches = vendors.filter(v => v.name.trim().toUpperCase() === (name || "").trim().toUpperCase());
    return matches.length === 1 ? matches[0] : null;
  };
  const suggestedSource = suggestionFor(trip.materialSourceSupplier);
  const suggestedTransporter = suggestionFor(trip.supplier);
  const names = trip as SiteMaterialTrip & { linkedMaterialSupplierName?: string | null; linkedTransporterName?: string | null };
  const vendorName = (id: number | null, currentName?: string | null) => id == null ? "Not linked" : currentName || vendors.find(v => v.id === id)?.name || `Vendor Master #${id}`;
  const save = useMutation({
    mutationFn: async () => {
      if (!canConfirm || blocked) throw new Error("Only an authorised reviewer can confirm historical identities.");
      const payload = buildTripIdentityLinkPayload(trip, {
        ...(needsSource && source.id != null ? { materialSourceVendorId: source.id } : {}),
        ...(needsTransport && transporter.id != null ? { supplierVendorId: transporter.id } : {}),
      }, reason);
      onBusyChange(true);
      const response = await apiRequest("POST", `/api/site-material-trips/${trip.id}/identity-links`, payload);
      const result = await response.json();
      return result.trip || result;
    },
    onSuccess: async (updated) => {
      onSaved({ ...trip, ...updated });
      await qc.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/site-material-trips") });
      qc.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/vendor-master/review") });
      setChanging(false); setSource({ name: "", id: null }); setTransporter({ name: "", id: null }); setReason("");
    },
    onSettled: () => onBusyChange(false),
  });
  return <section className="space-y-3 rounded-lg border p-4">
    <h3 className="font-semibold">Reviewed Vendor Master identities</h3>
    <dl className="space-y-2 text-sm" data-testid="trip-vendor-saved-results">
      <div><dt className="text-muted-foreground">Material source · recorded</dt><dd>{trip.materialSourceType === "own_source" ? trip.materialSourceLabel || "Our own source" : trip.materialSourceSupplier || "Not recorded"}</dd>
        <dd className="font-medium">{needsSource ? vendorName(trip.materialSourceVendorId, names.linkedMaterialSupplierName) : "Our own source · no material vendor"}</dd></div>
      <div><dt className="text-muted-foreground">Transporter · recorded</dt><dd>{trip.supplier || (needsTransport ? "Not recorded" : "Our own vehicle")}</dd>
        <dd className="font-medium">{needsTransport ? vendorName(trip.supplierVendorId, names.linkedTransporterName) : "Internal fleet · no transporter vendor"}</dd></div>
    </dl>
    <p className="text-xs text-muted-foreground">Linking changes reviewed IDs only, never these recorded names. Material supplier and transporter are reviewed separately.</p>
    {canConfirm && completed && !changing && <Button type="button" variant="outline" disabled={blocked} onClick={() => setChanging(true)}>Change vendor links</Button>}
    {canConfirm && (!completed || changing) && <fieldset disabled={blocked || save.isPending || vendorsLoading || vendorsError} className="space-y-3">
      {needsSource && trip.materialSourceVendorId == null && suggestedSource && <p className="text-xs text-muted-foreground">Suggested material supplier: {suggestedSource.name} · #{suggestedSource.id}. Select it below only after reviewing.</p>}
      {needsSource && <TripVendorPicker label="Material supplier match" name={source.name} vendorId={source.id} vendors={vendors} onChange={(name, id) => setSource({ name, id })} />}
      {needsTransport && trip.supplierVendorId == null && suggestedTransporter && <p className="text-xs text-muted-foreground">Suggested transporter: {suggestedTransporter.name} · #{suggestedTransporter.id}. Select it below only after reviewing.</p>}
      {needsTransport && <TripVendorPicker label="Transporter match" name={transporter.name} vendorId={transporter.id} vendors={vendors} onChange={(name, id) => setTransporter({ name, id })} />}
      <Input aria-label="Vendor identity verification reason" placeholder="Verification reason / reference" value={reason} onChange={e => setReason(e.target.value)} />
      {save.isError && <div role="alert" className="text-sm text-destructive">
        <p>{save.error.message} Refresh the review if another user changed the links.</p>
        <Button type="button" variant="outline" onClick={onRefresh}>Refresh vendor review</Button>
      </div>}
      <Button type="button" disabled={blocked || save.isPending || reason.trim().length < 3 || (!source.id && !transporter.id)} onClick={() => save.mutate()}>Confirm vendor links</Button>
      {changing && <Button type="button" variant="ghost" onClick={() => setChanging(false)}>Keep saved vendor links</Button>}
    </fieldset>}
    {!canConfirm && !completed && <p className="text-xs text-muted-foreground">Historical Vendor Master confirmation requires Administrator / Owner authority.</p>}
  </section>;
}
