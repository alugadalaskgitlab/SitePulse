import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { classifyTripRoles, tripRolePayload, validateTripRoles, type TripTransportRole } from "@shared/tripTransportRoles";
import type { EquipmentMasterType, SiteMaterialTrip, Site } from "@shared/schema";
import { ReceiptWorkContext, type TripWorkContext } from "./ReceiptWorkContext";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSiteMaterialSuggestions, invalidateSiteMaterialSuggestions } from "@/hooks/use-site-material-suggestions";
import { TripTransportRoleFields, type TripRoleDraft } from "./TripTransportRoleFields";
import { resolveTripVendor, type ExistingTripVendor } from "./trip-role-utils";

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
export function TripRoleEditDialog({ trip, vendors, equipment, vendorsLoading, vendorsError, onRetryVendors, onClose, sitesList = [] }: Props) {
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
      if (!choice || choice === "unresolved") throw new Error("Choose Who brought it before saving.");
      const ownSource = draft.materialSourceType === "own_source";
      if ((!ownSource || choice === "different_parties") && (vendorsLoading || vendorsError)) throw new Error("Load the existing vendors before saving.");
      const source = ownSource ? { name: "", id: null } : resolveTripVendor(draft.materialSourceSupplier, vendors);
      const transporter = choice === "different_parties" ? resolveTripVendor(draft.supplier, vendors) : source;
      const selected = equipment.find((item) => item.id === draft.internalEquipmentId) ?? null;
      const payload = tripRolePayload(choice, source, transporter, selected, draft.vehicleNumber, {
        materialSourceType: draft.materialSourceType,
        materialSourceLabel: draft.materialSourceLabel,
      }, false);
      const issue = validateTripRoles(payload, false);
      if (issue) throw new Error(issue);
      const contextPatch = contextEdited ? Object.fromEntries(
        (Object.keys(initialContext) as (keyof TripWorkContext)[])
          .filter(key=>context[key]!==initialContext[key]).map(key=>[key,context[key]])
      ) : {};
      await apiRequest("PATCH", `/api/site-material-trips/${trip.id}`, {...payload,...contextPatch});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/site-material-trips") });
      queryClient.invalidateQueries({ predicate: (query) => typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/materials-received") });
      invalidateSiteMaterialSuggestions(trip.site);
      onClose();
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Roles could not be saved. Retry."),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" data-testid="dialog-trip-roles">
        <DialogHeader>
          <DialogTitle>Confirm material and transport roles · Trip #{trip.id}</DialogTitle>
          <DialogDescription>Confirm roles and optionally correct the BOQ item, programme reach or arrangement. Untouched work context is preserved. Quantity, date, site, material and receipt number are not changed.</DialogDescription>
        </DialogHeader>
        <div className="rounded-md border bg-muted/20 p-3 text-xs" data-testid="trip-role-raw-values">
          <p className="mb-1 font-medium">Stored values (unchanged until Save roles)</p>
          <dl className="grid grid-cols-2 gap-1 break-words">
            {[
              ["materialSourceSupplier", trip.materialSourceSupplier],
              ["materialSourceType", trip.materialSourceType],
              ["materialSourceLabel", trip.materialSourceLabel],
              ["materialSourceVendorId", trip.materialSourceVendorId],
              ["supplier", trip.supplier],
              ["supplierVendorId", trip.supplierVendorId],
              ["transportType", trip.transportType],
              ["internalEquipmentId", trip.internalEquipmentId],
              ["vehicleNumber", trip.vehicleNumber],
            ].map(([field, value]) => <div key={String(field)} className="col-span-2 grid grid-cols-2 gap-2"><dt>{field}</dt><dd className="font-mono">{value == null ? "NULL" : JSON.stringify(value)}</dd></div>)}
          </dl>
        </div>
        {storedRole === "unresolved" && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200" data-testid="trip-roles-unresolved">Transport/source roles not yet confirmed — set Material from and Who brought it</p>}
        <TripTransportRoleFields choice={choice} onChoice={setChoice} value={draft} onChange={setDraft} vendors={vendors} equipment={equipment.filter((item) => item.ownership === "owned" && (item.isActive || item.id === draft.internalEquipmentId))} sourceSuggestions={suggestions.materialSourceSuppliers} supplierSuggestions={suggestions.suppliers} vehicleSuggestions={suggestions.vehicles} suggestionError={suggestions.error} vendorsLoading={vendorsLoading} vendorsError={vendorsError} onRetryVendors={onRetryVendors} testIdPrefix="edit-trip" />
        <ReceiptWorkContext siteName={trip.site} sitesList={sitesList} operationalDate={trip.date}
          value={context} onChange={next=>{setContextEdited(true);setContext(next);}}
          manualOnly testIdPrefix="edit-trip-work-context" />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={save.isPending} onClick={() => { setError(""); save.mutate(); }} data-testid="button-save-trip-roles">{save.isPending ? "Saving roles…" : "Save roles"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
