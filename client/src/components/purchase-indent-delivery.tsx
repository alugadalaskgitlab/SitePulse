import { useState } from "react";
import type { DeliveryEvidence } from "@shared/purchaseIndentDelivery";
import { Button } from "@/components/ui/button";

export function deliveryProgress(item: { qty: number; qtyPurchased?: number | null; totalPurchasedQty?: number | null; orderedQty?: number | null; approvedQty?: number | null; deliveredQty?: number | null; uom: string; requiredBy?: string | null }, requiredBy?: string | null, today = new Date()) {
  const orderedQty = [item.qtyPurchased, item.totalPurchasedQty, item.orderedQty].find(q => Number(q) > 0);
  const target = Number(orderedQty ?? item.approvedQty ?? item.qty);
  const delivered = Number(item.deliveredQty ?? 0);
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
        <option value="">Select receiving site</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>}
  </div>;
}

export function PurchaseIndentDeliveryPanel({ item, requiredBy, sites, canEdit, onSave, indentId, indentNo }: {
  item: any; requiredBy?: string | null; sites: { id: number; name: string }[];
  indentId?: number; indentNo?: string;
  canEdit: boolean; onSave: (itemId: number, location: string, siteId: number | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [location, setLocation] = useState(item.receivingLocation || "");
  const [siteId, setSiteId] = useState(String(item.receivingSiteId || ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const evidence: DeliveryEvidence[] | undefined = item.deliveryEvidence;
  const ordered = ["ordered", "partial", "purchased", "pending_plant_receipt"].includes((item.purchaseStatus || "").toLowerCase()) || Number(item.qtyPurchased) > 0 || Number(item.totalPurchasedQty) > 0;
  const destination = item.receivingLocation === "site" ? `Site — ${sites.find(s => s.id === item.receivingSiteId)?.name || item.receivingSiteId}` : ({ hmp_plant: "HMP Plant", rmc_plant: "RMC Plant" } as Record<string, string>)[item.receivingLocation];
  return <section className="rounded-lg border p-3 space-y-2" data-testid={`delivery-panel-${item.id}`}>
    <h3 className="font-semibold">{item.description}</h3>
    <p className="text-sm font-medium" data-testid={`delivery-progress-${item.id}`}>{deliveryProgress(item, requiredBy)}</p>
    <p className="text-sm">Destination: {destination || "Not confirmed — confirm before recording delivery"}</p>
    {ordered && destination && indentId && canEdit && <a className="inline-block text-sm underline text-teal-700" data-testid={`delivery-path-${item.id}`}
      href={item.receivingLocation === "site"
        ? `/site/material-trips?piIndentId=${indentId}&piItemId=${item.id}&material=${encodeURIComponent(item.description)}&uom=${encodeURIComponent(item.uom)}&site=${encodeURIComponent(sites.find(s => s.id === item.receivingSiteId)?.name || "")}`
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
      {evidence.map(e => <tr key={`${e.kind}-${e.id}`} className="border-t"><td className="py-2">{e.kind === "receipt" ? "Plant receipt" : "Site trip"} #{e.id}{e.reference ? ` · ${e.reference}` : ""}</td><td>{e.date?.slice(0, 10) || "—"}</td><td>{e.quantity} {e.uom}</td><td>{e.countedQty ?? "Excluded"}</td><td>{e.status}</td></tr>)}
    </tbody></table></div>}
    {(item.deliveryWarnings || []).map((w: string) => <p key={w} role="alert" className="text-sm text-amber-700">{w}</p>)}
  </section>;
}