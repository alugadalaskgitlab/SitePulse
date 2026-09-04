// ─────────────────────────────────────────────────────────────────────────────
// BOQ item display naming — SINGLE SOURCE OF TRUTH for client and server.
//
// Business rule: operational labels use a manually saved override or a
// trustworthy canonical SNL label. Without either, lightly clean the imported
// description without rewriting its technical meaning or abbreviations.
//
// Priority for the operational label (boqItemDisplayName):
//   1. Saved manual short-name override (`displayName` column on boq_items)
//   2. Canonical SNL label from a deterministic or manually confirmed mapping
//   3. Lightly cleaned original description
//
// Do NOT re-implement short-name logic locally in pages/components — import
// from here so naming cannot drift.
// ─────────────────────────────────────────────────────────────────────────────

const MATERIAL_KW = [
  "Wet Mix Macadam", "Granular Sub-Base", "Granular Sub Base", "Dense Bituminous Macadam",
  "Bituminous Concrete", "Dense Graded Bituminous", "Prime Coat", "Tack Coat",
  "Stone Matrix Asphalt", "Crusher Run Macadam", "Water Bound Macadam",
];
const GENERIC_PREFIXES = [
  /^providing,?\s*supplying\s*(&|and)?\s*/i,
  /^supplying,?\s*providing\s*(&|and)?\s*/i,
  /^providing,?\s*laying,?\s*spreading\s*(&|and)?\s*compacting\s*(of\s*)?/i,
  /^providing,?\s*laying\s*(in\s*position)?\s*(,?\s*spreading)?\s*(&|and)?\s*(compacting|finishing)?\s*(of\s*)?/i,
  /^providing\s*(&|and)\s*laying\s*(in\s*position\s*)?(of\s*)?/i,
  /^providing\s*(&|and)\s*fixing\s*(of\s*)?/i,
  /^providing\s*(&|and)\s*casting\s*(of\s*)?/i,
  /^supplying\s*(&|and)\s*(laying|installing|stacking|spreading|fixing)?\s*(of\s*)?/i,
  /^supply\s*(&|and)\s*(laying|fixing)?\s*(of\s*)?/i,
  /^provision\s*of\s*/i,
  /^providing\s*(of\s*)?/i,
  /^construction\s*of\s*/i,
  /^constructing\s*(of\s*)?/i,
];

function clip(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).replace(/\s+\S*$/, "").trim() + "…";
}

function gist(headRaw: string): string {
  let h = headRaw.replace(/\s+/g, " ").trim();
  for (const kw of MATERIAL_KW) {
    if (h.toLowerCase().includes(kw.toLowerCase())) {
      const grade = h.match(/grading[\s-]*(i{1,3}|iv|v|\d)/i);
      return grade ? `${kw} (${grade[0].replace(/grading/i, "Grading").trim()})` : kw;
    }
  }
  for (const re of GENERIC_PREFIXES) { const n = h.replace(re, ""); if (n !== h) { h = n.trim(); break; } }
  h = h.split(/,| including| complete\b| conforming| as per| in accordance| by providing| by mixing| i\.e\b| with motor| using /i)[0].trim();
  return h.replace(/[\s.;:,-]+$/, "").trim();
}

function deriveQualifierFromHead(headRaw: string): string {
  if (/borrow area/i.test(headRaw)) return "borrow area";
  const grade = headRaw.match(/\bM[\s-]?(10|15|20|25|30|35|40|45|50)\b/i);
  if (grade) return grade[0].toUpperCase().replace(/[\s-]/g, "");
  const grading = headRaw.match(/grading[\s-]*(i{1,3}|iv|v|\d)/i);
  if (grading) return grading[0].replace(/grading/i, "Grading").trim();
  return "";
}

function cleanQualifier(tailRaw: string): string {
  if (!tailRaw) return "";
  let t = tailRaw.replace(/\s+/g, " ").trim();
  t = t.replace(/^\(?\s*(x{0,3}(ix|iv|v?i{0,3})|[a-z]|\d{1,2})\s*[).\-:]\s*/i, "").trim();
  t = t.split(/ complete\b| as per| including| conforming| i\.e\b/i)[0].trim();
  t = t.replace(/[\s.;:,-]+$/, "").trim();
  if (t.length > 48) t = clip(t, 48);
  return t;
}

