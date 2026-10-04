import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { summarizeReceived, unloadingLabel, type ReceivedEntry } from "@/lib/materialUnloadingSummary";
import { useDprMaterialReceipts } from "@/hooks/use-dpr-material-receipts";
import { managementNumber } from "@/lib/dprManagementPresentation";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type MaterialReceipt = ReceivedEntry & {
  id: number;
  time?: string | null;
  supplier?: string | null;
  vehicleNumber?: string | null;
  materialSourceSupplier?: string | null;
  receiptNumber?: string | null;
  yardLabel?: string | null;
  boqQuantity?: { quantity: number; uom: string } | null;
};

/** A display-only total: suppress it unless every entry in the native group has
 * an explicit finite BOQ quantity in the same BOQ unit. */
export function completeBoqTotal(entries: MaterialReceipt[], material: string, nativeUom: string):
  { quantity: number; uom: string } | null {
  const matching = entries.filter(entry =>
    entry.material === material && (entry.uom ?? "").trim().toUpperCase() === nativeUom,
  );
  if (!matching.length) return null;
  let uom: string | null = null;
  let quantity = 0;
  for (const entry of matching) {
    const boq = entry.boqQuantity;
    if (!boq || typeof boq.quantity !== "number" || !Number.isFinite(boq.quantity)
      || typeof boq.uom !== "string" || !boq.uom.trim()) return null;
    const unit = boq.uom.trim().toUpperCase();
    if (uom !== null && uom !== unit) return null;
    uom = unit;
    quantity += boq.quantity;
  }
  return Number.isFinite(quantity) && uom ? { quantity, uom } : null;
}

export function DprMaterialsReceived({ site, date, management = false, issues = [], purchases = [] }: {
  site: string; date: string; management?: boolean; issues?: any[]; purchases?: any[];
}) {
  if (management) return <ManagementMaterials site={site} date={date} issues={issues} purchases={purchases} />;
  return <AuditMaterialsReceived site={site} date={date} />;
}

