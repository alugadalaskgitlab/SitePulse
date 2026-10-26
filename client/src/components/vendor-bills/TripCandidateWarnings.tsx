import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Link } from "wouter";
import { UNCONFIRMED_TRIP_WARNING, type TripCandidateSafety } from "./tripCandidateSafety";

type UnconfirmedOffer = TripCandidateSafety & {
  sourceId?: string | number | null;
  date: string;
  description: string;
  siteName?: string | null;
  vehicleNumber?: string | null;
  receiptNumber?: string | null;
};

export function buildTripRoleConfirmationHref(
  items: readonly Pick<UnconfirmedOffer, "date">[],
  vendorName: string,
  returnTo?: string,
) {
  const params = new URLSearchParams();
  const dates = items.map(item => item.date).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
  if (dates.length) {
    params.set("dateFrom", dates[0]);
    params.set("dateTo", dates[dates.length - 1]);
  }
  if (vendorName.trim()) params.set("hireSupplier", vendorName.trim());
  params.set("hireRole", "unresolved");
  if (returnTo) params.set("returnTo", encodeURIComponent(returnTo));
  return `/site/material-trips?${params.toString()}`;
}

function tripDateSummary(items: readonly UnconfirmedOffer[]) {
  const dates = items.map(item => item.date).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
  if (!dates.length) return "";
  const first = parseISO(dates[0]);
  const last = parseISO(dates[dates.length - 1]);
  if (dates[0] === dates[dates.length - 1]) return format(first, "d MMM");
  if (first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth()) {
    return `${format(first, "d")}–${format(last, "d MMM")}`;
  }
  return `${format(first, "d MMM")}–${format(last, "d MMM")}`;
}

function tripMaterials(items: readonly UnconfirmedOffer[]) {
  return Array.from(new Set(items.map(item => item.description
    .replace(/\s*\(SITE TRIP\)\s*$/i, "")
    .trim()
    .toUpperCase())
    .filter(Boolean))).sort();
}

export function UnconfirmedTripOffers({ items, vendorName, returnTo }: {
  items: readonly UnconfirmedOffer[];
  vendorName: string;
  returnTo?: string;
}) {
  const [showTrips, setShowTrips] = useState(false);
  const href = useMemo(() => buildTripRoleConfirmationHref(items, vendorName, returnTo), [items, vendorName, returnTo]);
  if (!items.length) return null;
  const materials = tripMaterials(items);
  const dateRange = tripDateSummary(items);
  return <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200" data-testid="unconfirmed-trip-offers">
    <p className="font-semibold" data-testid="text-unconfirmed-trip-summary">
      {items.length} trips need “Who brought it?” confirmed{dateRange ? ` (${dateRange}${materials.length ? ` · ${materials.join(", ")}` : ""})` : ""}
    </p>
    <div className="flex flex-wrap items-center gap-2">
      <Link href={href} className="inline-flex min-h-9 items-center justify-center rounded-md border border-amber-700 bg-background px-3 py-2 font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40" data-testid="link-confirm-trip-roles">
        Confirm on Material Trips
      </Link>
      <button type="button" className="min-h-9 px-2 font-medium underline underline-offset-2" aria-expanded={showTrips}
        onClick={() => setShowTrips(value => !value)} data-testid="button-toggle-unconfirmed-trips">
        {showTrips ? "Hide trips" : "Show trips"}
      </button>
    </div>
    {showTrips && <ul className="max-h-48 space-y-1 overflow-auto border-t border-amber-300 pt-2 dark:border-amber-700" data-testid="list-unconfirmed-trips">
      {items.map((item, index) => <li key={`${item.sourceId ?? item.tripId ?? index}`} data-testid={`unconfirmed-trip-${item.tripId ?? item.sourceId ?? index}`}>
        <span>{item.date} · {item.description}{item.tripId != null ? ` · Trip ${item.tripId}` : ""}</span>
        {(item.vehicleNumber || item.receiptNumber) && <span> · {item.vehicleNumber ? `Vehicle: ${item.vehicleNumber}` : ""}{item.vehicleNumber && item.receiptNumber ? " · " : ""}{item.receiptNumber ? `Receipt: ${item.receiptNumber}` : ""}</span>}
      </li>)}
    </ul>}
    <p className="text-[11px]">{UNCONFIRMED_TRIP_WARNING}. No material or transport role is assumed.</p>
  </div>;
}

export function TransportPricingNote({ note, vendorName }: { note?: string | null; vendorName?: string | null }) {
  if (!note) return null;
  const rateCardsHref = `/plant/rate-cards?vendorName=${encodeURIComponent(vendorName?.trim() || "")}`;
  const action = note.startsWith("No transport rate card")
    ? "Add one in Rate Cards"
    : note.startsWith("Two transport cards")
      ? "Review Rate Cards"
      : note.startsWith("Transport rate card")
        ? "Complete setup in Rate Cards"
        : "Open Rate Cards";
  return <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400" data-testid="transport-pricing-note">
    {note} {vendorName?.trim() && <Link href={rateCardsHref} className="font-semibold underline underline-offset-2">{action}</Link>}
  </p>;
}
