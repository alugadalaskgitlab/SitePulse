import { normalizeSiteName } from "./siteName";

export type TallyExportConfig = {
  companyName: string;
  cutoverDate: string;
  projectCategory: string;
  resourceCategory: string;
  voucherMappings: TallyVoucherMappings;
  componentLedgerMappings: TallyComponentLedgerMappings;
};

export const tallyBillCategories = ["material", "equipment", "transport", "labour"] as const;
export type TallyBillCategory = typeof tallyBillCategories[number];

export const tallyComponentKeys = [
  "gst",
  "tds",
  "advanceAdjustment",
  "dieselRecovery",
  "breakdownDeduction",
  "operatorUnavailable",
  "otherDebit",
  "otherCredit",
] as const;
export type TallyComponentKey = typeof tallyComponentKeys[number];

export type TallyVoucherMapping = {
  voucherType: string;
  expenseLedger: string | null;
  confirmed: boolean;
};

export type TallyCombinedVoucherMapping = {
  voucherType: string;
  confirmed: boolean;
};

export type TallyComponentLedgerMapping = {
  ledgerName: string | null;
  confirmed: boolean;
};

export type TallyVoucherMappings = Record<TallyBillCategory, TallyVoucherMapping> & {
  all: TallyCombinedVoucherMapping;
};

export type TallyComponentLedgerMappings = Record<TallyComponentKey, TallyComponentLedgerMapping>;

export const defaultTallyVoucherMappings: TallyVoucherMappings = {
  material: { voucherType: "Purchase", expenseLedger: "Purchase of Material", confirmed: false },
  equipment: { voucherType: "Journal", expenseLedger: "Machinery Hire Charges", confirmed: false },
  transport: { voucherType: "Journal", expenseLedger: null, confirmed: false },
  labour: { voucherType: "Journal", expenseLedger: null, confirmed: false },
  all: { voucherType: "Journal", confirmed: false },
};

export const emptyTallyComponentLedgerMappings: TallyComponentLedgerMappings = {
  gst: { ledgerName: null, confirmed: false },
  tds: { ledgerName: null, confirmed: false },
  advanceAdjustment: { ledgerName: null, confirmed: false },
  dieselRecovery: { ledgerName: null, confirmed: false },
  breakdownDeduction: { ledgerName: null, confirmed: false },
  operatorUnavailable: { ledgerName: null, confirmed: false },
  otherDebit: { ledgerName: null, confirmed: false },
  otherCredit: { ledgerName: null, confirmed: false },
};

function parseVoucherMappings(value: unknown): TallyVoucherMappings {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const result = structuredClone(defaultTallyVoucherMappings);
  for (const category of tallyBillCategories) {
    const row = source[category];
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    result[category] = {
      voucherType: typeof record.voucherType === "string" ? record.voucherType.trim() : result[category].voucherType,
      expenseLedger: typeof record.expenseLedger === "string" && record.expenseLedger.trim()
        ? record.expenseLedger.trim()
        : null,
      confirmed: record.confirmed === true,
    };
  }
  const all = source.all;
  if (all && typeof all === "object") {
    const record = all as Record<string, unknown>;
    result.all = {
      voucherType: typeof record.voucherType === "string" ? record.voucherType.trim() : result.all.voucherType,
      confirmed: record.confirmed === true,
    };
  }
  return result;
}

function parseComponentLedgerMappings(value: unknown): TallyComponentLedgerMappings {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const result = structuredClone(emptyTallyComponentLedgerMappings);
  for (const component of tallyComponentKeys) {
    const row = source[component];
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    result[component] = {
      ledgerName: typeof record.ledgerName === "string" && record.ledgerName.trim()
        ? record.ledgerName.trim()
        : null,
      confirmed: record.confirmed === true,
    };
  }
  return result;
}

