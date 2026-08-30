// 06T §5 — read-only view of the day's Site Material Trips inside the DPR
// Materials section. Bulk road materials (soil, GSB, aggregate…) delivered by
// truck are recorded as Site Material Trips; before this panel the DPR
// Materials view looked empty and engineers re-entered them by hand. This is
// DISPLAY COMPOSITION ONLY — no new ledger, no schema change, no mutation.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SiteMaterialTrip } from "@shared/schema";

export function DprDayTripsPanel({ siteName, date, testIdPrefix }: {
  siteName: string;
  date: string;
  testIdPrefix: string;
}) {
  const { data: dayTrips = [] } = useQuery<SiteMaterialTrip[]>({
    queryKey: ["/api/site-material-trips", siteName, date],
    queryFn: async () => {
      const res = await fetch(`/api/site-material-trips?site=${encodeURIComponent(siteName)}&dateFrom=${date}&dateTo=${date}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled: !!siteName && !!date,
  });
  const active = useMemo(
    () => dayTrips.filter((t) => !(t as any).isCancelled && !(t as any).isDeleted),
    [dayTrips],
  );
  // Keep the aggregate as a quick scan, but retain every already-fetched trip
  // below it so DPR reflects the day's actual logistics.
  const groups = useMemo(() => {
    const map = new Map<string, { material: string; uom: string; qty: number; trips: number; linked: number }>();
    for (const t of active) {
      const key = `${t.material}|${t.uom ?? ""}`;
      const g = map.get(key) ?? { material: t.material, uom: t.uom ?? "", qty: 0, trips: 0, linked: 0 };
      g.qty += Number(t.quantity) || 0;
      g.trips += 1;
      if (t.boqItemId != null || t.earthworkArrangementId != null) g.linked += 1;
      map.set(key, g);
    }
    return Array.from(map.values());
  }, [active]);

  if (active.length === 0) return null;
  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-1.5" data-testid={`${testIdPrefix}-day-trips-panel`}>
      <p className="text-sm font-medium flex items-center gap-2">
        <Truck className="w-4 h-4 text-muted-foreground" />
        Bulk deliveries already recorded today (Site Material Trips)
      </p>
      <p className="text-xs text-muted-foreground">
        These trucks are already in the system — don't re-enter them below. Link them to an activity from the activity's Material receipt strip.
      </p>
      {groups.map((g) => (
        <div key={`${g.material}|${g.uom}`} className="flex items-center gap-2 text-xs" data-testid={`${testIdPrefix}-day-trips-${g.material.replace(/\W+/g, "-").toLowerCase()}`}>
          <span className="font-medium">{g.material}</span>
          <span>{Number(g.qty.toFixed(2))} {g.uom} · {g.trips} trip{g.trips === 1 ? "" : "s"}</span>
          {g.linked < g.trips ? (
            <Badge variant="outline" className="text-[10px]">{g.trips - g.linked} not linked to an activity yet</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">all linked</Badge>
          )}
        </div>
      ))}
      <div className="pt-1 space-y-1.5 border-t mt-2">
        {active.map((trip) => {
          const transportLabel = trip.transportType === "in_house"
            ? "In-house"
            : trip.transportType === "agency_vendor"
              ? "Agency / Vendor"
              : "Not specified";
          const destination = trip.yardLabel || trip.location || "Location not recorded";
          return (
            <div
              key={trip.id}
              className="rounded border bg-background/60 px-2 py-1.5 text-xs grid gap-x-3 gap-y-1 sm:grid-cols-3"
              data-testid={`${testIdPrefix}-day-trip-${trip.id}`}
            >
              <span className="font-medium">{trip.material} · {Number(trip.quantity || 0)} {trip.uom}</span>
              <span>{destination}</span>
              <span>Vehicle: {trip.vehicleNumber || "Not recorded"}</span>
              <span>Transport: {transportLabel}</span>
              <span>Supplier: {trip.supplier || "Not recorded"}</span>
              <span>Receipt: {trip.receiptNumber || "Not recorded"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
