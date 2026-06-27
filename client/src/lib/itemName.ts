// Shared helper: turn a verbose BOQ description into a short, still-identifiable label.
// Produces "Action gist - distinguishing qualifier" — keeps the work name, grade (M20/M25),
// material (PCC/RCC/WMM/GSB) and the location/sub-item, while dropping boilerplate.
// Sub-items are stored as "Parent — Sub" (em-dash), so we split on that to surface the qualifier.

const MATERIAL_KW = [
  "Wet Mix Macadam", "Granular Sub-Base", "Granular Sub Base", "Dense Bituminous Macadam",
  "Bituminous Concrete", "Dense Graded Bituminous", "Prime Coat", "Tack Coat",
  "Stone Matrix Asphalt", "Crusher Run Macadam", "Water Bound Macadam",
];

const GENERIC_PREFIXES = [
  /^providing,?\s*laying,?\s*spreading\s*(&|and)?\s*compacting\s*(of\s*)?/i,
  /^providing,?\s*laying\s*(in\s*position)?\s*(,?\s*spreading)?\s*(&|and)?\s*(compacting|finishing)?\s*(of\s*)?/i,
  /^providing\s*(&|and)\s*laying\s*(in\s*position\s*)?(of\s*)?/i,
  /^providing\s*(&|and)\s*fixing\s*(of\s*)?/i,
  /^supplying\s*(&|and)\s*(laying|fixing|installing|stacking|spreading)?\s*(of\s*)?/i,
  /^supply\s*(&|and)\s*(laying|fixing)?\s*(of\s*)?/i,
  /^provision\s*of\s*/i,
  /^providing\s*(of\s*)?/i,
];

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
  if (t.length > 48) t = t.slice(0, 48).replace(/\s+\S*$/, "") + "…";
  return t;
}

export function shortItemName(full?: string | null): string {
  if (!full) return "";
  const s = String(full).replace(/\s+/g, " ").trim();
  let head = s, tail = "";
  const dash = s.indexOf(" — ");
  if (dash >= 0) { head = s.slice(0, dash); tail = s.slice(dash + 3); }
  const headShort = gist(head) || s.slice(0, 40);
  let tailShort = cleanQualifier(tail);
  if (!tailShort) tailShort = deriveQualifierFromHead(head);
  if (tailShort && headShort.toLowerCase().includes(tailShort.toLowerCase())) tailShort = "";
  let out = tailShort ? `${headShort} - ${tailShort}` : headShort;
  if (out.length > 80) out = out.slice(0, 80).replace(/\s+\S*$/, "") + "…";
  return out;
}
