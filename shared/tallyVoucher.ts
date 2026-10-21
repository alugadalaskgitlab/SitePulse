import { buildSavedBillPresentationRows } from "./vendorBillPresentation";
import { getBillFinancialTotals } from "./vendorBillFinancialReport";
import { normalizeSiteName } from "./siteName";
import {
  tallyBillCategories,
  type TallyBillCategory,
  type TallyComponentKey,
  type TallyExportConfig,
  type TallyMappingRecord,
} from "./tallyExportReadiness";

export type TallyLedgerEntryPreview = {
  ledgerName: string;
  side: "debit" | "credit";
  amount: number;
  isPartyLedger: boolean;
  categoryAllocations: Array<{
    category: string;
    costCentre: string;
    amount: number;
  }>;
};

export type TallyVoucherPreview = {
  billId: number;
  billNo: string;
  billDate: string;
  vendorName: string;
  voucherType: string;
  netPayable: number;
  debits: number;
  credits: number;
  entries: TallyLedgerEntryPreview[];
};

export type TallyVoucherBuildResult = {
  preview: TallyVoucherPreview | null;
  reasons: string[];
};

type TallyVoucherContext = {
  config: TallyExportConfig;
  vendor?: TallyMappingRecord;
  sites: TallyMappingRecord[];
  equipment: TallyMappingRecord[];
};

const EPSILON = 0.005;
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const amountOrNull = (value: unknown): number | null =>
  value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const escapeXml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

function validDate(value: unknown): string | null {
  const date = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : date;
}

function categoryForBillType(value: unknown): TallyBillCategory | "all" | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "all") return "all";
  return (tallyBillCategories as readonly string[]).includes(normalized)
    ? normalized as TallyBillCategory
    : null;
}

function categoryForAdjustment(label: string): TallyComponentKey | null {
  const normalized = label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (normalized.includes("advance")) return "advanceAdjustment";
  if (normalized.includes("hsd") || normalized.includes("diesel")) return "dieselRecovery";
  if (normalized.includes("breakdown")) return "breakdownDeduction";
  if (normalized.includes("operator") || normalized.includes("driver")) return "operatorUnavailable";
  if (normalized === "other debit") return "otherDebit";
  if (normalized === "other credit") return "otherCredit";
  return null;
}

function mappingReason(kind: string, ledgerName: string | null, confirmed: boolean): string | null {
  if (!ledgerName?.trim()) return `${kind} has no mapped Tally ledger.`;
  if (!confirmed) return `${kind} ledger "${ledgerName}" has not been confirmed against HLC Tally.`;
  return null;
}

function resolveSiteForItem(
  item: any,
  bill: any,
  sitesById: Map<number, TallyMappingRecord>,
  sitesByName: Map<string, TallyMappingRecord[]>,
  reasons: string[],
): TallyMappingRecord | null {
  const raw = String(item.siteName ?? "")
    .replace(/^SITE\*?\s*:\s*/i, "")
    .trim();
  if (raw) {
    const matches = sitesByName.get(normalizeSiteName(raw)) ?? [];
    if (matches.length === 1) return matches[0];
    reasons.push(matches.length > 1
      ? `Item site "${raw}" matches multiple Sites Master records.`
      : `Item site "${raw}" is not linked to Sites Master.`);
    return null;
  }
  if (bill.siteId != null) {
    const site = sitesById.get(Number(bill.siteId));
    if (site) return site;
    reasons.push(`Site Master record #${bill.siteId} could not be found.`);
    return null;
  }
  reasons.push(`No site cost centre can be resolved for item "${String(item.description ?? "Unnamed item")}".`);
  return null;
}

function finiteAmount(value: unknown, label: string, reasons: string[]): number | null {
  const amount = amountOrNull(value);
  if (amount == null || amount < -EPSILON) {
    reasons.push(`${label} has a missing, invalid, or negative amount.`);
    return null;
  }
  return roundMoney(amount);
}

