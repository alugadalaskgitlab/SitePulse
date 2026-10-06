import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { UNCONFIRMED_TRIP_WARNING, type TripCandidateSafety } from "./tripCandidateSafety";

type UnconfirmedOffer = TripCandidateSafety & {
  sourceId?: string | number | null;
  date: string;
  description: string;
  vehicleNumber?: string | null;
  receiptNumber?: string | null;
};

export function UnconfirmedTripOffers({ items, refreshing, onRefresh }: {
  items: readonly UnconfirmedOffer[];
  refreshing: boolean;
  onRefresh: () => void;
}) {
  if (!items.length) return null;
  return <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200" data-testid="unconfirmed-trip-offers">
    {items.map((item, index) => <div key={`${item.sourceId ?? item.tripId ?? index}`} className="flex items-start gap-2" data-testid={`unconfirmed-trip-${item.tripId ?? item.sourceId ?? index}`}>
      <input type="checkbox" checked={false} disabled aria-label={`Trip ${item.tripId ?? item.sourceId ?? ""}: roles not confirmed; cannot add to bill`} title="Confirm roles on the trip and refresh records before adding to a bill." className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{item.roleWarning || UNCONFIRMED_TRIP_WARNING}</p>
        <p>{item.date} · {item.description}{item.tripId != null ? ` · Trip ${item.tripId}` : ""}</p>
        {(item.vehicleNumber || item.receiptNumber) && <p>{item.vehicleNumber ? `Vehicle: ${item.vehicleNumber}` : ""}{item.vehicleNumber && item.receiptNumber ? " · " : ""}{item.receiptNumber ? `Receipt: ${item.receiptNumber}` : ""}</p>}
        <p>Cannot add to this bill. Confirm <Link href="/site/material-trips" className="font-semibold underline underline-offset-2">Who brought it?</Link> on the trip, then refresh records. No material or transport role has been assumed.</p>
      </div>
    </div>)}
    <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={refreshing} data-testid="button-refresh-trip-roles">
      {refreshing ? "REFRESHING RECORDS" : "REFRESH RECORDS"}
    </Button>
  </div>;
}

export function TransportPricingNote({ note }: { note?: string | null }) {
  if (!note) return null;
  return <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400" data-testid="transport-pricing-note">{note}</p>;
}
