import { vendorBillAutoSourceIdentity } from "../client/src/lib/vendorBillRateSelection";

export function stripSourceSuffix(desc: string): string {
  return desc.replace(/\s*\(SITE-UNLINKED\)\s*/gi, " ").replace(/\s*\(SITE TRIP MATERIAL\)\s*/gi, " ").replace(/\s*\(SITE TRIP\)\s*/gi, " ").replace(/\s*\(SITE\)\s*/gi, " ").replace(/\s*\(PLANT\)\s*/gi, " ").trim();
}
export function canonicalizeMachineType(name: string): string {
  return name.replace(/\s+PLANT\s+INTERCARTING/gi, '').replace(/\s+INTERCARTING/gi, '').replace(/\s+PLANT$/i, '').replace(/-PLANT$/i, '').replace(/-SITE$/i, '').replace(/-\d+(\s+.*)?$/i, '').replace(/-[A-Z][A-Z\s]+$/i, '').trim();
}
export function canonicalMachineName(description: string): string {
  const rawName = description.split(/\s*-\s*/)[0]?.trim() || "EQUIPMENT";
  return canonicalizeMachineType(stripSourceSuffix(rawName)).toUpperCase().replace(/\s+/g, "_");
}
export function canonicalTransportName(description: string): string {
  const upper = stripSourceSuffix(description.trim().toUpperCase());
  const viaMatch = upper.match(/\bVIA\s+(.+)/);
  if (viaMatch) return canonicalizeMachineType(viaMatch[1].trim()).toUpperCase().replace(/\s+/g, "_");
  const mobilMatch = upper.match(/^MOBILIZATION:\s*(.+?)(?:\s*\(.*)?$/);
  if (mobilMatch) return canonicalizeMachineType(mobilMatch[1].trim()).toUpperCase().replace(/\s+/g, "_");
  const stripped = upper.replace(/\s*-\s*(HOURLY HIRE|DAILY HIRE|TRIP BASED|MONTHLY HIRE|TIME\/METER|MOBILIZATION|TRANSPORT).*$/i, "").trim();
  return canonicalizeMachineType(stripped).toUpperCase().replace(/\s+/g, "_");
}
export function canonicalMatName(description: string): string {
  return stripSourceSuffix(description.trim().toUpperCase()).replace(/\s+/g, "_");
}
export function deriveLabourLabel(description: string): string {
  return description.trim().toUpperCase().split(" - ")[0].trim();
}
export function deriveLabourKey(description: string): string {
  const head = deriveLabourLabel(description);
  const parts = head.split(/\s+/).filter(Boolean);
  if (parts[0] !== "LABOUR" || parts.length < 2) return head.replace(/\s+/g, "_");
  return parts[2] ? `LAB_${parts[1]}_${parts[2]}` : `LAB_${parts[1]}`;
}
export type CandidateGroupItem = { category: string; description: string; unit: string; equipmentId: number | null };
export type RateGroup<T extends CandidateGroupItem = CandidateGroupItem> = {
  key: string; equipmentId: number | null; groupName: string; entryType: string;
  category: string; unit: string; count: number; items: T[];
};
/** Shared unchanged grouping identity used by Pull / Set Rates / payables. */
export function groupRateItems<T extends CandidateGroupItem>(items: readonly T[]): RateGroup<T>[] {
  const groups = new Map<string, RateGroup<T>>();
  for (const item of items) {
    let key: string;
    let group: Omit<RateGroup<T>, "key" | "count" | "items">;
    if (item.category === "transport") {
      const canonical = canonicalTransportName(item.description);
      const unit = (item.unit || "TRIP").toUpperCase();
      key = `transport_${canonical}_${unit}`;
      group = { equipmentId: null, groupName: canonical.replace(/_/g, " "), entryType: unit, category: "transport", unit };
    } else if (item.equipmentId) {
      const machineName = canonicalMachineName(item.description);
      const entryTypeMatch = item.description.match(/(?:- )?(HOURLY HIRE|DAILY HIRE|TRIP BASED|MONTHLY HIRE|TIME\/METER|MOBILIZATION)/);
      const entryType = entryTypeMatch ? entryTypeMatch[1] : "OTHER";
      const unit = (item.unit || "HRS").toUpperCase();
      key = `eq_${machineName}_${unit}`;
      group = { equipmentId: item.equipmentId, groupName: machineName.replace(/_/g, " "), entryType, category: item.category, unit };
    } else if (item.category === "labour" && item.description.trim()) {
      const labourKey = deriveLabourKey(item.description);
      const unit = (item.unit || "HEAD-DAY").toUpperCase();
      key = `lab_${labourKey}_${unit}`;
      group = { equipmentId: null, groupName: deriveLabourLabel(item.description), entryType: item.unit || "HEAD-DAY", category: "labour", unit };
    } else if (item.description.trim()) {
      const cleanDescription = stripSourceSuffix(item.description.trim().toUpperCase());
      const unit = (item.unit || "NOS").toUpperCase();
      key = `desc_${item.category}_${cleanDescription.replace(/\s+/g, "_")}_${unit}`;
      group = { equipmentId: null, groupName: cleanDescription, entryType: item.unit || "", category: item.category, unit };
    } else continue;
    const existing = groups.get(key);
    if (existing) { existing.count++; existing.items.push(item); }
    else groups.set(key, { key, ...group, count: 1, items: [item] });
  }
  return Array.from(groups.values());
}
export function mapAutoBillItem(item: any) {
  const sourceType = item.sourceType ?? null;
  return {
    date: item.date || "", category: item.category || "other", description: item.description || "",
    qty: item.qty || 0, unit: item.unit || "HRS", rate: item.rate || 0,
    amount: (item.qty || 0) * (item.rate || 0),
    source: vendorBillAutoSourceIdentity(sourceType, item.sourceId, item.source),
    sourceType, sourceId: item.sourceId ?? null, equipmentId: item.equipmentId || null,
    leadDistance: item.leadDistance ?? null, siteName: item.siteName || null,
    suppliedTo: item.suppliedTo ?? null, transporter: item.transporter ?? null,
    vehicleNumber: item.vehicleNumber ?? null, receiptNumber: item.receiptNumber ?? null,
    vendorName: item.vendorName ?? null, physicalQuantity: Number(item.qty) || 0, physicalUnit: item.unit || "HRS",
  };
}
export function calcCandidateAmount<T extends { category: string; leadDistance?: number | null; qty: number; rate: number }>(item: T): number {
  if (item.category === "transport" && item.leadDistance && item.leadDistance > 0) return item.leadDistance * 2 * (item.rate || 0);
  return (item.qty || 0) * (item.rate || 0);
}