export function buildTallyVoucherPreview(bill: any, context: TallyVoucherContext): TallyVoucherBuildResult {
  const reasons: string[] = [];
  const config = context.config;
  const billNo = String(bill.billNo ?? "").trim();
  const billDate = validDate(bill.billDate);
  const vendor = context.vendor;
  const vendorLedger = vendor?.tallyLedgerName?.trim() || null;
  const type = categoryForBillType(bill.billType);

  if (!billNo) reasons.push("Bill number is missing.");
  if (!billDate) reasons.push("Bill date is missing or invalid.");
  if (!vendorLedger) reasons.push("Vendor has no mapped Tally ledger.");
  if (!type) reasons.push(`Unsupported bill type "${String(bill.billType ?? "")}".`);

  const voucherMapping = type === "all"
    ? config.voucherMappings.all
    : type ? config.voucherMappings[type] : null;
  if (voucherMapping && !voucherMapping.voucherType.trim()) reasons.push("Tally voucher type is missing.");
  if (voucherMapping && !voucherMapping.confirmed) {
    reasons.push(`Tally voucher type "${voucherMapping.voucherType}" has not been confirmed against HLC Tally.`);
  }

  const sitesById = new Map(context.sites.map(site => [site.id, site]));
  const sitesByName = new Map<string, TallyMappingRecord[]>();
  for (const site of context.sites) {
    const normalized = normalizeSiteName(site.name);
    sitesByName.set(normalized, [...(sitesByName.get(normalized) ?? []), site]);
  }
  const equipmentById = new Map(context.equipment.map(machine => [machine.id, machine]));

  const items: any[] = Array.isArray(bill.items) ? bill.items : [];
  const statements: any[] = Array.isArray(bill.hireStatements) ? bill.hireStatements : [];
  const statementsById = new Map<number, any>();
  for (const statement of statements) {
    const id = Number(statement.id);
    if (Number.isSafeInteger(id) && id > 0) statementsById.set(id, statement);
  }

  const entries = new Map<string, TallyLedgerEntryPreview>();
  const addEntry = (
    ledgerName: string | null,
    side: "debit" | "credit",
    amount: number,
    isPartyLedger = false,
    categoryAllocations: TallyLedgerEntryPreview["categoryAllocations"] = [],
  ) => {
    if (amount < EPSILON) return;
    if (!ledgerName?.trim()) {
      reasons.push(`A ${side} entry has no mapped Tally ledger.`);
      return;
    }
    const key = `${side}|${isPartyLedger ? "party" : "ledger"}|${ledgerName.trim()}`;
    const existing = entries.get(key) ?? {
      ledgerName: ledgerName.trim(),
      side,
      amount: 0,
      isPartyLedger,
      categoryAllocations: [],
    };
    existing.amount = roundMoney(existing.amount + amount);
    for (const allocation of categoryAllocations) {
      const allocationKey = `${allocation.category}|${allocation.costCentre}`;
      const old = existing.categoryAllocations.find(row => `${row.category}|${row.costCentre}` === allocationKey);
      if (old) old.amount = roundMoney(old.amount + allocation.amount);
      else existing.categoryAllocations.push({ ...allocation, amount: roundMoney(allocation.amount) });
    }
    entries.set(key, existing);
  };

  const totals = getBillFinancialTotals(bill);
  const rows = buildSavedBillPresentationRows(bill, totals);
  const grossRow = rows.find(row => row.kind === "gross");
  const netRow = [...rows].reverse().find(row => row.kind === "net");
  const grossExpected = finiteAmount(grossRow?.amount, "Gross amount", reasons);
  const netPayable = amountOrNull(netRow?.amount);
  if (netPayable == null || netPayable <= 0) reasons.push("Net payable is missing, invalid, or not a positive vendor payable.");

  let lineGross = 0;
  const usedStatementIds = new Set<number>();
  for (const item of items) {
    const itemCategory = categoryForBillType(item.category || (type === "all" ? "" : type));
    if (!itemCategory || itemCategory === "all") {
      reasons.push(`Item "${String(item.description ?? "Unnamed item")}" has no supported bill category.`);
      continue;
    }
    if (type !== "all" && itemCategory !== type) {
      reasons.push(`Item "${String(item.description ?? "Unnamed item")}" category does not match the bill type.`);
      continue;
    }
    const categoryMapping = config.voucherMappings[itemCategory];
    const expenseLedger = categoryMapping.expenseLedger?.trim() || null;
    const expenseMappingError = mappingReason(`${itemCategory} expense`, expenseLedger, categoryMapping.confirmed);
    if (expenseMappingError) reasons.push(expenseMappingError);

    const source = String(item.source ?? "").toLowerCase();
    const statementId = amountOrNull(item.hireStatementId);
    const isHireLine = source === "hire_statement" || source === "hire_group" || statementId != null;
    let amount: number | null;
    let equipmentId = amountOrNull(item.equipmentId);
    if (isHireLine) {
      if (itemCategory !== "equipment") {
        reasons.push(`Hire line "${String(item.description ?? "Unnamed item")}" is not categorized as equipment.`);
        continue;
      }
      if (statementId == null || !Number.isSafeInteger(statementId)) {
        reasons.push(`Hire line "${String(item.description ?? "Unnamed item")}" is not linked to a hire statement.`);
        continue;
      }
      const statement = statementsById.get(statementId);
      if (!statement) {
        reasons.push(`Hire statement #${statementId} is missing from the bill.`);
        continue;
      }
      if (usedStatementIds.has(statementId)) {
        reasons.push(`Hire statement #${statementId} is linked to more than one bill item.`);
        continue;
      }
      usedStatementIds.add(statementId);
      equipmentId = amountOrNull(statement.equipmentId);
      amount = finiteAmount(
        statement.grossAmount ?? statement.calculationSnapshot?.financials?.grossHire ?? statement.calculationSnapshot?.grossAmount,
        `Hire statement #${statementId} gross`,
        reasons,
      );
      const savedNet = amountOrNull(statement.netAmount);
      const itemNet = amountOrNull(item.amount);
      if (savedNet == null || itemNet == null || Math.abs(roundMoney(savedNet) - roundMoney(itemNet)) >= EPSILON) {
        reasons.push(`Hire statement #${statementId} does not reconcile to its linked bill item.`);
      }
    } else {
      amount = finiteAmount(item.amount, `Item "${String(item.description ?? "Unnamed item")}"`, reasons);
    }
    if (amount == null || amount < EPSILON) continue;
    lineGross = roundMoney(lineGross + amount);

    const site = resolveSiteForItem(item, bill, sitesById, sitesByName, reasons);
    const projectCostCentre = site?.tallyCostCentreName?.trim() || null;
    if (!projectCostCentre && site) reasons.push(`Site "${site.name}" has no Name in Tally.`);
    const allocations: TallyLedgerEntryPreview["categoryAllocations"] = [];
    if (projectCostCentre) {
      allocations.push({ category: config.projectCategory, costCentre: projectCostCentre, amount });
    }

    if (itemCategory === "equipment") {
      if (equipmentId == null || !Number.isSafeInteger(equipmentId)) {
        reasons.push(`Equipment item "${String(item.description ?? "Unnamed item")}" is not linked to a machine.`);
      } else {
        const machine = equipmentById.get(equipmentId);
        if (!machine) {
          reasons.push(`Equipment Master record #${equipmentId} could not be found.`);
        } else if (!machine.tallyCostCentreName?.trim()) {
          reasons.push(`Machine "${machine.name}" has no Name in Tally.`);
        } else {
          allocations.push({
            category: config.resourceCategory,
            costCentre: machine.tallyCostCentreName.trim(),
            amount,
          });
        }
      }
    }
    addEntry(expenseLedger, "debit", amount, false, allocations);
  }

  if (items.length === 0) reasons.push("No saved bill line items are available for itemized export.");
  if (usedStatementIds.size !== statements.length) {
    reasons.push("One or more hire statements do not have exactly one linked bill item.");
  }
  if (grossExpected != null && Math.abs(roundMoney(lineGross) - grossExpected) >= EPSILON) {
    reasons.push(`Itemized gross ${lineGross.toFixed(2)} does not match saved gross ${grossExpected.toFixed(2)}.`);
  }

  for (const row of rows) {
    if (row.kind === "gross" || row.kind === "net" || Math.abs(row.amount) < EPSILON) continue;
    let component: TallyComponentKey | null = null;
    let side: "debit" | "credit";
    let amount = Math.abs(roundMoney(row.amount));
    if (row.kind === "gst") {
      component = "gst";
      side = "debit";
    } else if (row.kind === "tds") {
      component = "tds";
      side = "credit";
    } else {
      component = categoryForAdjustment(row.label);
      side = row.amount < 0 ? "credit" : "debit";
      if (!component) reasons.push(`Adjustment "${row.label}" has no confirmed accounting treatment.`);
    }
    if (!component) continue;
    const componentMapping = config.componentLedgerMappings[component];
    const componentError = mappingReason(component, componentMapping.ledgerName, componentMapping.confirmed);
    if (componentError) reasons.push(componentError);
    addEntry(componentMapping.ledgerName, side, amount);
  }

  if (netPayable != null && netPayable > 0 && vendorLedger) {
    addEntry(vendorLedger, "credit", roundMoney(netPayable), true);
  }

  const finalEntries = Array.from(entries.values())
    .map(entry => ({
      ...entry,
      amount: roundMoney(entry.amount),
      categoryAllocations: entry.categoryAllocations
        .map(allocation => ({ ...allocation, amount: roundMoney(allocation.amount) }))
        .sort((a, b) => a.category.localeCompare(b.category) || a.costCentre.localeCompare(b.costCentre)),
    }))
    .filter(entry => entry.amount >= EPSILON)
    .sort((a, b) => Number(a.isPartyLedger) - Number(b.isPartyLedger) || a.ledgerName.localeCompare(b.ledgerName));
  const debits = roundMoney(finalEntries.filter(entry => entry.side === "debit").reduce((sum, entry) => sum + entry.amount, 0));
  const credits = roundMoney(finalEntries.filter(entry => entry.side === "credit").reduce((sum, entry) => sum + entry.amount, 0));
  if (Math.abs(debits - credits) >= EPSILON) {
    reasons.push(`Voucher does not balance: debits ${debits.toFixed(2)} and credits ${credits.toFixed(2)}.`);
  }
  const savedRowsTotal = roundMoney(rows
    .filter(row => row.kind !== "net")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0));
  if (netPayable != null && Math.abs(savedRowsTotal - roundMoney(netPayable)) >= EPSILON) {
    reasons.push(`Saved components ${savedRowsTotal.toFixed(2)} do not reconcile to net payable ${roundMoney(netPayable).toFixed(2)}.`);
  }

  const uniqueReasons = Array.from(new Set(reasons));
  if (uniqueReasons.length || !billDate || !voucherMapping || !vendorLedger || netPayable == null) {
    return { preview: null, reasons: uniqueReasons };
  }
  return {
    preview: {
      billId: Number(bill.id),
      billNo,
      billDate,
      vendorName: vendor?.name || String(bill.vendorName ?? ""),
      voucherType: voucherMapping.voucherType,
      netPayable: roundMoney(netPayable),
      debits,
      credits,
      entries: finalEntries,
    },
    reasons: [],
  };
}