export function parseTallyExportConfig(value: string | null | undefined): TallyExportConfig {
  if (!value) throw new Error("Tally export configuration is missing.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Tally export configuration is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Tally export configuration must be an object.");
  }
  const config = parsed as Record<string, unknown>;
  const required = ["companyName", "cutoverDate", "projectCategory", "resourceCategory"] as const;
  for (const key of required) {
    if (typeof config[key] !== "string" || config[key].length === 0) {
      throw new Error(`Tally export configuration is missing ${key}.`);
    }
  }
  const cutoverDate = config.cutoverDate as string;
  const parsedDate = new Date(`${cutoverDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoverDate) ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== cutoverDate) {
    throw new Error("Tally export cutover date must be a valid YYYY-MM-DD date.");
  }
  return {
    companyName: config.companyName as string,
    cutoverDate,
    projectCategory: config.projectCategory as string,
    resourceCategory: config.resourceCategory as string,
    voucherMappings: parseVoucherMappings(config.voucherMappings),
    componentLedgerMappings: parseComponentLedgerMappings(config.componentLedgerMappings),
  };
}

export function trimTallyMappingName(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

export type TallyMappingRecord = {
  id: number;
  name: string;
  tallyLedgerName?: string | null;
  tallyCostCentreName?: string | null;
  registrationNumber?: string | null;
  ownership?: string | null;
};

export type TallyReadinessBillInput = {
  id: number;
  billNo?: string | null;
  billDate?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  status?: string | null;
  vendorId?: number | null;
  vendorName?: string | null;
  siteId?: number | null;
  siteScopeConfirmed?: boolean | null;
  isCancelled?: boolean | null;
  isDeleted?: boolean | null;
  items?: Array<{
    siteName?: string | null;
    equipmentId?: number | null;
    hireStatementId?: number | null;
  }> | null;
  hireStatements?: Array<{ equipmentId?: number | null }> | null;
};

export type TallyReadinessBill = {
  id: number;
  billNo: string;
  billDate: string;
  periodFrom: string | null;
  periodTo: string | null;
  vendorName: string;
  href: string;
};

export type TallyBlockedBill = TallyReadinessBill & { reasons: string[] };

export type TallyMappingCoverage = {
  total: number;
  mapped: number;
  unmapped: Array<{ id: number; name: string; detail?: string }>;
};

export type TallyExportReadinessReport = {
  config: TallyExportConfig;
  coverage: {
    vendors: TallyMappingCoverage;
    sites: TallyMappingCoverage;
    hiredMachines: TallyMappingCoverage;
  };
  candidates: {
    total: number;
    preCutover: number;
    postCutover: number;
    straddlesCutover: number;
    periodNotRecorded: number;
    ready: number;
    blocked: number;
  };
  readyBills: TallyReadinessBill[];
  preCutoverBills: TallyReadinessBill[];
  straddlingBills: TallyReadinessBill[];
  periodNotRecordedBills: TallyReadinessBill[];
  blockedBills: TallyBlockedBill[];
};

function isMapped(value: string | null | undefined) {
  return !!value?.trim();
}

function mappingCoverage(records: TallyMappingRecord[], mapping: (record: TallyMappingRecord) => string | null | undefined): TallyMappingCoverage {
  const unmapped = records
    .filter(record => !isMapped(mapping(record)))
    .map(record => ({
      id: record.id,
      name: record.name,
      ...(record.registrationNumber ? { detail: record.registrationNumber } : {}),
    }));
  return { total: records.length, mapped: records.length - unmapped.length, unmapped };
}

function rawPeriodDate(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function validDateOnly(value: string | null | undefined): string | null {
  const normalized = rawPeriodDate(value);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) return null;
  return normalized;
}

function billSummary(bill: TallyReadinessBillInput, vendorName: string): TallyReadinessBill {
  return {
    id: bill.id,
    billNo: bill.billNo?.trim() || `Bill #${bill.id}`,
    billDate: String(bill.billDate ?? ""),
    periodFrom: rawPeriodDate(bill.periodFrom),
    periodTo: rawPeriodDate(bill.periodTo),
    vendorName,
    href: `/finance/vendor-bills?billId=${encodeURIComponent(String(bill.id))}`,
  };
}

