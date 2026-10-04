import { authoritativeHireDieselPeriod, calculateEquipmentHireFinancials, calculateHireGroup, monthlyHireSegments, normalizeHireActivities, rawAutoItemCoveredByHireGroup, type HireActivity } from "../shared/hireBilling";
import { calcCandidateAmount, groupRateItems, mapAutoBillItem } from "../shared/vendorBillCandidates";
import { matchingRateCardsForGroup, selectAutoMaterialRateConversion } from "../client/src/lib/vendorBillRateSelection";
import { computeBillGstByCategory, type GstCategory } from "../shared/vendor-bill-gst";
import { PAYABLES_CATEGORIES, PAYABLES_PREVIEW_LABEL, type PayablesItem, type PayablesTotals, type VendorPayablesPreview, type VendorPayablesPreviewRequest } from "../shared/vendorPayablesPreview";
import { vendorBillItemMatchesSite, vendorBillVisibleToSites } from "../shared/siteName";
import type { VendorBillWithItems } from "../shared/schema";
import type { IStorage } from "./storage";

/** Only read capabilities are available to this service. No transactions or mutations. */
export type PayablesPreviewReader = Pick<IStorage, "getVendorBillAutoItems" | "getVendorBillHireActivities" | "getVendorRateCards" | "checkDuplicateBilledItems" | "getVendorBills" | "getHireStatements" | "resolveVendorAliases" | "getSites">;
export interface PayablesPreviewScope {
  permittedSiteNames: string[] | null; siteId: number | null; siteName: string | null;
}
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const gstKey = { equipment: "gstRateEquipment", material: "gstRateMaterial", transport: "gstRateTransport", labour: "gstRateLabour" } as const;

