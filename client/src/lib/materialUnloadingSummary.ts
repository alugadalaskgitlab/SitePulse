// Materials Received contains trip, DPR and equipment entries. Quantities are
// only additive within the same material AND native unit, never across units.
export type ReceivedEntry = {
  material?: string | null;
  quantity?: number | string | null;
  uom?: string | null;
  source?: string | null;
  unloadedAt?: string | null;
};

export type ReceivedSummary = {
  material: string;
  uom: string;
  count: number;
  totalQty: number;
  stretch: number;
  yard: number;
  unset: number;
  other: number;
};

export function unloadingLabel(entry: ReceivedEntry): string {
  if (entry.source !== "trip") return "Not applicable";
  if (entry.unloadedAt === "stretch") return "Stretch";
  if (entry.unloadedAt === "yard") return "Yard";
  return "Not recorded";
}

export function summarizeReceived(entries: ReceivedEntry[]): ReceivedSummary[] {
  const groups = new Map<string, ReceivedSummary>();
  for (const entry of entries) {
    if (!entry.material) continue;
    const uom = (entry.uom ?? "").trim().toUpperCase();
    const key = JSON.stringify([entry.material, uom]);
    let group = groups.get(key);
    if (!group) {
      group = { material: entry.material, uom, count: 0, totalQty: 0, stretch: 0, yard: 0, unset: 0, other: 0 };
      groups.set(key, group);
    }
    const qty = Number(entry.quantity) || 0;
    group.count++;
    group.totalQty += qty;
    switch (unloadingLabel(entry)) {
      case "Stretch": group.stretch += qty; break;
      case "Yard": group.yard += qty; break;
      case "Not recorded": group.unset += qty; break;
      default: group.other += qty;
    }
  }
  return [...groups.values()];
}