function validPositiveId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function buildTallyExportReadiness(input: {
  config: TallyExportConfig;
  vendors: TallyMappingRecord[];
  sites: TallyMappingRecord[];
  hiredMachines: TallyMappingRecord[];
  bills: TallyReadinessBillInput[];
}): TallyExportReadinessReport {
  const { config, vendors, sites, hiredMachines } = input;
  const cutoverDate = validDateOnly(config.cutoverDate);
  if (!cutoverDate) throw new Error("Tally export cutover date must be a valid YYYY-MM-DD date.");
  const vendorById = new Map(vendors.map(vendor => [vendor.id, vendor]));
  const siteById = new Map(sites.map(site => [site.id, site]));
  const sitesByName = new Map<string, TallyMappingRecord[]>();
  for (const site of sites) {
    const key = normalizeSiteName(site.name);
    sitesByName.set(key, [...(sitesByName.get(key) ?? []), site]);
  }
  const equipmentById = new Map(hiredMachines.map(machine => [machine.id, machine]));
  const candidates = input.bills.filter(bill =>
    (bill.status === "approved" || bill.status === "paid") &&
    bill.isCancelled !== true &&
    bill.isDeleted !== true,
  );
  const preCutoverBills: TallyReadinessBill[] = [];
  const straddlingBills: TallyReadinessBill[] = [];
  const periodNotRecordedBills: TallyReadinessBill[] = [];
  const blockedBills: TallyBlockedBill[] = [];
  const readyBills: TallyReadinessBill[] = [];
  let postCutover = 0;
  let ready = 0;

  for (const bill of candidates) {
    const vendor = bill.vendorId == null ? undefined : vendorById.get(Number(bill.vendorId));
    const summary = billSummary(bill, vendor?.name || bill.vendorName || "(unlinked vendor)");
    const billDate = String(bill.billDate ?? "");
    const periodFrom = validDateOnly(bill.periodFrom);
    const periodTo = validDateOnly(bill.periodTo);
    if (!periodFrom || !periodTo || periodFrom > periodTo) {
      periodNotRecordedBills.push(summary);
      continue;
    }
    if (periodTo <= cutoverDate) {
      preCutoverBills.push(summary);
      continue;
    }
    if (periodFrom > cutoverDate) {
      postCutover++;
    } else {
      straddlingBills.push(summary);
      continue;
    }

    const reasons: string[] = [];
    if (!validDateOnly(billDate)) {
      reasons.push("Bill date is missing or invalid.");
    }

    if (bill.vendorId == null) {
      reasons.push("Vendor is not linked to Vendor Master.");
    } else if (!vendor) {
      reasons.push(`Vendor Master record #${bill.vendorId} could not be found.`);
    } else if (!isMapped(vendor.tallyLedgerName)) {
      reasons.push(`Vendor "${vendor.name}" has no Name in Tally.`);
    }

    const referencedSiteIds = new Set<number>();
    let hasSiteReference = false;
    const checkSite = (site: TallyMappingRecord | undefined, siteId?: number) => {
      if (!site) {
        reasons.push(`Site Master record #${siteId} could not be found.`);
        return;
      }
      referencedSiteIds.add(site.id);
    };
    if (bill.siteId != null) {
      hasSiteReference = true;
      checkSite(siteById.get(Number(bill.siteId)), Number(bill.siteId));
    }
    for (const item of bill.items ?? []) {
      const rawSiteName = String(item.siteName ?? "")
        .replace(/^SITE\*?\s*:\s*/i, "")
        .trim();
      if (!rawSiteName) continue;
      hasSiteReference = true;
      const matches = sitesByName.get(normalizeSiteName(rawSiteName)) ?? [];
      if (matches.length === 0) {
        reasons.push(`Site "${rawSiteName}" is not linked to Sites Master.`);
      } else if (matches.length > 1) {
        reasons.push(`Site "${rawSiteName}" matches multiple Sites Master records.`);
      } else {
        referencedSiteIds.add(matches[0].id);
      }
    }
    if (!hasSiteReference) {
      reasons.push(bill.siteScopeConfirmed === true
        ? "All Sites is selected, but no site-specific bill lines identify cost centres."
        : "No Site Master record is linked to this bill.");
    }
    for (const siteId of Array.from(referencedSiteIds)) {
      const site = siteById.get(siteId);
      if (site && !isMapped(site.tallyCostCentreName)) {
        reasons.push(`Site "${site.name}" has no Name in Tally.`);
      }
    }

    const requiredMachines = new Set<number>();
    for (const item of bill.items ?? []) {
      const equipmentId = validPositiveId(item.equipmentId);
      if (equipmentId && equipmentById.has(equipmentId)) requiredMachines.add(equipmentId);
    }
    for (const statement of bill.hireStatements ?? []) {
      const equipmentId = validPositiveId(statement.equipmentId);
      if (!equipmentId) continue;
      requiredMachines.add(equipmentId);
      const machine = equipmentById.get(equipmentId);
      if (!machine) {
        reasons.push(`Hired machine #${equipmentId} is missing from Equipment Master.`);
      }
    }
    for (const equipmentId of Array.from(requiredMachines)) {
      const machine = equipmentById.get(equipmentId);
      if (machine && !isMapped(machine.tallyCostCentreName)) {
        const label = machine.registrationNumber ? `${machine.name} (${machine.registrationNumber})` : machine.name;
        reasons.push(`Hired machine "${label}" has no Name in Tally.`);
      }
    }

    const uniqueReasons = Array.from(new Set(reasons));
    if (uniqueReasons.length) blockedBills.push({ ...summary, reasons: uniqueReasons });
    else {
      ready++;
      readyBills.push(summary);
    }
  }

  return {
    config,
    coverage: {
      vendors: mappingCoverage(vendors, record => record.tallyLedgerName),
      sites: mappingCoverage(sites, record => record.tallyCostCentreName),
      hiredMachines: mappingCoverage(hiredMachines, record => record.tallyCostCentreName),
    },
    candidates: {
      total: candidates.length,
      preCutover: preCutoverBills.length,
      postCutover,
      straddlesCutover: straddlingBills.length,
      periodNotRecorded: periodNotRecordedBills.length,
      ready,
      blocked: blockedBills.length,
    },
    readyBills,
    preCutoverBills,
    straddlingBills,
    periodNotRecordedBills,
    blockedBills,
  };
}
