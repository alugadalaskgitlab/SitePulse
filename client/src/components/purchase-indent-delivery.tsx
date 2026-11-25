import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { DeliveryEvidence } from "@shared/purchaseIndentDelivery";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";

type DeliveryQuantityItem = { qty: number; qtyPurchased?: number | null; totalPurchasedQty?: number | null; orderedQty?: number | null; approvedQty?: number | null; deliveredQty?: number | null };

export function deliveryQuantities(item: DeliveryQuantityItem) {
  const orderedQty = [item.qtyPurchased, item.totalPurchasedQty, item.orderedQty].find(q => Number(q) > 0);
  const target = Number(orderedQty ?? item.approvedQty ?? item.qty);
  const delivered = Number(item.deliveredQty ?? 0);
  return { target, delivered, remainingQty: Math.max(0, target - delivered) };
}

export function deliveryProgress(item: DeliveryQuantityItem & { uom: string; requiredBy?: string | null }, requiredBy?: string | null, today = new Date()) {
  const { target, delivered } = deliveryQuantities(item);
  const counts = `${delivered.toLocaleString("en-IN", { maximumFractionDigits: 3 })} of ${target.toLocaleString("en-IN", { maximumFractionDigits: 3 })} ${item.uom} delivered`;
  if (target <= 0) return "Not required";
  if (delivered >= target) return `Delivered — ${counts}`;
  const due = item.requiredBy || requiredBy;
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = due ? Math.round((new Date(`${due.slice(0, 10)}T00:00:00`).getTime() - localToday.getTime()) / 86400000) : null;
  if (delivered > 0) return `${counts}${days !== null && days < 0 ? " — partially delivered · past required date" : ""}`;
  if (days !== null && days < 0) return `Overdue — ${counts}`;
  if (days !== null && days <= 3) return `Due ${days === 0 ? "today" : "soon"} — ${counts}`;
  return `Pending — ${counts}`;
}

function deliveryWarning(message: string) {
  const suffix = " in Material master";
  const index = message.lastIndexOf(suffix);
  return index < 0
    ? message
    : <>
        {message.slice(0, index)}
        {" "}
        <a className="underline" href="/plant/dashboard#material-master">Material master</a>
      </>;
}

export function DestinationFields({ value, siteId, sites, onChange, id }: {
  value: string; siteId: string; sites: { id: number; name: string }[];
  onChange: (location: string, siteId: string) => void; id: string;
}) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
    <label className="text-sm font-medium">Delivery destination *
      <select aria-label="Delivery destination" data-testid={`destination-${id}`} className="mt-1 block w-full border rounded-md bg-background p-2" value={value} onChange={e => onChange(e.target.value, e.target.value === "site" ? siteId : "")}>
        <option value="">Select Plant or Site</option><option value="hmp_plant">HMP Plant</option><option value="rmc_plant">RMC Plant</option><option value="site">Site</option>
      </select>
    </label>
    {value === "site" && <label className="text-sm font-medium">Receiving site *
      <select aria-label="Receiving site" data-testid={`destination-site-${id}`} className="mt-1 block w-full border rounded-md bg-background p-2" value={siteId} onChange={e => onChange(value, e.target.value)}>
        <option value="">Select receiving site</option>{sites.map(s => <option key={s.id} value={s.id} className="entity-name">{s.name}</option>)}
      </select>
    </label>}
  </div>;
}

