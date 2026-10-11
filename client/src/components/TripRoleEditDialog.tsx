import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { classifyTripRoles, tripRolePayload, validateTripRoles, type TripTransportRole } from "@shared/tripTransportRoles";
import type { EquipmentMasterType, SiteMaterialTrip, Site } from "@shared/schema";
import { ReceiptWorkContext, type TripWorkContext } from "./ReceiptWorkContext";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSiteMaterialSuggestions, invalidateSiteMaterialSuggestions } from "@/hooks/use-site-material-suggestions";
import { TripTransportRoleFields, type TripRoleDraft } from "./TripTransportRoleFields";
import type { ExistingTripVendor } from "./trip-role-utils";
import { useAuth } from "@/lib/auth-context";
import { TripHireLinkReview } from "./TripHireLinkDialog";
import { TripIdentityLinks } from "./TripIdentityLinks";

type Props = {
  trip: SiteMaterialTrip;
  vendors: ExistingTripVendor[];
  equipment: EquipmentMasterType[];
  vendorsLoading: boolean;
  vendorsError: boolean;
  onRetryVendors: () => void;
  onClose: () => void;
  sitesList?: Site[];
};

/** Mounted afresh per trip. Opening/closing never performs a mutation. */
export function TripRoleEditDialog({ trip: originalTrip, vendors, equipment, vendorsLoading, vendorsError, onRetryVendors, onClose, sitesList = [] }: Props) {
  const { sectionCan, isAdmin, isOwner } = useAuth();
  const canEdit = sectionCan("site_materials", "edit");
  const [savedTrip, setSavedTrip] = useState(originalTrip);
  const evidenceUrl = `/api/site-material-trips/${originalTrip.id}/hire-link`;
  const evidence = useQuery<any>({ queryKey: [evidenceUrl], staleTime: 0 });
  const trip: SiteMaterialTrip = { ...savedTrip, ...(evidence.data?.trip || {}) };
  const [editing, setEditing] = useState(false);
  const [linksBusy, setLinksBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const initialContext: TripWorkContext = {
    boqProjectId:trip.boqProjectId??null, boqItemId:trip.boqItemId??null,
    programmeBarId:trip.programmeBarId??null, earthworkArrangementId:trip.earthworkArrangementId??null,
  };
  const [context, setContext] = useState(initialContext);
  const [contextEdited, setContextEdited] = useState(false);
  const storedRole = classifyTripRoles(trip);
  const [choice, setChoice] = useState<TripTransportRole | null>(
    storedRole === "unresolved" ? null
      : storedRole === "own_source_agency" ? "different_parties"
      : storedRole === "own_source_in_house" ? "in_house" : storedRole,
  );
  const [draft, setDraft] = useState<TripRoleDraft>({
    materialSourceSupplier: trip.materialSourceSupplier || "",
    materialSourceType: trip.materialSourceType ?? null,
    materialSourceLabel: trip.materialSourceLabel ?? null,
    supplier: trip.supplier || "",
    vehicleNumber: trip.vehicleNumber || "",
    internalEquipmentId: trip.internalEquipmentId,
  });
  const [error, setError] = useState("");
  const suggestions = useSiteMaterialSuggestions(trip.site);
  const save = useMutation({
    mutationFn: async () => {
      if (!canEdit || linksBusy) throw new Error("Trip editing is not permitted right now.");
      if (!choice || choice === "unresolved") throw new Error("Choose Who brought it before saving.");
      const ownSource = draft.materialSourceType === "own_source";
      // Role corrections are explicit edits, not identity confirmations. Untouched
      // historical names/IDs are preserved; new identities use the audited ID flow.
      const source = ownSource ? { name: "", id: null } : {
        name: draft.materialSourceSupplier,
        id: draft.materialSourceSupplier === trip.materialSourceSupplier ? trip.materialSourceVendorId : null,
      };
      const transporter = choice === "different_parties" ? {
        name: draft.supplier,
        id: draft.supplier === trip.supplier ? trip.supplierVendorId : null,
      } : source;
      const selected = equipment.find((item) => item.id === draft.internalEquipmentId) ?? null;
      const payload = tripRolePayload(choice, source, transporter, selected, draft.vehicleNumber, {
        materialSourceType: draft.materialSourceType,
        materialSourceLabel: draft.materialSourceLabel,
      }, false);
      const issue = validateTripRoles(payload, false);
      if (issue) throw new Error(issue);
      // Same-party role payloads normally copy the source ID to the carrier.
      // On a historical record this must not silently fill a missing carrier ID.
      if (choice === "same_party") payload.supplierVendorId =
        draft.materialSourceSupplier === trip.supplier ? trip.supplierVendorId : null;
      const contextPatch = contextEdited ? Object.fromEntries(
        (Object.keys(initialContext) as (keyof TripWorkContext)[])
          .filter(key=>context[key]!==initialContext[key]).map(key=>[key,context[key]])
      ) : {};
      const response = await apiRequest("PATCH", `/api/site-material-trips/${trip.id}`, {...payload,...contextPatch});
      const updated = await response.json();
      return { ...trip, ...payload, ...contextPatch, ...(updated.trip || updated) } as SiteMaterialTrip;
    },
    onSuccess: async (updated) => {
      setSavedTrip(updated);
      await queryClient.invalidateQueries({ predicate: (query) => typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/site-material-trips") });
      queryClient.invalidateQueries({ predicate: (query) => typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/materials-received") });
      invalidateSiteMaterialSuggestions(trip.site);
      setEditing(false);
      setNotice("Roles saved. Vehicle review refreshed; inspect the current result below.");
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Roles could not be saved. Retry."),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && !linksBusy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" data-testid="dialog-trip-roles">
        <DialogHeader>
          <DialogTitle>Trip Details / Review Links · Trip #{trip.id}</DialogTitle>
          <DialogDescription>{trip.date} · {trip.site} · {trip.material} · {trip.vehicleNumber || "Registration missing"}. Review source, transporter and equipment independently. Linking never rewrites original names or registration.</DialogDescription>
        </DialogHeader>
        <p role="status" className="text-sm font-medium">{storedRole === "unresolved" ? "Roles Pending" : "Roles Confirmed"}</p>
        {notice && <p role="status" className="rounded-md border bg-muted/20 p-3 text-sm">{notice}</p>}
        <details className="rounded-md border bg-muted/20 p-3 text-xs" data-testid="trip-role-raw-values">
          <summary className="cursor-pointer font-medium">Original recorded values · when this review opened</summary>
          <dl className="grid grid-cols-2 gap-1 break-words">
            {[
              ["materialSourceSupplier", originalTrip.materialSourceSupplier],
              ["materialSourceType", originalTrip.materialSourceType],
              ["materialSourceLabel", originalTrip.materialSourceLabel],
              ["materialSourceVendorId", originalTrip.materialSourceVendorId],
              ["supplier", originalTrip.supplier],
              ["supplierVendorId", originalTrip.supplierVendorId],
              ["transportType", originalTrip.transportType],
              ["internalEquipmentId", originalTrip.internalEquipmentId],
              ["vehicleNumber", originalTrip.vehicleNumber],
            ].map(([field, value]) => <div key={String(field)} className="col-span-2 grid grid-cols-2 gap-2"><dt>{field}</dt><dd className="font-mono">{value == null ? "NULL" : JSON.stringify(value)}</dd></div>)}
          </dl>
        </details>
        {storedRole === "unresolved" && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200" data-testid="trip-roles-unresolved">Transport/source roles not yet confirmed — set Material from and Who brought it</p>}
        {vendorsError && <p role="alert" className="text-sm text-destructive">Vendor options unavailable. <button type="button" onClick={onRetryVendors} className="underline">Retry</button></p>}
        <TripIdentityLinks trip={trip} vendors={vendors} canConfirm={canEdit && (isAdmin || isOwner)}
          blocked={editing || save.isPending || linksBusy || evidence.isFetching} vendorsLoading={vendorsLoading} vendorsError={vendorsError}
          onSaved={setSavedTrip} onBusyChange={setLinksBusy} onRefresh={() => void evidence.refetch()} />
        {canEdit && !editing && <Button type="button" variant="outline" disabled={linksBusy || evidence.isFetching} onClick={() => {
          setChoice(storedRole === "unresolved" ? null : storedRole === "own_source_agency" ? "different_parties" : storedRole === "own_source_in_house" ? "in_house" : storedRole);
          setDraft({ materialSourceSupplier: trip.materialSourceSupplier || "", materialSourceType: trip.materialSourceType,
            materialSourceLabel: trip.materialSourceLabel, supplier: trip.supplier || "", vehicleNumber: trip.vehicleNumber || "", internalEquipmentId: trip.internalEquipmentId });
          setContext({ boqProjectId: trip.boqProjectId ?? null, boqItemId: trip.boqItemId ?? null, programmeBarId: trip.programmeBarId ?? null, earthworkArrangementId: trip.earthworkArrangementId ?? null });
          setContextEdited(false); setEditing(true); setError(""); setNotice("");
        }}>Correct roles / work context</Button>}
        {canEdit && editing && <fieldset disabled={save.isPending || linksBusy} className="space-y-3">
        <p className="text-xs text-amber-700">Explicit correction: saving may change recorded role names or registration. To preserve recorded values, discard this form and use the reviewed links above.</p>
        <TripTransportRoleFields choice={choice} onChoice={setChoice} value={draft} onChange={setDraft} vendors={vendors} equipment={equipment.filter((item) => item.ownership === "owned" && (item.isActive || item.id === draft.internalEquipmentId))} sourceSuggestions={suggestions.materialSourceSuppliers} supplierSuggestions={suggestions.suppliers} vehicleSuggestions={suggestions.vehicles} suggestionError={suggestions.error} vendorsLoading={vendorsLoading} vendorsError={vendorsError} onRetryVendors={onRetryVendors} testIdPrefix="edit-trip" />
        <ReceiptWorkContext siteName={trip.site} sitesList={sitesList} operationalDate={trip.date}
          value={context} onChange={next=>{setContextEdited(true);setContext(next);}}
          manualOnly testIdPrefix="edit-trip-work-context" />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={save.isPending} onClick={() => setEditing(false)}>Discard corrections</Button>
          <Button type="button" disabled={save.isPending} onClick={() => { setError(""); save.mutate(); }} data-testid="button-save-trip-roles">{save.isPending ? "Saving roles…" : "Save roles"}</Button>
        </div>
        </fieldset>}
        {trip.transportType === "in_house" ? <p className="rounded-md border p-3 text-sm">Our own vehicle · {equipment.find(e => e.id === trip.internalEquipmentId)?.name || `Equipment #${trip.internalEquipmentId}`} · hire link not required.</p>
          : <TripHireLinkReview trip={trip} blocked={editing || save.isPending || linksBusy} onBusyChange={setLinksBusy} />}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={save.isPending || linksBusy} onClick={onClose}>Close review</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
