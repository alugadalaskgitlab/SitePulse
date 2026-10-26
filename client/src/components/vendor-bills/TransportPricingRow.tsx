import type { TransportPricing } from "@shared/vendorBillTransport";
import { arrangementWorking, type ArrangementPricing } from "@shared/vendorBillArrangement";

export type TransportPricingDisplayItem = {
  category?: string | null;
  description?: string | null;
  rate?: number | null;
  leadDistance?: number | null;
  transportPricing?: TransportPricing | null;
  arrangementPricing?: ArrangementPricing | null;
};

function transportMaterialName(item: TransportPricingDisplayItem) {
  return (item.description || "")
    .replace(/\s*-\s*TRANSPORT(?:\s.*)?$/i, "")
    .replace(/\s*\(SITE TRIP\).*$/i, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function transportPricingGroups(items: readonly TransportPricingDisplayItem[]) {
  const groups = new Map<string, { firstIndex: number; items: TransportPricingDisplayItem[] }>();
  items.forEach((item, index) => {
    if (item.category !== "transport" || !item.transportPricing) return;
    const name = transportMaterialName(item);
    if (!name) return;
    const group = groups.get(name) || { firstIndex: index, items: [] };
    group.items.push(item);
    groups.set(name, group);
  });
  return new Map(Array.from(groups.values(), group => [group.firstIndex, group.items]));
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function transportTerms(item: TransportPricingDisplayItem) {
  const pricing = item.transportPricing!;
  const leadKm = Number(item.leadDistance ?? pricing.cardLeadDistanceKm) || 0;
  const ratePerKm = Number(item.rate) || 0;
  const payloadMt = Number(pricing.payloadMt) || 0;
  const perTrip = ratePerKm * leadKm * 2;
  const perMt = payloadMt > 0 ? perTrip / payloadMt : null;
  return [
    `₹${formatNumber(ratePerKm)}/km`,
    `lead ${formatNumber(leadKm)} km (${formatNumber(leadKm * 2)} km two-way)`,
    payloadMt > 0 ? `payload ${formatNumber(payloadMt)} MT` : "payload not set",
    perMt != null ? `₹${formatNumber(perMt)}/MT` : null,
    `₹${formatNumber(perTrip)}/trip`,
  ].filter(Boolean).join(" · ");
}

export function TransportPricingRow({ item, groupItems }: {
  item: TransportPricingDisplayItem;
  groupItems?: readonly TransportPricingDisplayItem[];
}) {
  const p = item.transportPricing;
  if (item.arrangementPricing) return <p className="mt-1 text-xs" data-testid="arrangement-working">{arrangementWorking(item.arrangementPricing)}</p>;
  if (!p) return null;
  const material = transportMaterialName(item);
  const terms = Array.from(new Set((groupItems || [item]).map(transportTerms)));
  return <p className="mt-1 text-[11px] leading-snug text-muted-foreground" data-testid="transport-pricing-row">
    <span className="font-medium text-foreground">{material} transport</span> · {terms.join(" ; ")}
  </p>;
}
