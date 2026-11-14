export type NameTidyKind = "sentence" | "title" | "site";

const fixedCase = new Map<string, string>([
  ...[
    "BC", "SDBC", "DBM", "DGBM", "BM", "WMM", "GSB", "PCC", "VCC", "RCC", "CC",
    "HP", "NP2", "NP3", "NP4", "M10", "M15", "M20", "M25", "M30", "VG-30", "VG-40",
    "SS-1", "RS-1", "LDO", "HSD", "JCB", "HMP", "BOQ", "DPR", "IRC", "PWD",
    "HLC", "HLCPL", "B.T",
  ].map(value => [value.toUpperCase(), value] as [string, string]),
  ["MORTH", "MoRTH"],
  ["KM", "km"],
  ["MM", "mm"],
  ["M", "m"],
  ["CUM", "cum"],
  ["SQM", "sqm"],
  ["MT", "MT"],
]);

const titleParticles = new Set(["a", "an", "and", "at", "by", "for", "in", "of", "on", "the", "to", "with"]);

function formatSegment(token: string, kind: NameTidyKind, first: boolean) {
  const known = fixedCase.get(token.toUpperCase());
  if (known) return known;
  const numericUnit = token.match(/^((?:\d+\/)?\d+)mm$/i);
  if (numericUnit) return `${numericUnit[1]}mm`;
  const match = token.match(/^([^A-Za-z]*)([A-Za-z].*?)([^A-Za-z]*)$/);
  if (!match) return token;
  const [, before, letters, after] = match;
  const lower = letters.toLowerCase();
  const formatted = kind === "sentence"
    ? (first ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower)
    : (!first && titleParticles.has(lower) ? lower : lower.charAt(0).toUpperCase() + lower.slice(1));
  return `${before}${formatted}${after}`;
}

function transformName(value: string, kind: NameTidyKind) {
  const words = value.trim().split(/(\s+)/);
  let wordIndex = 0;
  return words.map(part => {
    if (!part.trim()) return part;
    const wholeKnown = fixedCase.get(part.toUpperCase());
    if (wholeKnown) {
      wordIndex++;
      return wholeKnown;
    }
    const segments = part.split(/([\-\/–])/);
    let segmentIndex = 0;
    const out = segments.map(segment => {
      if (/^[\-\/–]$/.test(segment)) return segment;
      const first = wordIndex === 0 && segmentIndex === 0;
      segmentIndex++;
      return formatSegment(segment, kind, first);
    }).join("");
    wordIndex++;
    return out;
  }).join("");
}

export function suggestTidyName(value: string, kind: NameTidyKind): string {
  let cleaned = String(value ?? "").trim().replace(/\s+/g, " ");
  cleaned = cleaned.replace(/\b((?:\d+\/)?\d+)\s*MM\b/gi, "$1mm");
  if (kind === "site") {
    cleaned = cleaned.replace(/\s+Edited by\b.*$/i, "").trim();
    cleaned = cleaned.replace(/\bKM\s+stone\b/gi, "Kilometre stone");
    cleaned = cleaned.replace(/\bHectometre\s+stone\b/gi, "Hectometre stone");
    if (/^kilometre stone$/i.test(cleaned)) return "Kilometre stone";
    if (/^hectometre stone$/i.test(cleaned)) return "Hectometre stone";
    return transformName(cleaned, "site");
  }
  return transformName(cleaned, kind);
}