export function PurchaseIndentDeliveryPanel({ item, requiredBy, sites, canEdit, canLinkTrips = false, onSave, indentId, indentNo, piDate, closedBalance }: {
  item: any; requiredBy?: string | null; sites: { id: number; name: string }[];
  indentId?: number; indentNo?: string;
  piDate?: string | null;
  closedBalance?: { orderedQty: number; deliveredQty: number; balanceQty: number; uom: string } | null;
  canLinkTrips?: boolean;
  canEdit: boolean; onSave: (itemId: number, location: string, siteId: number | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [location, setLocation] = useState(item.receivingLocation || "");
  const [siteId, setSiteId] = useState(String(item.receivingSiteId || ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [fromDate, setFromDate] = useState((piDate ?? "").slice(0, 10));
  const [selectedTripIds, setSelectedTripIds] = useState<number[]>([]);
  const evidence: DeliveryEvidence[] | undefined = item.deliveryEvidence;
  const progressItem = {
    ...item,
    qtyPurchased: null,
    totalPurchasedQty: null,
    orderedQty: item.orderedQty ?? item.approvedQty ?? item.qty,
  };
  const { remainingQty } = deliveryQuantities(progressItem);
  const ordered = ["ordered", "partial", "purchased", "pending_plant_receipt"].includes((item.purchaseStatus || "").toLowerCase()) || Number(item.qtyPurchased) > 0 || Number(item.totalPurchasedQty) > 0;
  const destination = item.receivingLocation === "site" ? `Site — ${sites.find(s => s.id === item.receivingSiteId)?.name || item.receivingSiteId}` : ({ hmp_plant: "HMP Plant", rmc_plant: "RMC Plant" } as Record<string, string>)[item.receivingLocation];
  const tripsUrl = indentId && `/api/purchase-indents/${indentId}/items/${item.id}/site-trips?fromDate=${encodeURIComponent(fromDate)}`;
  const tripsQuery = useQuery({
    queryKey: [tripsUrl],
    enabled: linkOpen && Boolean(tripsUrl),
    queryFn: async () => {
      const response = await fetch(tripsUrl!, { credentials: "include" });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || "Could not load site trips");
      return response.json();
    },
  });
  const linkTripsMutation = useMutation({
    mutationFn: async () => {
      if (!indentId) throw new Error("Purchase indent is missing");
      const response = await apiRequest("POST", `/api/purchase-indents/${indentId}/items/${item.id}/site-trips/link`, { tripIds: selectedTripIds });
      return response.json();
    },
    onSuccess: async () => {
      setSelectedTripIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] }),
        queryClient.invalidateQueries({ queryKey: [tripsUrl] }),
      ]);
    },
  });
  const unlinkTripMutation = useMutation({
    mutationFn: async (tripId: number) => {
      if (!indentId) throw new Error("Purchase indent is missing");
      return apiRequest("POST", `/api/purchase-indents/${indentId}/items/${item.id}/site-trips/${tripId}/unlink`, {});
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] }),
        queryClient.invalidateQueries({ queryKey: [tripsUrl] }),
      ]);
    },
  });
  const piTripData = tripsQuery.data;
  const canMutateLinks = canLinkTrips && piTripData?.canLink === true;
  return <section className="rounded-lg border p-3 space-y-2" data-testid={`delivery-panel-${item.id}`}>
    <h3 className="font-semibold">{item.description}</h3>
    <p className="text-sm font-medium" data-testid={`delivery-progress-${item.id}`}>
      {closedBalance
        ? `Closed with balance — ${Number(closedBalance.deliveredQty).toLocaleString("en-IN", { maximumFractionDigits: 3 })} of ${Number(closedBalance.orderedQty).toLocaleString("en-IN", { maximumFractionDigits: 3 })} ${closedBalance.uom} delivered`
        : deliveryProgress(progressItem, requiredBy)}
    </p>
    <p className="text-sm">Destination: {destination || "Not confirmed — confirm before recording delivery"}</p>
    {ordered && destination && indentId && canEdit && <a className="inline-block text-sm underline text-teal-700" data-testid={`delivery-path-${item.id}`}
      href={item.receivingLocation === "site"
        ? `/site/material-trips?piIndentId=${indentId}&piItemId=${item.id}&material=${encodeURIComponent(item.description)}&uom=${encodeURIComponent(item.uom)}&site=${encodeURIComponent(sites.find(s => s.id === item.receivingSiteId)?.name || "")}&qty=${encodeURIComponent(String(remainingQty))}`
        : `/plant/material-receipts?autoOpen=1&piRef=${encodeURIComponent(indentNo || "")}&piItemId=${item.id}${item.materialId ? `&materialId=${item.materialId}` : ""}`}>
      {item.receivingLocation === "site" ? "Log Site Delivery →" : "Record Plant Receipt →"}
    </a>}
    {canEdit && ordered && !editing && <Button size="sm" variant="outline" onClick={() => { setLocation(item.receivingLocation || ""); setSiteId(String(item.receivingSiteId || "")); setEditing(true); }}>{destination ? "Correct destination" : "Confirm destination"}</Button>}
    {editing && <div className="space-y-2">
      <DestinationFields value={location} siteId={siteId} sites={sites} id={`correct-${item.id}`} onChange={(l, s) => { setLocation(l); setSiteId(s); }} />
      <p className="text-xs text-muted-foreground">Existing receipts and trips remain linked when the destination changes.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <Button size="sm" disabled={saving || !location || (location === "site" && !siteId)} onClick={async () => {
        setSaving(true); setError("");
        try { await onSave(item.id, location, location === "site" ? Number(siteId) : null); setEditing(false); }
        catch (e) { setError(e instanceof Error ? e.message : "Destination update failed"); }
        finally { setSaving(false); }
      }}>{saving ? "Saving…" : "Save destination"}</Button>
      <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button>
    </div>}
    <h4 className="text-sm font-semibold">Linked plant receipts & site trips</h4>
    {!evidence ? <p className="text-sm text-muted-foreground">Delivery records unavailable. Reload the indent to retry.</p> : evidence.length === 0 ? <p className="text-sm text-muted-foreground">No linked receipts or trips yet.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th>Path / reference</th><th>Date</th><th>Recorded quantity</th><th>Counted ({item.uom})</th><th>Status</th></tr></thead><tbody>
       {evidence.map(e => <tr key={`${e.kind}-${e.id}`} className="border-t"><td className="py-2">{e.kind === "receipt" ? "Plant receipt" : "Site trip"} #{e.id}{e.reference ? ` · ${e.reference}` : ""}</td><td>{e.date?.slice(0, 10) || "—"}</td><td>{e.quantity} {e.uom}</td><td>{e.countedQty ?? (e.countedWarning ? deliveryWarning(e.countedWarning) : "Excluded")}</td><td>{e.status}</td></tr>)}
    </tbody></table></div>}
    {(item.deliveryWarnings || []).map((w: string) => <p key={w} role="alert" className="text-sm text-amber-700">{deliveryWarning(w)}</p>)}
    {item.receivingLocation === "site" && indentId && ordered && (
      <div className="space-y-2 border-t pt-2" data-testid={`site-trip-linker-${item.id}`}>
        <Button size="sm" variant="outline" type="button" onClick={() => {
          setFromDate((current) => current || (piDate ?? "").slice(0, 10));
          setLinkOpen(value => !value);
        }}>
          {linkOpen ? "Hide site trips" : canLinkTrips ? "Link existing site trips" : "View site trips"}
        </Button>
        {linkOpen && <div className="space-y-2 rounded-md bg-muted/30 p-2">
          <label className="block text-sm font-medium">From date
            <input type="date" aria-label="From date" className="mt-1 block w-full rounded border bg-background p-2" value={fromDate} onChange={event => {
              setFromDate(event.target.value);
              setSelectedTripIds([]);
            }} />
          </label>
          {tripsQuery.isLoading ? <p className="text-sm">Loading site trips…</p>
            : tripsQuery.isError ? <p className="text-sm text-red-700" role="alert">{(tripsQuery.error as Error).message}</p>
            : <>
              {(piTripData?.linked?.length ?? 0) > 0 && <div className="space-y-1">
                <p className="text-sm font-semibold">Linked trips</p>
                {piTripData.linked.map((trip: any) => <div key={trip.id} className="flex items-start justify-between gap-2 border rounded p-2 text-sm">
                  <span className="min-w-0">{trip.date} · {trip.receiptNumber || `Trip #${trip.id}`} · {trip.vehicleNumber || "Vehicle not recorded"} · {trip.supplier || "Transporter not recorded"} · {trip.quantity} {trip.uom}
                    {trip.countedQty == null ? <span className="block text-amber-700">{deliveryWarning(trip.countedWarning)}</span> : <span className="block text-muted-foreground">Counted: {Number(trip.countedQty).toLocaleString("en-IN", { maximumFractionDigits: 3 })} {item.uom}</span>}
                  </span>
                  {canMutateLinks && <Button size="sm" variant="ghost" type="button" disabled={unlinkTripMutation.isPending} onClick={() => unlinkTripMutation.mutate(trip.id)}>Unlink</Button>}
                </div>)}
              </div>}
              <p className="text-sm font-semibold">Unlinked trips for {piTripData?.materialName ?? item.description} at {piTripData?.siteName ?? destination}</p>
              {(piTripData?.candidates?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No matching trips from this date.</p>
                : <div className="max-h-64 overflow-auto rounded border">
                  {piTripData.candidates.map((trip: any) => <label key={trip.id} className="flex items-start gap-2 border-b p-2 text-sm last:border-b-0">
                    {canMutateLinks && <input type="checkbox" aria-label={`Select trip ${trip.id}`} checked={selectedTripIds.includes(trip.id)} onChange={event => setSelectedTripIds(current => event.target.checked ? [...current, trip.id] : current.filter(id => id !== trip.id))} className="mt-1" />}
                    <span className="min-w-0 flex-1">{trip.receiptNumber || `Trip #${trip.id}`} · {trip.date} · {trip.vehicleNumber || "Vehicle not recorded"} · {trip.supplier || "Transporter not recorded"} · {trip.quantity} {trip.uom}
                      {trip.countedQty == null ? <span className="block text-amber-700">{deliveryWarning(trip.countedWarning)}</span> : <span className="block text-muted-foreground">Counted: {Number(trip.countedQty).toLocaleString("en-IN", { maximumFractionDigits: 3 })} {item.uom}</span>}
                    </span>
                  </label>)}
                </div>}
              {canMutateLinks && <Button size="sm" type="button" disabled={selectedTripIds.length === 0 || linkTripsMutation.isPending} onClick={() => linkTripsMutation.mutate()}>
                {linkTripsMutation.isPending ? "Linking…" : `Link selected (${selectedTripIds.length})`}
              </Button>}
              {!canMutateLinks && <p className="text-xs text-muted-foreground">Read-only — this account cannot change PI delivery links.</p>}
              {(linkTripsMutation.isError || unlinkTripMutation.isError) && <p role="alert" className="text-sm text-red-700">{((linkTripsMutation.error || unlinkTripMutation.error) as Error).message}</p>}
              {piTripData?.deliveryWarnings?.map?.((warning: string) => <p key={warning} role="alert" className="text-sm text-amber-700">{deliveryWarning(warning)}</p>)}
            </>}
        </div>}
      </div>
    )}
  </section>;
}