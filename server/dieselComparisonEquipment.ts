export interface ComparisonInput {
  requirements: Array<{ id: number; date: string; totalPlanned: number; qtyPurchased: number | null }>;
  items: Array<{ requirementId: number; equipmentId: number | null; equipmentName: string; plannedQty: number }>;
  masters: Array<{ id: number; name: string; registrationNumber: string | null }>;
  usage: Array<{ date: string; equipmentId: number; dieselIssued: number | null }>;
  logs: Array<{ date: string; equipmentId: number | null; machine: string; diesel: number | null }>;
  dateWise: Array<{ date: string; planned: number; purchased: number | null; actual: number | null }>;
}

export interface EquipmentComparisonRow {
  equipmentId: number | null;
  equipmentName: string;
  attribution: string;
  planned: number;
  purchased: number;
  actual: number;
  gapFlag: boolean;
}

// Header purchase quantities have no per-item allocations. Never distribute a
// multi-machine requirement's purchase based on planned quantities.
function equipmentIdentity(masters: ComparisonInput["masters"]) {
  const idsByName = new Map<string, Set<number>>();
  const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  for (const m of masters) for (const label of [m.name, m.registrationNumber]) {
    if (!label?.trim()) continue;
    const key = normalize(label);
    if (!idsByName.has(key)) idsByName.set(key, new Set());
    idsByName.get(key)!.add(m.id);
  }
  return (id: number | null | undefined, label?: string | null): number | null => {
    if (id != null) return id;
    const candidates = idsByName.get(normalize(label || ""));
    return candidates?.size === 1 ? Array.from(candidates)[0] : null;
  };
}

export function buildEquipmentComparison(input: ComparisonInput, from: string, to: string): EquipmentComparisonRow[] {
  const masterById = new Map(input.masters.map(m => [m.id, m]));
  const identify = equipmentIdentity(input.masters);
  const buckets = new Map<number | null, EquipmentComparisonRow>();
  const bucket = (id: number | null) => {
    if (!buckets.has(id)) {
      const master = id == null ? null : masterById.get(id);
      buckets.set(id, {
        equipmentId: id,
        equipmentName: id == null ? "Unattributed / unassigned" : master ? `${master.name}${master.registrationNumber ? ` (${master.registrationNumber})` : ""} [#${id}]` : `Equipment #${id}`,
        attribution: id == null ? "Multi-machine purchase / unidentified machine / header adjustment" : "ID or unique master name",
        planned: 0, purchased: 0, actual: 0, gapFlag: false,
      });
    }
    return buckets.get(id)!;
  };
  const within = (d: string) => d >= from && d <= to;
  const byReq = new Map<number, ComparisonInput["items"]>();
  for (const item of input.items) byReq.set(item.requirementId, [...(byReq.get(item.requirementId) || []), item]);
  for (const req of input.requirements.filter(r => within(r.date))) {
    const items = byReq.get(req.id) || [];
    const ids = new Set<number | null>();
    let planned = 0;
    for (const item of items) {
      const id = identify(item.equipmentId, item.equipmentName);
      ids.add(id);
      planned += item.plannedQty || 0;
      bucket(id).planned += item.plannedQty || 0;
    }
    const adjustment = req.totalPlanned - planned;
    if (adjustment) bucket(null).planned += adjustment;
    const purchaseId = ids.size === 1 && !ids.has(null) ? Array.from(ids)[0] : null;
    if (req.qtyPurchased) bucket(purchaseId).purchased += req.qtyPurchased;
  }
  for (const u of input.usage.filter(r => within(r.date))) bucket(identify(u.equipmentId)).actual += u.dieselIssued || 0;
  for (const l of input.logs.filter(r => within(r.date) && !!r.diesel && r.diesel > 0)) bucket(identify(l.equipmentId, l.machine)).actual += l.diesel || 0;
  const totals = input.dateWise.filter(r => within(r.date)).reduce((s, r) => {
    s.planned += r.planned || 0; s.purchased += r.purchased || 0; s.actual += r.actual || 0; return s;
  }, { planned: 0, purchased: 0, actual: 0 });
  const sums = Array.from(buckets.values()).reduce((s, r) => {
    s.planned += r.planned; s.purchased += r.purchased; s.actual += r.actual; return s;
  }, { planned: 0, purchased: 0, actual: 0 });
  const remainder = { planned: totals.planned - sums.planned, purchased: totals.purchased - sums.purchased, actual: totals.actual - sums.actual };
  if (Object.values(remainder).some(v => Math.abs(v) > 0.00001)) {
    const unassigned = bucket(null);
    unassigned.planned += remainder.planned;
    unassigned.purchased += remainder.purchased;
    unassigned.actual += remainder.actual;
  }
  return Array.from(buckets.values()).filter(r => r.equipmentId !== null || !!(r.planned || r.purchased || r.actual))
    .map(r => ({ ...r, gapFlag: r.equipmentId != null && hasDieselPurchaseGap(r.purchased, r.actual) }))
    .sort((a, b) => a.equipmentId == null ? 1 : b.equipmentId == null ? -1 : a.equipmentName.localeCompare(b.equipmentName));
}