export async function buildVendorPayablesPreview(
  reader: PayablesPreviewReader, input: VendorPayablesPreviewRequest, scope: PayablesPreviewScope,
  now: () => Date = () => new Date(),
): Promise<VendorPayablesPreview> {
  const restricted = scope.permittedSiteNames !== null;
  const authorized = (site: string | null | undefined) => !restricted || scope.permittedSiteNames!.some(name => vendorBillItemMatchesSite(site, name));
  const inSelection = (site: string | null | undefined) => !scope.siteName || vendorBillItemMatchesSite(site, scope.siteName);
  const [rawItems, rawActivities, rawCards, bills, statements, aliases, sites] = await Promise.all([
    reader.getVendorBillAutoItems(input.vendorName, "all", input.periodFrom, input.periodTo, null, scope.siteName),
    reader.getVendorBillHireActivities(input.vendorName, input.periodFrom, input.periodTo),
    reader.getVendorRateCards(input.vendorName), reader.getVendorBills(),
    reader.getHireStatements(), reader.resolveVendorAliases(input.vendorName), reader.getSites(),
  ]);
  const cards = rawCards.map(card => ({ ...card, updatedAt: card.updatedAt?.toISOString() ?? null }));
  const siteMap = new Map(sites.map(site => [site.id, site.name]));
  const vendorAliases = new Set(aliases.map(name => name.trim().toUpperCase()));
  vendorAliases.add(input.vendorName.trim().toUpperCase());
  const vendorBills = bills.filter(b => vendorAliases.has(b.vendorName.trim().toUpperCase()));
  const linkedBillIds = new Set(vendorBills.map(bill => bill.id));
  const savedCoverage = statements.filter(statement => statement.vendorBillId !== null && linkedBillIds.has(statement.vendorBillId!));
  // GST suggestions must not leak a rate from an inaccessible mixed-site bill.
  const accessibleBills = vendorBills.filter(b => !restricted || (
    vendorBillVisibleToSites(b, scope.permittedSiteNames!, siteMap) &&
    (b.items || []).every(item => authorized(item.siteName || (b.siteId ? siteMap.get(b.siteId) : null)))
  )).sort((a, b) => b.billDate.localeCompare(a.billDate) || b.id - a.id);
  const gstRates = Object.fromEntries(PAYABLES_CATEGORIES.map(c => [c, null])) as VendorPayablesPreview["gstRates"];
  const gstSources = Object.fromEntries(PAYABLES_CATEGORIES.map(c => [c, "missing"])) as VendorPayablesPreview["gstSources"];
  for (const c of PAYABLES_CATEGORIES) {
    if (Object.prototype.hasOwnProperty.call(input.gstRates || {}, c)) {
      gstRates[c] = input.gstRates![c] ?? null;
      gstSources[c] = gstRates[c] === null ? "missing" : "entered";
    } else if (c !== "other") {
      const last = accessibleBills.find(b => b.billType === c || (b.items || []).some(item => item.category === c));
      const value = last?.[gstKey[c]];
      // Missing/null remains unknown; a saved explicit zero is valid.
      if (typeof value === "number" && Number.isFinite(value)) { gstRates[c] = value; gstSources[c] = "from last bill — check"; }
    }
  }
  const warnings: string[] = [];
  warnings.push("Other GST is not supported by the existing bill tax engine. Missing or positive Other GST stays incomplete; an explicitly entered 0 is supported.");
  if (restricted) warnings.push("Unallocated monthly availability and site-unlinked maintenance are withheld under your site access. The vendor total includes authorized data only.");
  const allDefaults = rawActivities.filter(row => row.source === "equipment_default");
  const monthlyMasters = allDefaults.filter(row => String(row.equipment?.hireBillingBasis || "").toLowerCase() === "monthly");
  const monthlyCoverage = monthlyMasters.map(row => ({ equipmentId: Number(row.equipmentId), periodFrom: input.periodFrom, periodTo: input.periodTo }));
  // Metadata/maintenance are unallocated, not inferred from another activity.
  const activities = normalizeHireActivities(rawActivities.filter(row =>
    ["dpr_log", "plant_usage", "site_material_trip", "bulk_transport_trip"].includes(row.source) &&
    authorized(row.site) && (!scope.siteName || inSelection(row.site))
  ) as HireActivity[]);
  const candidates = rawItems.filter(item => authorized(item.siteName) && inSelection(item.siteName)).map(mapAutoBillItem)
    .filter(item => !rawAutoItemCoveredByHireGroup(item, monthlyCoverage));
  const duplicates = await reader.checkDuplicateBilledItems(input.vendorName, candidates);
  const excluded = new Set(duplicates.map(match => match.index));
  candidates.forEach((item, index) => {
    if (rawAutoItemCoveredByHireGroup(item, savedCoverage)) excluded.add(index);
  });
  let excludedCount = excluded.size;
  const items: PayablesItem[] = [];
  for (let index = 0; index < candidates.length; index++) {
    if (excluded.has(index)) continue;
    const original = candidates[index];
    const item = { ...original };
    let rateKnown = Number(item.rate) > 0;
    const group = groupRateItems([item])[0];
    let warning: string | undefined;
    if (!rateKnown && group) {
      const conversion = selectAutoMaterialRateConversion(item, group, cards, input.vendorName);
      if (conversion.status === "converted") {
        item.unit = conversion.targetUnit; item.qty = conversion.quantity; item.rate = conversion.rate; rateKnown = true;
      } else if (conversion.status === "same_unit") { item.rate = conversion.rate; rateKnown = true; }
      else if (conversion.status === "ambiguous" || conversion.status === "manual_conversion_required") warning = "Billing unit/rate requires review; no conversion inferred.";
      else {
        const card = matchingRateCardsForGroup(group, item.unit, cards, input.vendorName, { allowVendorAliases: true, allowBlankUnitFallback: true })[0];
        if (card && card.rate !== null && card.rate !== undefined && Number.isFinite(Number(card.rate))) { item.rate = Number(card.rate); rateKnown = true; }
      }
    }
    const category: GstCategory = PAYABLES_CATEGORIES.includes(item.category) ? item.category : "other";
    items.push({ ...item, category, rate: rateKnown ? item.rate : null, amount: rateKnown ? calcCandidateAmount(item) : null,
      ...(!item.siteName ? { unallocatedReason: "Source has no authoritative site allocation." } : {}),
      warning: warning || (!rateKnown ? "No usable saved rate; amount is unknown." : undefined) });
  }
  const hireGroups: VendorPayablesPreview["hireGroups"] = [];
  for (const master of monthlyMasters) {
    // Restricted users never get unknown-site financial availability by inference.
    if (restricted) continue;
    const eq = master.equipment;
    if ((eq.hireStartDate && eq.hireStartDate > input.periodTo) || (eq.hireEndDate && eq.hireEndDate < input.periodFrom)) continue;
    if (!eq.hireStartDate || !(Number(eq.hireRate) > 0) || (eq.hireMonthlyDivisorType === "custom" && !(Number(eq.hireMonthlyDivisor) > 0))) {
      warnings.push(`${eq.name}: monthly terms require review; no amount inferred.`);
      items.push({ date: input.periodFrom, category: "equipment", description: `${eq.name} · MONTHLY HIRE · invalid commercial terms`,
        qty: 1, unit: "MONTHS", rate: null, amount: null, equipmentId: Number(master.equipmentId), source: "hire_group", siteName: null,
        unallocatedReason: "Monthly commercial terms are incomplete; no charge or site allocation inferred.", warning: "Monthly rate/divisor requires review." });
      continue;
    }
    for (const segment of monthlyHireSegments(Date.parse(`${input.periodFrom}T00:00:00Z`), Date.parse(`${input.periodTo}T00:00:00Z`))) {
      const from = new Date(segment.from).toISOString().slice(0, 10);
      const to = new Date(segment.to).toISOString().slice(0, 10);
      // Same overlap rule as the existing save path, including saved drafts.
      if (statements.some(s => Number(s.equipmentId) === Number(master.equipmentId) && s.vendorBillId != null && linkedBillIds.has(s.vendorBillId) && s.periodFrom <= to && s.periodTo >= from)) {
        excludedCount++; continue;
      }
      const groupActivities = normalizeHireActivities(rawActivities.filter(row =>
        Number(row.equipmentId) === Number(master.equipmentId) &&
        ["dpr_log", "plant_usage", "site_material_trip", "bulk_transport_trip"].includes(row.source) &&
        row.businessDate >= from && row.businessDate <= to
      ) as HireActivity[]);
      const result = calculateHireGroup({
        terms: { billingBasis: "monthly", rate: Number(eq.hireRate), hireStartDate: eq.hireStartDate, hireEndDate: eq.hireEndDate,
          monthlyDivisorType: eq.hireMonthlyDivisorType || "30", monthlyDivisor: eq.hireMonthlyDivisor,
          breakdownDeductionEnabled: !!eq.hireBreakdownDeductionEnabled, automaticMonthlyBreakdownDeductions: true,
          breakdownGraceDays: 0, dieselResponsibility: eq.hireDieselResponsibility },
        periodFrom: from, periodTo: to, activities: groupActivities,
        dieselNormOverride: eq.consumptionNorm, dieselNormBasisOverride: eq.meterType === "odometer" ? "L/km" : "L/hr",
        authoritativeDieselPeriod: authoritativeHireDieselPeriod(groupActivities, eq, from, to),
        maintenance: rawActivities.filter(row => row.source === "maintenance" && Number(row.equipmentId) === Number(master.equipmentId) && row.businessDate >= from && row.businessDate <= to)
          .map(row => ({ id: row.sourceId, date: row.businessDate, eventType: row.eventType, description: row.description, downtimeHours: row.downtimeHours })),
        dieselPurchases: rawActivities.filter(row => row.source === "diesel_rate").map(row => ({ id: Number(row.sourceId), date: row.date || row.businessDate, rate: Number(row.rate), qtyPurchased: Number(row.qtyPurchased), purchasedAt: row.purchasedAt })),
      });
      const reason = "Monthly availability and maintenance have no authoritative per-day site allocation; included once, without site proration.";
      hireGroups.push({ id: `monthly-${master.equipmentId}-${from}`, equipmentId: Number(master.equipmentId), equipmentName: eq.name,
        periodFrom: from, periodTo: to, basis: "monthly", rate: Number(eq.hireRate), siteName: null, unallocatedReason: reason,
        dieselResponsibility: eq.hireDieselResponsibility || null, consumptionNorm: eq.consumptionNorm ?? null, meterType: eq.meterType ?? null, result });
      const financials = calculateEquipmentHireFinancials({ grossHire: result.grossAmount, breakdownDeduction: result.deductionAmount, hsdRecovery: result.diesel.finalRecoveryAmount });
      hireGroups[hireGroups.length - 1].financials = financials;
      items.push({ date: from, category: "equipment", description: `${eq.name} · ${from}–${to} · MONTHLY HIRE`,
        qty: result.quantity, unit: "MONTHS", rate: financials.taxableAmount / (result.quantity || 1), amount: financials.taxableAmount,
        equipmentId: Number(master.equipmentId), source: "hire_group", siteName: null, unallocatedReason: reason });
    }
  }
  // Configured nonmonthly hire uses the same group calculator, not raw log
  // qty*rate billing. Only the unbilled source-qualified pull candidates enter it.
  for (const master of allDefaults.filter(row => !monthlyMasters.includes(row))) {
    const eq = master.equipment;
    const groupItems = items.filter(item => item.category === "equipment" && item.equipmentId === Number(master.equipmentId));
    if (!groupItems.length || !["daily", "hourly", "trip"].includes(eq.hireBillingBasis)) continue;
    const sourceRef = (row: HireActivity) => `${row.source === "dpr_log" ? "dpr_equipment" : row.source}:${row.sourceId}`;
    const rows = activities.filter(row => Number(row.equipmentId) === Number(master.equipmentId) && groupItems.some(item =>
      item.sourceId != null ? String(item.sourceId) === sourceRef(row) || item.source === `auto:${sourceRef(row)}` :
        item.date === row.businessDate
    ));
    if (!rows.length) continue;
    if (!eq.hireStartDate || !(Number(eq.hireRate) > 0)) {
      groupItems.forEach(item => { item.rate = null; item.amount = null; item.warning = "Hire master rate/start date requires review; no amount inferred."; });
      continue;
    }
    const maintenance = restricted ? [] : rawActivities.filter(row => row.source === "maintenance" && Number(row.equipmentId) === Number(master.equipmentId))
      .filter(row => !savedCoverage.some(statement => Number(statement.equipmentId) === Number(master.equipmentId) && statement.periodFrom <= row.businessDate && statement.periodTo >= row.businessDate) &&
        !candidates.some((candidate, index) => excluded.has(index) && candidate.equipmentId === Number(master.equipmentId) && candidate.date === row.businessDate))
      .map(row => ({ id: row.sourceId, date: row.businessDate, eventType: row.eventType, description: row.description, downtimeHours: row.downtimeHours }));
    const result = calculateHireGroup({
      terms: { billingBasis: eq.hireBillingBasis, rate: Number(eq.hireRate), hireStartDate: eq.hireStartDate, hireEndDate: eq.hireEndDate,
        dieselResponsibility: eq.hireDieselResponsibility, breakdownDeductionEnabled: !!eq.hireBreakdownDeductionEnabled, breakdownGraceDays: 0 },
      periodFrom: input.periodFrom, periodTo: input.periodTo, activities: rows, maintenance,
      dieselNormOverride: eq.consumptionNorm, dieselNormBasisOverride: eq.meterType === "odometer" ? "L/km" : "L/hr",
      dieselPurchases: restricted ? [] : rawActivities.filter(row => row.source === "diesel_rate").map(row => ({ id: Number(row.sourceId), date: row.date || row.businessDate, rate: Number(row.rate), qtyPurchased: Number(row.qtyPurchased), purchasedAt: row.purchasedAt })),
      authoritativeDieselPeriod: authoritativeHireDieselPeriod(rows, eq, input.periodFrom, input.periodTo),
    });
    const acceptedDates = new Set(rows.map(row => row.businessDate));
    maintenance.forEach(row => acceptedDates.add(row.date));
    result.workingSheet = result.workingSheet.filter(day => acceptedDates.has(day.date));
    const financials = calculateEquipmentHireFinancials({ grossHire: result.grossAmount, breakdownDeduction: result.deductionAmount, hsdRecovery: result.diesel.finalRecoveryAmount });
    const locations = Array.from(new Set(groupItems.map(item => item.siteName).filter(Boolean)));
    const unallocatedReason = maintenance.length || locations.length !== 1 ? "Hire spans multiple/unlinked sites or has site-unlinked maintenance; calculated once without site proration." : undefined;
    // Replace raw operational lines, rather than charging both raw and grouped hire.
    for (const item of groupItems) items.splice(items.indexOf(item), 1);
    items.push({ date: input.periodFrom, category: "equipment", equipmentId: Number(master.equipmentId),
      description: `${eq.name} · ${eq.hireBillingBasis.toUpperCase()} HIRE · ${input.periodFrom}–${input.periodTo}`,
      qty: result.quantity, unit: eq.hireBillingBasis === "daily" ? "DAYS" : eq.hireBillingBasis === "hourly" ? "HRS" : "TRIPS",
      rate: Number(eq.hireRate), amount: financials.taxableAmount, source: "hire_group",
      siteName: unallocatedReason ? null : locations[0] || null, unallocatedReason,
      warning: result.requiresReview ? "Hire exceptions require review; no manual deduction/recovery decision inferred." : undefined });
    hireGroups.push({ id: `activity-${master.equipmentId}`, equipmentId: Number(master.equipmentId), equipmentName: eq.name,
      periodFrom: input.periodFrom, periodTo: input.periodTo, basis: eq.hireBillingBasis, rate: Number(eq.hireRate), siteName: scope.siteName,
      unallocatedReason, dieselResponsibility: eq.hireDieselResponsibility || null, consumptionNorm: eq.consumptionNorm ?? null, meterType: eq.meterType ?? null, result, financials });
  }
  const totals = (selected: PayablesItem[]): PayablesTotals => {
    if (selected.some(item => item.amount === null)) return { preTax: null, gst: null, withGst: null };
    const preTax = money(selected.reduce((sum, item) => sum + item.amount!, 0));
    if (selected.some(item => gstRates[item.category] === null || (item.category === "other" && gstRates.other !== 0))) return { preTax, gst: null, withGst: null };
    const gstByCategory = computeBillGstByCategory({ billType: "all", items: selected,
      gstRateEquipment: gstRates.equipment, gstRateMaterial: gstRates.material,
      gstRateTransport: gstRates.transport, gstRateLabour: gstRates.labour } as unknown as VendorBillWithItems);
    const gst = money(Object.values(gstByCategory).reduce((a, b) => a + b, 0));
    return { preTax, gst, withGst: money(preTax + gst) };
  };
  const unpricedCount = items.filter(item => item.amount === null).length;
  if (unpricedCount) warnings.push("Pre-tax total is incomplete until missing commercial rates are resolved; nothing is valued at a guessed zero.");
  warnings.push("GST is indicative. Recovery/advance adjustments requiring a bill reviewer are not automatically applied.");
  return { label: PAYABLES_PREVIEW_LABEL, generatedAt: now().toISOString(), vendorName: input.vendorName,
    periodFrom: input.periodFrom, periodTo: input.periodTo, siteId: scope.siteId, siteName: scope.siteName,
    gstRates, gstSources, categories: PAYABLES_CATEGORIES.map(category => ({ category, items: items.filter(item => item.category === category), totals: totals(items.filter(item => item.category === category)) })),
    hireGroups, excludedCount, unpricedCount, grandTotal: totals(items), siteTotal: totals(items.filter(item => !item.unallocatedReason)),
    unallocatedTotal: totals(items.filter(item => !!item.unallocatedReason)), warnings };
}