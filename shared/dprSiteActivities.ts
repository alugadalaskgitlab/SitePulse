export const DPR_SITE_ACTIVITY_TYPES = [
  "levels",
  "test",
  "office",
  "visit",
  "other",
] as const;

export const DPR_SITE_ACTIVITY_TYPE_LABELS: Record<(typeof DPR_SITE_ACTIVITY_TYPES)[number], string> = {
  levels: "Levels / survey",
  test: "Lab / field test",
  office: "Office work",
  visit: "Inspection / meeting",
  other: "Other",
};

export const DPR_SITE_ACTIVITY_TESTS = [
  "Field density (FDD / compaction)",
  "CBR",
  "Gradation",
  "Atterberg limits (PI)",
  "Moisture content (OMC)",
  "Marshall",
  "Bitumen extraction",
  "Cube strength",
] as const;

export const DPR_SITE_ACTIVITY_TEST_PLACES = [
  "On site (field test)",
  "Site lab",
  "Outside lab",
] as const;

export const DPR_SITE_ACTIVITY_LEVEL_KINDS = [
  "Own check",
  "Joint levels with department",
  "Initial ground levels (OGL)",
  "Setting out / centre line",
] as const;

export const DPR_SITE_ACTIVITY_OFFICE_WORK = [
  "MB entry",
  "RA bill preparation",
  "Drawings / cross sections",
  "Reports",
  "Letters / correspondence",
  "Stores / records",
] as const;

export const DPR_SITE_ACTIVITY_DEFAULT_LAYERS = [
  "OGL / initial",
  "Embankment layer 1",
  "Embankment layer 2",
  "Embankment layer 3",
  "Subgrade layer 1",
  "Subgrade layer 2",
  "GSB",
  "WMM",
  "BC",
] as const;

export function calculateSiteActivityResult(resultValue: unknown, requiredValue: unknown): boolean | null {
  const parse = (value: unknown): number | null => {
    if (typeof value !== "string" && typeof value !== "number") return null;
    if (typeof value === "string" && !value.trim()) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const result = parse(resultValue);
  const required = parse(requiredValue);
  return result == null || required == null ? null : result >= required;
}

export function formatDprChainage(value: unknown): string {
  const km = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(km)) return "";
  const metres = Math.round(km * 1000);
  const sign = metres < 0 ? "-" : "";
  const absolute = Math.abs(metres);
  return `${sign}${Math.floor(absolute / 1000)}+${String(absolute % 1000).padStart(3, "0")}`;
}