function hasDieselPurchaseGap(purchased: number, issued: number) {
  return purchased > 0 && purchased - issued > Math.max(5, purchased * 0.1);
}

export function dailyDieselStatus(planned: number, purchased: number, issued: number, loggedWork: boolean) {
  if (planned > 0 && purchased === 0) return "Not purchased";
  if (hasDieselPurchaseGap(purchased, issued)) return "Purchased not issued";
  if (issued > 0 && !loggedWork) return "Issued but not logged";
  if (loggedWork && issued === 0 && planned > 0) return "Worked but no diesel issued";
  return "OK";
}

export function buildDailyDieselEquipmentReport(input: ComparisonInput, from: string, to: string, equipmentId?: number) {
  const identify = equipmentIdentity(input.masters);
  const groups = [];
  const totals = { planned: 0, purchased: 0, issued: 0, issueCount: 0 };
  const end = new Date(`${to}T00:00:00Z`).getTime();
  for (let day = new Date(`${from}T00:00:00Z`); day.getTime() <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    const worked = new Set<number | null>([
      ...input.usage.filter(r => r.date === date).map(r => identify(r.equipmentId)),
      ...input.logs.filter(r => r.date === date).map(r => identify(r.equipmentId, r.machine)),
    ]);
    const comparison = buildEquipmentComparison(input, date, date);
    // Keep zero-diesel DPR activity visible, using exactly the comparison identity resolver.
    for (const id of Array.from(worked)) if (!comparison.some(r => r.equipmentId === id)) {
      const master = input.masters.find(m => m.id === id);
      comparison.push({
        equipmentId: id,
        equipmentName: id == null ? "Unattributed / unassigned" : master ? `${master.name}${master.registrationNumber ? ` (${master.registrationNumber})` : ""} [#${id}]` : `Equipment #${id}`,
        attribution: "", planned: 0, purchased: 0, actual: 0, gapFlag: false,
      });
    }
    const rows = comparison.filter(r => equipmentId === undefined || r.equipmentId === equipmentId).map(r => ({
      equipmentId: r.equipmentId, equipmentName: r.equipmentName,
      planned: r.planned, purchased: r.purchased, issued: r.actual,
      loggedWork: worked.has(r.equipmentId),
      statusFlag: dailyDieselStatus(r.planned, r.purchased, r.actual, worked.has(r.equipmentId)),
    }));
    const issueCount = rows.filter(r => r.statusFlag !== "OK").length;
    for (const row of rows) {
      totals.planned += row.planned; totals.purchased += row.purchased; totals.issued += row.issued;
    }
    totals.issueCount += issueCount;
    groups.push({ date, rows, issueCount });
  }
  return { groups, totals };
}