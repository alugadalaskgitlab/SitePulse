import { transportWorking, type TransportPricing } from "@shared/vendorBillTransport";

export function TransportPricingRow({ item, onBasisChange }: {
  item: { rate?: number | null; leadDistance?: number | null; transportPricing?: TransportPricing | null };
  onBasisChange?: (basis: "trip" | "mt") => void;
}) {
  const p = item.transportPricing;
  if (!p) return null;
  return <div className="mt-1 space-y-1 text-xs" data-testid="transport-pricing-row">
    <p>{transportWorking(item)}</p>
    {item.leadDistance !== p.cardLeadDistanceKm && <p className="font-medium text-amber-700 dark:text-amber-400">
      lead {item.leadDistance ?? 0} km (card {p.cardLeadDistanceKm} km)
    </p>}
    {onBasisChange ? <div className="flex gap-1" role="group" aria-label="Transport pricing basis">
      {(["trip", "mt"] as const).map(basis => <button type="button" key={basis}
        aria-pressed={p.basis === basis} disabled={basis === "mt" && p.actualMt == null}
        onClick={() => onBasisChange(basis)}
        className={`rounded border px-2 py-1 disabled:opacity-40 ${p.basis === basis ? "bg-primary text-primary-foreground" : "bg-background"}`}>
        {basis === "trip" ? "Per trip" : "Per MT"}
      </button>)}
      <span className="self-center text-muted-foreground">This row only · rate field is ₹/km</span>
    </div> : <p>Billed per {p.basis === "trip" ? "trip" : "MT"} · rate shown in ₹/km</p>}
  </div>;
}