/** Derive a concise short name from a full BOQ description. */
export function shortItemName(full?: string | null): string {
  if (!full) return "";
  const s = String(full).replace(/\s+/g, " ").trim();
  let head = s, tail = "";
  const dash = s.indexOf(" — ");
  if (dash >= 0) { head = s.slice(0, dash); tail = s.slice(dash + 3); }
  let headShort = gist(head);
  if (headShort.length < 4) headShort = clip(head.replace(/^[,;:.\s-]+/, ""), 48);
  let tailShort = cleanQualifier(tail);
  if (!tailShort) tailShort = deriveQualifierFromHead(head);
  if (tailShort && headShort.toLowerCase().includes(tailShort.toLowerCase())) tailShort = "";
  const out = tailShort ? `${headShort} - ${tailShort}` : headShort;
  return out.length > 80 ? clip(out, 80) : out;
}

/** Shape any BOQ-item-like object can satisfy for display naming. */
export interface BoqItemNameFields {
  displayName?: string | null;
  itemName?: string | null;
  description?: string | null;
  canonicalDisplayName?: string | null;
  mappingStatus?: string | null;
  snlMappingStatus?: string | null;
  snlShortLabel?: string | null;
  snlMappedBy?: string | null;
  snlMappingIsAuto?: boolean | null;
  snlConfidence?: number | null;
}

/** Preserve BOQ terminology; only normalize whitespace and the first character. */
export function cleanBoqDisplayFallback(full?: string | null): string {
  const cleaned = String(full ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const firstMeaningful = cleaned.search(/[A-Za-z]/);
  if (firstMeaningful < 0) return cleaned;
  return cleaned.slice(0, firstMeaningful)
    + cleaned[firstMeaningful].toUpperCase()
    + cleaned.slice(firstMeaningful + 1);
}

function cleanCanonicalLabel(label?: string | null): string {
  return String(label ?? "")
    .split(/\s+\|\s+/)[0]
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Return a canonical SNL label only when existing mapping provenance proves the
 * mapping was manually confirmed or came from a deterministic automatic path.
 */
export function trustedCanonicalBoqName(item?: BoqItemNameFields | null): string {
  if (!item) return "";
  const status = item.snlMappingStatus ?? item.mappingStatus;
  if (status !== "mapped") return "";

  const manual = item.snlMappingIsAuto === false;
  const deterministic = item.snlMappingIsAuto === true && (
    item.snlMappedBy === "rule"
    || item.snlMappedBy === "auto-propagated"
    || (item.snlMappedBy === "auto" && Number(item.snlConfidence) === 1)
  );
  return manual || deterministic ? cleanCanonicalLabel(item.snlShortLabel) : "";
}

function manualDisplayOverride(item: BoqItemNameFields): string {
  const saved = item.displayName?.replace(/\s+/g, " ").trim() ?? "";
  if (!saved) return "";

  // The old bulk classifier populated display_name with shortItemName(). Those
  // values have no manual provenance, so do not let them masquerade as a saved
  // override. Distinct values remain valid admin-entered names.
  const generatedCandidates = [item.itemName, item.description]
    .map(source => shortItemName(source))
    .filter(Boolean);
  if (generatedCandidates.some(candidate => candidate.toLocaleLowerCase() === saved.toLocaleLowerCase())) {
    return "";
  }
  return saved;
}

/**
 * The authoritative OPERATIONAL display label for a BOQ item.
 * Never treats an unconfirmed fuzzy SNL suggestion as a canonical name.
 */
export function boqItemDisplayName(item?: BoqItemNameFields | null): string {
  if (!item) return "";
  const saved = manualDisplayOverride(item);
  if (saved) return saved;
  const canonical = cleanCanonicalLabel(item.canonicalDisplayName) || trustedCanonicalBoqName(item);
  if (canonical) return canonical;
  return cleanBoqDisplayFallback(item.description ?? item.itemName);
}