function ManagementMaterials({ site, date, issues, purchases }: { site: string; date: string; issues: any[]; purchases: any[] }) {
  const { data: entries = [], isPending, isError, refetch } = useDprMaterialReceipts(site, date);
  const [tripsOpen, setTripsOpen] = useState(false);
  const groups = new Map<string, { material: string; unit: string; supplier: string; location: string; quantity: number; trips: number }>();
  for (const entry of entries) {
    const location = entry.unloadedAt === "stretch" ? "Stretch (used on site)" : entry.unloadedAt === "yard" ? "Yard (stock)" : "not recorded";
    const key = JSON.stringify([entry.material, entry.uom, entry.materialSourceSupplier || entry.supplier, location]);
    const group = groups.get(key) ?? { material: entry.material || "Material not recorded", unit: entry.uom || "",
      supplier: entry.materialSourceSupplier || entry.supplier || "", location, quantity: 0, trips: 0 };
    group.quantity += Number(entry.quantity) || 0;
    if (entry.source === "trip") group.trips++;
    groups.set(key, group);
  }
  const tripEntries = entries.filter(e => e.source === "trip");
  return <section data-testid="dpr-materials-received">
    <h2>Materials</h2>
    {isPending ? <div className="h-16 bg-muted/50 rounded" role="status" aria-label="Loading materials" />
      : isError ? <div role="alert">Materials unavailable. <Button variant="ghost" size="sm" onClick={() => refetch()}>Retry</Button></div>
      : !entries.length ? <p className="dpr-management-subtle">No materials received this day.</p>
      : <table className="dpr-management-table" aria-label="Materials received">
        <thead><tr>{["Material", "Received qty", "Unloaded at", "Trips"].map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{Array.from(groups.entries()).map(([key, g]) => <tr key={key}>
          <td data-label="Material">{g.material}{g.supplier && <div className="dpr-management-subtle">{g.supplier}</div>}</td>
          <td data-label="Received qty"><strong>{managementNumber(g.quantity)} {g.unit}</strong></td>
          <td data-label="Unloaded at">{g.location}</td>
          <td data-label="Trips"><strong>{g.trips || ""}</strong></td>
        </tr>)}</tbody>
      </table>}
    <div className="dpr-management-subtle mt-2">
      {!issues.length && !purchases.length && <span>No store issues or site purchases today.</span>}
      {issues.map((row, i) => <div key={`issue-${i}`} data-testid={`row-material-${i}`}>Issued · {row.material} · <strong>{managementNumber(row.quantity)} {row.uom}</strong>{row.location && ` · ${row.location}`}</div>)}
      {purchases.map((row, i) => <div key={`purchase-${i}`} data-testid={`row-site-purchase-${i}`}>Site purchase · {row.itemDescription}{row.vendor && ` · ${row.vendor}`}{row.quantity != null && ` · ${managementNumber(row.quantity)} ${row.uom || ""}`}{row.amount != null && ` · ₹${managementNumber(row.amount)}`}</div>)}
      {tripEntries.length > 0 && <Button className="ml-1 h-auto p-0 text-xs print:hidden" variant="ghost" onClick={() => setTripsOpen(true)} data-testid="button-trip-list">Trip list ▸</Button>}
    </div>
    <Dialog open={tripsOpen} onOpenChange={setTripsOpen}>
      <DialogContent className="dpr-management-dialog">
        <DialogTitle>Trip list</DialogTitle><DialogDescription>{site} · {date}</DialogDescription>
        {tripEntries.map((entry, i) => <div key={`${entry.id}-${i}`} className="border-b pb-3 text-sm">
          <strong>{entry.material} · {managementNumber(entry.quantity)} {entry.uom}</strong>
          <div>{[entry.time, entry.supplier, entry.vehicleNumber].filter(Boolean).join(" · ")}</div>
          <div>{entry.unloadedAt === "stretch" ? "Stretch (used on site)" : entry.unloadedAt === "yard" ? "Yard (stock)" : "not recorded"}{entry.yardLabel && ` · ${entry.yardLabel}`}</div>
          <div className="text-xs text-muted-foreground">{[entry.materialSourceSupplier, entry.receiptNumber].filter(Boolean).join(" · ")}</div>
        </div>)}
      </DialogContent>
    </Dialog>
  </section>;
}

function AuditMaterialsReceived({ site, date }: { site: string; date: string }) {
  const scopedSite = site?.trim();
  const scopedDate = date?.trim();
  const scoped = Boolean(scopedSite && scopedDate);
  const params = new URLSearchParams({
    site: scopedSite || "",
    dateFrom: scopedDate || "",
    dateTo: scopedDate || "",
  });
  const url = `/api/materials-received?${params.toString()}`;
  const { data, isPending, isError, error } = useQuery<MaterialReceipt[]>({
    queryKey: [url],
    enabled: scoped,
  });
  const entries = data ?? [];
  const byMaterial = useMemo(() => summarizeReceived(entries), [data]);

  return (
    <section className="space-y-4" data-testid="dpr-materials-received">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2"><Package className="w-5 h-5" />Materials Received</h2>
        <p className="text-sm text-muted-foreground">{scopedSite || "Site not set"} · {scopedDate || "Date not set"}</p>
      </div>
      {!scoped ? (
        <p className="text-sm text-muted-foreground">Site and date required to view materials received.</p>
      ) : isPending ? (
        <p role="status" className="text-sm text-muted-foreground">Loading materials received…</p>
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">Failed to load materials received: {error instanceof Error ? error.message : String(error)}</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No materials received this day.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {byMaterial.map(group => {
              const boq = completeBoqTotal(entries, group.material, group.uom);
              return (
                <Card key={JSON.stringify([group.material, group.uom])} data-testid={`card-material-${group.material}-${group.uom}`}>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold">{group.totalQty.toFixed(2)}</div>
                    <div className="text-sm text-muted-foreground">{group.uom || "Unit not set"}</div>
                    {boq && <div className="text-sm text-muted-foreground" data-testid={`boq-total-${group.material}-${group.uom}`}>≈ {boq.quantity.toFixed(3)} {boq.uom} (BOQ unit)</div>}
                    <div className="font-medium mt-1">{group.material}</div>
                    <div className="text-sm text-muted-foreground">{group.count} entr{group.count !== 1 ? "ies" : "y"}</div>
                    <div className="text-xs text-muted-foreground mt-2">
                      Trip unloading: Stretch {group.stretch.toFixed(2)} · Yard {group.yard.toFixed(2)} · Not recorded {group.unset.toFixed(2)}
                      {group.other !== 0 && <> · Other entries (DPR/equipment) {group.other.toFixed(2)}</>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-4">Material Entries ({entries.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm border-collapse">
                  <thead><tr className="bg-muted/50">
                    {["Time", "Transporter", "Material", "Qty/UOM", "Unloaded at", "Material Source", "Receipt No."].map(label =>
                      <th key={label} scope="col" className="text-left p-2 border">{label}</th>,
                    )}
                  </tr></thead>
                  <tbody>
                    {entries.map((entry, index) => (
                      <tr key={`${entry.source}-${entry.id}-${index}`} data-testid={`row-material-${entry.source}-${entry.id}`}>
                        <td className="p-2 border">{entry.time || "—"}</td>
                        <td className="p-2 border">
                          {entry.supplier && <div>{entry.supplier}</div>}
                          {entry.vehicleNumber && <div className="text-xs text-muted-foreground">{entry.vehicleNumber}</div>}
                          {!entry.supplier && !entry.vehicleNumber && "—"}
                        </td>
                        <td className="p-2 border font-medium">{entry.material || "—"}</td>
                        <td className="p-2 border">{entry.quantity == null ? "—" : String(entry.quantity)} {entry.uom || ""}</td>
                        <td className="p-2 border">
                          {unloadingLabel(entry)}{entry.source === "trip" && entry.unloadedAt === "yard" && entry.yardLabel ? ` · ${entry.yardLabel}` : ""}
                        </td>
                        <td className="p-2 border">{entry.materialSourceSupplier || "—"}</td>
                        <td className="p-2 border">{entry.receiptNumber || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}