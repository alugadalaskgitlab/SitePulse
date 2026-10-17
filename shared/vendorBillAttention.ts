export const vendorBillAttentionKinds = [
  "site",
  "paid_amount",
  "period",
  "bill_date_before_period_end",
  "negative_net",
] as const;

export type VendorBillAttentionKind = typeof vendorBillAttentionKinds[number];

export const vendorBillAttentionLabels: Record<VendorBillAttentionKind, string> = {
  site: "No site answer",
  paid_amount: "Paid amount not recorded",
  period: "Billed period incomplete",
  bill_date_before_period_end: "Bill date before period end",
  negative_net: "Negative net (review only)",
};

export type HireSiteActivity = {
  equipmentId: number;
  equipmentName: string | null;
  date: string;
  siteName: string | null;
};

export type SiteOption = { id: number; name: string };

export type HireSiteSuggestion = {
  siteId: number;
  siteName: string;
  evidence: string[];
};

function hasRecordedAmount(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function siteKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/^SITE(?:\*|:)?\s*:?\s*/i, "")
    .replace(/\s+/g, " ")
    .toLocaleUpperCase();
}

export function getVendorBillAttentionKinds(bill: any, net: number): VendorBillAttentionKind[] {
  const kinds: VendorBillAttentionKind[] = [];
  if (bill.siteId == null && bill.siteScopeConfirmed !== true) kinds.push("site");
  if (bill.status === "paid" && !hasRecordedAmount(bill.amountPaid)) kinds.push("paid_amount");
  if (!bill.periodFrom || !bill.periodTo) kinds.push("period");
  if (bill.billDate && bill.periodTo && String(bill.billDate).slice(0, 10) < String(bill.periodTo).slice(0, 10)) {
    kinds.push("bill_date_before_period_end");
  }
  if (net < 0) kinds.push("negative_net");
  return kinds;
}

export function summarizeVendorBillAttention(
  rows: Array<{ kinds: VendorBillAttentionKind[] }>,
) {
  const counts = Object.fromEntries(vendorBillAttentionKinds.map(kind => [kind, 0])) as Record<VendorBillAttentionKind, number>;
  for (const row of rows) {
    for (const kind of row.kinds) counts[kind] += 1;
  }
  return { bills: rows.length, counts };
}

/**
 * A bill-level site suggestion is only returned when every linked statement
 * has exactly one recorded site and all statements agree on that same site.
 * It is read-only evidence; callers must require a separate user action.
 */
export function buildHireSiteSuggestion(
  bill: any,
  activity: HireSiteActivity[],
  sites: SiteOption[],
): HireSiteSuggestion | null {
  const statements = Array.isArray(bill.hireStatements) ? bill.hireStatements : [];
  if (!statements.length) return null;

  const evidence: string[] = [];
  let suggestedSite: SiteOption | null = null;

  for (const statement of statements) {
    const periodFrom = String(statement.periodFrom ?? "").slice(0, 10);
    const periodTo = String(statement.periodTo ?? "").slice(0, 10);
    if (!periodFrom || !periodTo) return null;

    const activitySites = new Map<string, string>();
    for (const row of activity) {
      if (Number(row.equipmentId) !== Number(statement.equipmentId)) continue;
      const date = String(row.date ?? "").slice(0, 10);
      if (date < periodFrom || date > periodTo) continue;
      const name = String(row.siteName ?? "").trim();
      const key = siteKey(name);
      if (key) activitySites.set(key, name.replace(/^SITE(?:\*|:)?\s*:?\s*/i, "").trim());
    }
    if (activitySites.size !== 1) return null;

    const [key, recordedSiteName] = Array.from(activitySites.entries())[0];
    const matches = sites.filter(site => siteKey(site.name) === key);
    if (matches.length !== 1) return null;
    if (suggestedSite && suggestedSite.id !== matches[0].id) return null;
    suggestedSite = matches[0];

    const equipmentName = activity.find(row =>
      Number(row.equipmentId) === Number(statement.equipmentId) &&
      row.equipmentName?.trim(),
    )?.equipmentName?.trim() || `Equipment ${statement.equipmentId}`;
    evidence.push(`${equipmentName} worked only at ${recordedSiteName} between ${periodFrom} and ${periodTo}`);
  }

  return suggestedSite ? { siteId: suggestedSite.id, siteName: suggestedSite.name, evidence } : null;
}
