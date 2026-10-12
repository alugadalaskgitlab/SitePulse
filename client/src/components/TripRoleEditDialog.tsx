import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { classifyTripRoles, tripRolePayload, validateTripRoles, type TripTransportRole } from "@shared/tripTransportRoles";
import type { EquipmentMasterType, SiteMaterialTrip, Site } from "@shared/schema";
import { ReceiptWorkContext, type TripWorkContext } from "./ReceiptWorkContext";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { invalidateSiteMaterialSuggestions } from "@/hooks/use-site-material-suggestions";
import { TripTransportRoleFields, type TripRoleDraft } from "./TripTransportRoleFields";
import { resolveSelectedTripVendor, type ExistingTripVendor } from "./trip-role-utils";
import { tripMasterSelection } from "./trip-master-selection";
import { useAuth } from "@/lib/auth-context";
import { TripHireLinkReview } from "./TripHireLinkDialog";
import { TripIdentityLinks } from "./TripIdentityLinks";

type Props = {
  trip: SiteMaterialTrip; vendors: ExistingTripVendor[]; equipment: EquipmentMasterType[];
  vendorsLoading: boolean; vendorsError: boolean; onRetryVendors: () => void;
  onClose: () => void; sitesList?: Site[];
  onSaved?: (trip: SiteMaterialTrip) => void;
};