function allocationXml(entry: TallyLedgerEntryPreview): string {
  const byCategory = new Map<string, TallyLedgerEntryPreview["categoryAllocations"]>();
  for (const allocation of entry.categoryAllocations) {
    byCategory.set(allocation.category, [...(byCategory.get(allocation.category) ?? []), allocation]);
  }
  return Array.from(byCategory, ([category, allocations]) => `
            <CATEGORYALLOCATIONS.LIST>
              <CATEGORY>${escapeXml(category)}</CATEGORY>${allocations.map(allocation => `
              <COSTCENTREALLOCATIONS.LIST>
                <NAME>${escapeXml(allocation.costCentre)}</NAME>
                <AMOUNT>${entry.side === "debit" ? "-" : ""}${allocation.amount.toFixed(2)}</AMOUNT>
              </COSTCENTREALLOCATIONS.LIST>`).join("")}
            </CATEGORYALLOCATIONS.LIST>`).join("");
}

function ledgerEntryXml(entry: TallyLedgerEntryPreview, billNo: string): string {
  const debit = entry.side === "debit";
  const amount = entry.amount.toFixed(2);
  const partyAllocation = entry.isPartyLedger
    ? `
            <BILLALLOCATIONS.LIST>
              <NAME>${escapeXml(billNo)}</NAME>
              <BILLTYPE>New Ref</BILLTYPE>
              <AMOUNT>${amount}</AMOUNT>
            </BILLALLOCATIONS.LIST>`
    : "";
  return `
          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${escapeXml(entry.ledgerName)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>${debit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
            <ISPARTYLEDGER>${entry.isPartyLedger ? "Yes" : "No"}</ISPARTYLEDGER>
            <AMOUNT>${debit ? "-" : ""}${amount}</AMOUNT>${partyAllocation}${allocationXml(entry)}
          </ALLLEDGERENTRIES.LIST>`;
}

export function buildTallyImportXml(companyName: string, vouchers: TallyVoucherPreview[]): string {
  const messages = vouchers.map(voucher => `
      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER VCHTYPE="${escapeXml(voucher.voucherType)}" ACTION="Create" OBJVIEW="Accounting Voucher View">
          <DATE>${voucher.billDate.replace(/-/g, "")}</DATE>
          <VOUCHERTYPENAME>${escapeXml(voucher.voucherType)}</VOUCHERTYPENAME>
          <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
          <ISINVOICE>No</ISINVOICE>
          <REFERENCE>${escapeXml(voucher.billNo)}</REFERENCE>
          <REFERENCEDATE>${voucher.billDate.replace(/-/g, "")}</REFERENCEDATE>
          <NARRATION>HLC vendor bill ${escapeXml(voucher.billNo)}</NARRATION>${voucher.entries.map(entry => ledgerEntryXml(entry, voucher.billNo)).join("")}
        </VOUCHER>
      </TALLYMESSAGE>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>Vouchers</ID>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>${messages}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}
