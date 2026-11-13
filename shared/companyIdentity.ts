export const DEFAULT_COMPANY_NAME = "Your company";
export const DEFAULT_PLANT_NAME = "Main Plant";

export type CompanyIdentity = {
  companyName: string;
  companyShortName: string;
  ownCompanyPartyName?: string | null;
};

export function deriveCompanyShortName(companyName: string): string {
  return companyName
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 5);
}

export function resolveCompanyIdentity(input: {
  companyName?: string | null;
  companyShortName?: string | null;
  ownCompanyPartyName?: string | null;
}): CompanyIdentity {
  const configuredCompanyName = input.companyName?.trim();
  const companyName = configuredCompanyName || DEFAULT_COMPANY_NAME;
  const companyShortName = input.companyShortName?.trim() ||
    (configuredCompanyName ? deriveCompanyShortName(companyName) : DEFAULT_COMPANY_NAME);
  return {
    companyName,
    companyShortName,
    ownCompanyPartyName: input.ownCompanyPartyName?.trim() || null,
  };
}

/** Keep document prefixes in one safe path segment without changing saved numbers. */
export function companyPrefixSegment(shortName: string): string {
  const segment = shortName.trim().toUpperCase()
    .replace(/[\/\\%_]+/g, "-")
    .replace(/\s+/g, " ");
  if (!segment) throw new Error("Company short name is required to create a document number.");
  return segment;
}

export function formatVendorBillNumber(shortName: string, year: number, sequence: number): string {
  return `${companyPrefixSegment(shortName)}/VB/${year}/${String(sequence).padStart(4, "0")}`;
}

export function formatInternalRequisitionNumber(
  shortName: string,
  year: number,
  fromCode: string,
  initials: string,
  materialCode: string,
  sequence: number,
): string {
  return `${companyPrefixSegment(shortName)}/IRN/${year}/${fromCode}-${initials}-${materialCode}/${String(sequence).padStart(4, "0")}`;
}

export function nextVendorBillSequence(
  shortName: string,
  year: number,
  billNumbersInIdOrder: Array<string | null | undefined>,
): number {
  const prefix = `${companyPrefixSegment(shortName)}/VB/${year}/`;
  const last = [...billNumbersInIdOrder].reverse().find(value => value?.startsWith(prefix));
  const suffix = last?.slice(prefix.length) ?? "";
  const lastSequence = /^\d+$/.test(suffix) ? Number(suffix) : 0;
  return lastSequence + 1;
}

export function nextPurchaseIndentSequence(input: {
  shortName: string;
  legacyCounter: number;
  companyCounter: number;
  legacyCount: number;
  companyCount: number;
  companyMax: number;
}): number {
  const isHlc = companyPrefixSegment(input.shortName) === "HLC";
  return Math.max(
    isHlc ? input.legacyCounter : input.companyCounter,
    isHlc ? input.legacyCount : input.companyCount,
    input.companyMax,
  ) + 1;
}

export function nextInternalRequisitionSequence(shortName: string, legacyCount: number, companyCount: number): number {
  return (companyPrefixSegment(shortName) === "HLC" ? legacyCount : companyCount) + 1;
}

/**
 * Format only user-facing copy, never saved names, notes, keys, or identifiers.
 * Legacy HLC wording maps to the configured identity at render time.
 */
export function formatCompanyText(
  text: string,
  identity: Pick<CompanyIdentity, "companyName" | "companyShortName">,
): string {
  const name = identity.companyName.trim() || DEFAULT_COMPANY_NAME;
  const shortName = identity.companyShortName.trim() || DEFAULT_COMPANY_NAME;
  return text
    .replace(/\bHigh Lane Constructions Pvt Ltd\b/gi, name)
    .replace(/\bHigh Lane Constructions\b/gi, name)
    .replace(/\bHLC\b/gi, shortName);
}

export function isLegacyHlcCompany(identity: Pick<CompanyIdentity, "companyName" | "companyShortName">): boolean {
  return identity.companyShortName.trim().toUpperCase() === "HLC" ||
    identity.companyName.trim().toUpperCase() === "HIGH LANE CONSTRUCTIONS PVT LTD";
}

export function canRunLegacyLedgerGapFix(shortName: string | null | undefined): boolean {
  return (shortName || "").trim().toUpperCase() === "HLC";
}

export function isOwnCompanyName(name: string, identity: CompanyIdentity): boolean {
  const normalized = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const candidate = normalized(name);
  if (!candidate) return false;
  const knownNames = [identity.ownCompanyPartyName, identity.companyName, identity.companyShortName]
    .filter((value): value is string => !!value?.trim())
    .map(normalized);
  if (knownNames.includes(candidate)) return true;
  return identity.companyShortName.trim().toUpperCase() === "HLC" &&
    (candidate === "HLC" || candidate === "H L C" || candidate.includes("HIGH LANE CONSTRUCTION"));
}