/** One ordinary edit/save; exceptional reviewed corrections remain separate. */
export function TripRoleEditDialog({ trip: originalTrip, vendors, equipment, vendorsLoading, vendorsError, onRetryVendors, onClose, onSaved, sitesList = [] }: Props) {
  const { sectionCan, isAdmin, isOwner } = useAuth();
  // Match the server's assertEdit guard; a UI unlock is not an edit right.
  const canEdit = isAdmin || isOwner || sectionCan("site_materials", "edit");
  const [trip, setTrip] = useState(originalTrip);
  const [exceptional, setExceptional] = useState(false);
  const [linksBusy, setLinksBusy] = useState(false);
  const evidence = useQuery<any>({ queryKey: [`/api/site-material-trips/${trip.id}/hire-link`] });
  const equipmentTouched = useRef(false);
  const evidenceInitialized = useRef(false);
  const initialContext: TripWorkContext = {
    boqProjectId: trip.boqProjectId ?? null, boqItemId: trip.boqItemId ?? null,
    programmeBarId: trip.programmeBarId ?? null, earthworkArrangementId: trip.earthworkArrangementId ?? null,
  };
  const [context, setContext] = useState(initialContext);
  const [contextEdited, setContextEdited] = useState(false);
  const role = classifyTripRoles(trip);
  const [choice, setChoice] = useState<TripTransportRole | null>(
    role === "own_source_agency" ? "different_parties" : role === "own_source_in_house" ? "in_house" : role === "unresolved" ? null : role,
  );
  const [draft, setDraft] = useState<TripRoleDraft>({
    materialSourceSupplier: trip.materialSourceSupplier || "", materialSourceVendorId: trip.materialSourceVendorId,
    materialSourceType: trip.materialSourceType ?? "vendor", materialSourceLabel: trip.materialSourceLabel,
    supplier: trip.supplier || "", supplierVendorId: trip.supplierVendorId,
    vehicleNumber: trip.vehicleNumber || "", internalEquipmentId: trip.internalEquipmentId,
    equipmentId: trip.internalEquipmentId,
  });
  useEffect(() => {
    if (!evidence.data || evidenceInitialized.current) return;
    evidenceInitialized.current = true;
    if (!equipmentTouched.current && evidence.data.confirmation?.equipmentId) {
      setDraft(prev => ({ ...prev, equipmentId: evidence.data.confirmation.equipmentId }));
    }
  }, [evidence.data]);
  const [fields, setFields] = useState({
    date: trip.date, time: trip.time || "", site: trip.site, material: trip.material,
    quantity: String(trip.quantity ?? ""), uom: trip.uom, location: trip.location || "",
    receiptNumber: trip.receiptNumber || "", enteredBy: trip.enteredBy || "", notes: trip.notes || "",
    workType: trip.workType || "", unloadedAt: trip.unloadedAt || "stretch", yardLabel: trip.yardLabel || "",
  });
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      if (!canEdit || linksBusy) throw new Error("Trip editing is not permitted right now.");
      if (!choice || choice === "unresolved") throw new Error("Choose the transporter arrangement.");
      if (!fields.date || !fields.site.trim() || !fields.material.trim() || !(Number(fields.quantity) > 0)) throw new Error("Date, Site, Material and a positive Quantity are required.");
      const ownSource = draft.materialSourceType === "own_source";
      const party = (name: string, id: number | null | undefined, manual: boolean | undefined, oldName: string | null, oldId: number | null) => {
        // Untouched historical text is not guessed into an ID.
        if (name === (oldName || "") && (id ?? null) === oldId) return { name, id: oldId };
        return manual ? { name: name.trim(), id: null } : resolveSelectedTripVendor(name, id, vendors);
      };
      const source = ownSource ? { name: "", id: null } : party(draft.materialSourceSupplier, draft.materialSourceVendorId, draft.materialSourceManual, trip.materialSourceSupplier, trip.materialSourceVendorId);
      const transporter = choice === "different_parties" ? party(draft.supplier, draft.supplierVendorId, draft.supplierManual, trip.supplier, trip.supplierVendorId) : source;
      const selected = equipment.find(item => item.id === draft.internalEquipmentId && item.ownership === "owned") ?? null;
      const payload = tripRolePayload(choice, source, transporter, selected, draft.vehicleNumber, { materialSourceType: draft.materialSourceType, materialSourceLabel: draft.materialSourceLabel }, false);
      if (choice === "same_party" && draft.materialSourceSupplier === trip.materialSourceSupplier && (draft.materialSourceVendorId ?? null) === trip.materialSourceVendorId) payload.supplierVendorId = trip.supplierVendorId;
      const issue = validateTripRoles(payload, false);
      if (issue) throw new Error(issue);
      if (equipmentTouched.current && !draft.equipmentId && !draft.vehicleManual) throw new Error("Select an Equipment Master vehicle, or choose Other / Not in Master.");
      const contextPatch = contextEdited ? Object.fromEntries(
        (Object.keys(initialContext) as (keyof TripWorkContext)[]).filter(key => context[key] !== initialContext[key]).map(key => [key, context[key]]),
      ) : {};
      const vendorChanged = payload.materialSourceVendorId !== trip.materialSourceVendorId || payload.supplierVendorId !== trip.supplierVendorId;
      if (vendorChanged && (evidence.isLoading || evidence.isError)) throw new Error("Load the saved vehicle association before changing vendor identities.");
      const response = await apiRequest("PATCH", `/api/site-material-trips/${trip.id}`, {
        ...fields, quantity: Number(fields.quantity), ...payload, ...contextPatch,
        ...tripMasterSelection(draft.equipmentId, equipmentTouched.current || vendorChanged),
      });
      return response.json();
    },
    onSuccess: (updated: SiteMaterialTrip) => {
      queryClient.invalidateQueries({ predicate: q => {
        const key = q.queryKey[0];
        return typeof key === "string" && ["/api/site-material-trips", "/api/vendor-bills", "/api/materials-received"].some(prefix => key.startsWith(prefix));
      } });
      invalidateSiteMaterialSuggestions([trip.site, updated.site]);
      onSaved?.(updated);
      onClose();
    },
    onError: cause => setError(cause instanceof Error ? cause.message : "Trip could not be saved. Retry."),
  });
  return <Dialog open onOpenChange={open => !open && !save.isPending && !linksBusy && onClose()}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" data-testid="dialog-trip-roles"
      onEscapeKeyDown={event => {
        // Radix handles Escape in document capture, before the input can dismiss its list.
        const focused = document.activeElement;
        if (focused?.getAttribute("role") === "combobox" && focused.getAttribute("aria-expanded") === "true")
          event.preventDefault();
      }}>
      <DialogHeader><DialogTitle>{canEdit ? "Edit Material Trip" : "Material Trip Details"}</DialogTitle><DialogDescription>{trip.date} · {trip.site} · {trip.material}</DialogDescription></DialogHeader>
      {evidence.isLoading && <div className="h-8 animate-pulse rounded bg-muted" role="status" aria-label="Loading saved vehicle association" />}
      {evidence.isError && <p role="alert" className="text-sm text-destructive">Saved vehicle association unavailable. <button type="button" className="underline" onClick={() => evidence.refetch()}>Retry</button></p>}
      {!exceptional ? <form onSubmit={e => { e.preventDefault(); setError(""); save.mutate(); }} className="space-y-4">
        <fieldset disabled={!canEdit || save.isPending || linksBusy} className="space-y-4">
          <h3 className="text-sm font-semibold">Material Details</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(["date", "time", "site", "material", "quantity", "uom"] as const).map(key => <div key={key}><Label htmlFor={`edit-trip-${key}`}>{({ date: "Date", time: "Time", site: "Site", material: "Material", quantity: "Quantity", uom: "Unit" })[key]}</Label>
              {key === "site" ? <select id={`edit-trip-${key}`} className="w-full rounded-md border bg-background p-2 text-sm" value={fields.site} onChange={e => setFields(prev => ({ ...prev, site: e.target.value }))}>
                {!sitesList.some(s => s.name === fields.site) && <option value={fields.site}>{fields.site}</option>}
                {sitesList.filter(s => s.isActive || s.name === fields.site).map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select> : <Input id={`edit-trip-${key}`} type={key === "date" || key === "time" ? key : key === "quantity" ? "number" : "text"} step={key === "quantity" ? "any" : undefined} value={fields[key]} onChange={e => setFields(prev => ({ ...prev, [key]: e.target.value }))} />}
            </div>)}
          </div>
          <h3 className="text-sm font-semibold">Transportation Details</h3>
          <TripTransportRoleFields choice={choice} onChoice={setChoice} value={draft} onChange={next => {
            if (next.equipmentId !== draft.equipmentId || next.vehicleNumber !== draft.vehicleNumber || next.vehicleManual !== draft.vehicleManual) equipmentTouched.current = true;
            setDraft(next);
          }} vendors={vendors} equipment={equipment} vendorsLoading={vendorsLoading} vendorsError={vendorsError} onRetryVendors={onRetryVendors} allowManualParties testIdPrefix="edit-trip" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(["location", "receiptNumber", "enteredBy", "notes", "workType", "unloadedAt", "yardLabel"] as const).map(key => <div key={key}><Label htmlFor={`edit-trip-${key}`}>{({ location: "Location / Chainage", receiptNumber: "Receipt Number", enteredBy: "Entered By", notes: "Notes", workType: "Work Type", unloadedAt: "Unloaded At", yardLabel: "Yard Label" })[key]}</Label>
              {key === "workType" || key === "unloadedAt" ? <select id={`edit-trip-${key}`} className="w-full rounded-md border bg-background p-2 text-sm" value={fields[key]} onChange={e => setFields(prev => ({ ...prev, [key]: e.target.value }))}>
                {key === "workType" ? <><option value="">Not specified</option><option value="road">Road</option><option value="structure">Structure</option></> : <><option value="stretch">Work Stretch</option><option value="yard">Temporary Yard</option></>}
              </select> : <Input id={`edit-trip-${key}`} value={fields[key]} onChange={e => setFields(prev => ({ ...prev, [key]: e.target.value }))} />}
            </div>)}
          </div>
          <ReceiptWorkContext siteName={fields.site} sitesList={sitesList} operationalDate={fields.date} value={context} onChange={next => { setContextEdited(true); setContext(next); }} manualOnly testIdPrefix="edit-trip-work-context" />
        </fieldset>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>Cancel</Button>{canEdit && <Button type="submit" disabled={save.isPending} data-testid="button-save-trip-roles">{save.isPending ? "Saving…" : "Save"}</Button>}</DialogFooter>
      </form> : <div className="space-y-4">
        <p className="text-xs text-muted-foreground">Authorised correction of conflicting or protected identities. Routine selections are saved in Edit.</p>
        <TripIdentityLinks trip={trip} vendors={vendors} canConfirm={canEdit && (isAdmin || isOwner)} blocked={linksBusy || save.isPending || evidence.isFetching} vendorsLoading={vendorsLoading} vendorsError={vendorsError} onSaved={setTrip} onBusyChange={setLinksBusy} onRefresh={() => void evidence.refetch()} />
        {trip.transportType !== "in_house" && <TripHireLinkReview trip={trip} blocked={save.isPending} onBusyChange={setLinksBusy} />}
      </div>}
      {canEdit && <Button type="button" variant="ghost" className="text-xs" disabled={save.isPending || linksBusy} onClick={() => {
        if (exceptional) {
          setDraft(prev => ({ ...prev, supplierVendorId: trip.supplierVendorId, materialSourceVendorId: trip.materialSourceVendorId,
            equipmentId: trip.internalEquipmentId ?? evidence.data?.confirmation?.equipmentId ?? prev.equipmentId }));
          equipmentTouched.current = false;
        }
        setExceptional(prev => !prev);
      }}>{exceptional ? "Back to Edit" : "Authorised identity corrections"}</Button>}
    </DialogContent>
  </Dialog>;
}
