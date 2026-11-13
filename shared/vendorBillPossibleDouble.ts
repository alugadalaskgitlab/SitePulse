export type VendorMasterIdentity = { id: number; name: string };
export type VendorAliasIdentity = { canonicalName: string; alias: string };

export type PossibleDoubleBillRecord = {
  id?: number | null;
  billNo?: string | null;
  billDate?: string | null;
  totalAmount?: number | string | null;
  vendorId?: number | null;
  vendorName?: string | null;
  vendorAliasNames?: string[] | null;
  status?: string | null;
  isCancelled?: boolean | null;
  isDeleted?: boolean | null;
};

export type PossibleDoubleReason = "invoice_number" | "amount_and_date";
export type PossibleDoubleBillMatch = {
  id: number;
  billNo: string;
  billDate: string | null;
  totalAmount: number | null;
  reason: PossibleDoubleReason;
};

const normalizeName = (value: unknown) =>
  String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();

export const normalizeVendorInvoiceNumber = (value: unknown) =>
  String(value ?? "").replace(/\s+/g, "").toUpperCase();

function normalizedDate(value: unknown): string | null {
  const date = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function dayNumber(value: string): number {
  return Math.floor(Date.parse(`${value}T00:00:00.000Z`) / 86_400_000);
}

function amountInCents(value: unknown): number | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) : null;
}

function isLiveBill(bill: PossibleDoubleBillRecord): boolean {
  return bill.isCancelled !== true && bill.isDeleted !== true &&
    String(bill.status ?? "").toLowerCase() !== "voided";
}

function buildVendorIdsByName(
  bills: PossibleDoubleBillRecord[],
  vendors: VendorMasterIdentity[],
  aliases: VendorAliasIdentity[],
): Map<string, Set<number>> {
  const parent = new Map<string, string>();
  const find = (name: string): string => {
    const current = parent.get(name);
    if (!current) {
      parent.set(name, name);
      return name;
    }
    if (current === name) return name;
    const root = find(current);
    parent.set(name, root);
    return root;
  };
  const union = (left: string, right: string) => {
    if (!left || !right) return;
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };

  for (const alias of aliases) {
    const canonicalName = normalizeName(alias.canonicalName);
    const aliasName = normalizeName(alias.alias);
    if (canonicalName && aliasName) union(canonicalName, aliasName);
  }

  const idsByRoot = new Map<string, Set<number>>();
  const addId = (name: unknown, id: number) => {
    const normalized = normalizeName(name);
    if (!normalized) return;
    const root = find(normalized);
    const ids = idsByRoot.get(root) ?? new Set<number>();
    ids.add(id);
    idsByRoot.set(root, ids);
  };
  for (const vendor of vendors) addId(vendor.name, Number(vendor.id));
  // getVendorBills returns the alias names attached to each linked master
  // identity. This also resolves legacy bill spellings whose alias group does
  // not use the current Vendor Master name as its canonical label.
  for (const bill of bills) {
    if (bill.vendorId == null) continue;
    addId(bill.vendorName, Number(bill.vendorId));
    for (const aliasName of bill.vendorAliasNames ?? []) addId(aliasName, Number(bill.vendorId));
  }

  const idsByName = new Map<string, Set<number>>();
  const knownNames: string[] = [];
  parent.forEach((_root, name) => knownNames.push(name));
  for (const name of knownNames) {
    const ids = idsByRoot.get(find(name));
    if (ids?.size) idsByName.set(name, new Set(ids));
  }
  for (const vendor of vendors) {
    const name = normalizeName(vendor.name);
    if (name && !idsByName.has(name)) idsByName.set(name, new Set([Number(vendor.id)]));
  }
  return idsByName;
}

function vendorIdentity(
  bill: PossibleDoubleBillRecord,
  idsByName: Map<string, Set<number>>,
): { kind: "id"; id: number } | { kind: "name"; name: string } | null {
  const name = normalizeName(bill.vendorName);
  if (bill.vendorId != null) return { kind: "id", id: Number(bill.vendorId) };
  const ids = idsByName.get(name);
  if (ids?.size === 1) return { kind: "id", id: ids.values().next().value as number };
  return name ? { kind: "name", name } : null;
}

function sameVendor(
  left: PossibleDoubleBillRecord,
  right: PossibleDoubleBillRecord,
  idsByName: Map<string, Set<number>>,
): boolean {
  const leftIdentity = vendorIdentity(left, idsByName);
  const rightIdentity = vendorIdentity(right, idsByName);
  if (!leftIdentity || !rightIdentity) return false;
  if (leftIdentity.kind === "id" && rightIdentity.kind === "id") return leftIdentity.id === rightIdentity.id;
  // Unlinked free-text names only match themselves. Alias-based grouping is
  // used only when it resolves to one known Vendor Master record above.
  return leftIdentity.kind === "name" && rightIdentity.kind === "name" &&
    leftIdentity.name === rightIdentity.name;
}

function doubleReason(
  candidate: PossibleDoubleBillRecord,
  existing: PossibleDoubleBillRecord,
): PossibleDoubleReason | null {
  const candidateInvoice = normalizeVendorInvoiceNumber(candidate.billNo);
  const existingInvoice = normalizeVendorInvoiceNumber(existing.billNo);
  if (candidateInvoice && existingInvoice && candidateInvoice === existingInvoice) return "invoice_number";

  const candidateAmount = amountInCents(candidate.totalAmount);
  const existingAmount = amountInCents(existing.totalAmount);
  const candidateDate = normalizedDate(candidate.billDate);
  const existingDate = normalizedDate(existing.billDate);
  if (candidateAmount == null || existingAmount == null || candidateAmount !== existingAmount ||
    !candidateDate || !existingDate) return null;
  const daysApart = Math.abs(dayNumber(candidateDate) - dayNumber(existingDate));
  return daysApart <= 7 ? "amount_and_date" : null;
}

export function findPossibleDoubleBillMatches(
  candidate: PossibleDoubleBillRecord,
  existingBills: PossibleDoubleBillRecord[],
  vendors: VendorMasterIdentity[] = [],
  aliases: VendorAliasIdentity[] = [],
): PossibleDoubleBillMatch[] {
  const vendorIdsByName = buildVendorIdsByName(existingBills, vendors, aliases);
  return existingBills.flatMap(existing => {
    if (!isLiveBill(existing) || (candidate.id != null && Number(existing.id) === Number(candidate.id)) ||
      !sameVendor(candidate, existing, vendorIdsByName)) return [];
    const reason = doubleReason(candidate, existing);
    if (!reason || !Number.isSafeInteger(Number(existing.id))) return [];
    return [{
      id: Number(existing.id),
      billNo: String(existing.billNo ?? ""),
      billDate: normalizedDate(existing.billDate),
      totalAmount: existing.totalAmount == null ? null : Number(existing.totalAmount),
      reason,
    }];
  });
}

export function buildPossibleDoubleBillIndex(
  bills: PossibleDoubleBillRecord[],
  vendors: VendorMasterIdentity[] = [],
  aliases: VendorAliasIdentity[] = [],
): Map<number, PossibleDoubleBillMatch[]> {
  const index = new Map<number, PossibleDoubleBillMatch[]>();
  const vendorIdsByName = buildVendorIdsByName(bills, vendors, aliases);
  const add = (billId: number, match: PossibleDoubleBillMatch) => {
    index.set(billId, [...(index.get(billId) ?? []), match]);
  };
  for (let i = 0; i < bills.length; i++) {
    const left = bills[i];
    if (!isLiveBill(left) || !Number.isSafeInteger(Number(left.id))) continue;
    for (let j = i + 1; j < bills.length; j++) {
      const right = bills[j];
      if (!isLiveBill(right) || !Number.isSafeInteger(Number(right.id)) ||
        !sameVendor(left, right, vendorIdsByName)) continue;
      const reason = doubleReason(left, right);
      if (!reason) continue;
      add(Number(left.id), {
        id: Number(right.id), billNo: String(right.billNo ?? ""),
        billDate: normalizedDate(right.billDate),
        totalAmount: right.totalAmount == null ? null : Number(right.totalAmount), reason,
      });
      add(Number(right.id), {
        id: Number(left.id), billNo: String(left.billNo ?? ""),
        billDate: normalizedDate(left.billDate),
        totalAmount: left.totalAmount == null ? null : Number(left.totalAmount), reason,
      });
    }
  }
  return index;
}
