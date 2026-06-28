// SNL resource-mapping review: classify each BOQ item and flag mis-mapped resources.
export type ItemClass =
  | "pavement" | "spray" | "concrete" | "earthwork"
  | "structural" | "counted" | "lumpsum" | "other";

export interface ReviewItem {
  unit?: string | null;
  description?: string | null;
  layerType?: string | null;
  equipment?: { equipmentName?: string | null; count?: number | null }[];
  labour?: { designation?: string | null; count?: number | null }[];
  materials?: { materialName?: string | null }[];
}

const HEAVY_PLANT = /dozer|grader|\bpaver\b|sensor paver|roller|excavator|loader|\bshovel\b|tipper|dumper|scraper|batch|hot\s*mix|\bhmp\b|wmm plant|wet\s*mix plant|crusher|transit mixer|boom placer|water tanker|bowser/i;
const EARTHMOVING = /dozer|grader|excavator|loader|\bshovel\b|tipper|dumper|scraper/i;
const TANKER = /water\s*tanker|bowser|water\s*browser/i;
const MANUAL_CREW = /manual|labour[\s-]?based|labor[\s-]?based|coolie|mazdoor|by\s*hand/i;
const BITUMEN_MAT = /bitumen|\bvg[\s-]?\d+\b|emulsion|crmb|pmb/i;

function unitNorm(u?: string | null) { return (u || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }

export function classifyItem(item: ReviewItem): ItemClass {
  const d = (item.description || "").toLowerCase();
  const u = unitNorm(item.unit);
  const layer = (item.layerType || "").toLowerCase();
  if (/prime\s*coat|tack\s*coat|seal\s*coat/i.test(d) || layer === "spray_coat") return "spray";
  if (layer === "bituminous" || layer === "granular" ||
      /\bwmm\b|wet\s*mix|granular\s*sub[\s-]?base|\bgsb\b|\bdbm\b|bituminous concrete|\bbc\b|bituminous macadam|\bsdbc\b/i.test(d)) return "pavement";
  if (/hume\s*pipe|np[\s-]?\d|spun\s*pipe|\bpipe\b|weep|bedding/i.test(d)) return "structural";
  if (layer === "concrete" || /\bpcc\b|\brcc\b|cement concrete|reinforced concrete/i.test(d)) return "concrete";
  if (["NOS", "NO", "EACH", "NUMBER", "EA"].includes(u)) return "counted";
  if (["LS", "JOB", "LOT", "PERCENT", "PCT"].includes(u) || u === "") return "lumpsum";
  if (u === "CUM" && /embankment|excavation|earth\s*work|filling|borrow/i.test(d)) return "earthwork";
  if (/culvert|abutment|\bpier\b|foundation|retaining\s*wall|\bwall\b|\bdeck\b|\bbox\b|bridge|headwall|wing\s*wall|parapet|footing|\bpile\b|drain/i.test(d)) return "structural";
  return "other";
}

export interface Anomaly { level: "high" | "med"; code: string; message: string }

export function detectAnomalies(item: ReviewItem): Anomaly[] {
  const cls = classifyItem(item);
  const eq = (item.equipment || []).map(e => e.equipmentName || "").filter(Boolean);
  const mat = (item.materials || []).map(m => m.materialName || "").filter(Boolean);
  const flags: Anomaly[] = [];
  const heavy = eq.filter(n => HEAVY_PLANT.test(n));
  const earth = eq.filter(n => EARTHMOVING.test(n));
  const tanker = eq.filter(n => TANKER.test(n));
  if ((cls === "counted" || cls === "lumpsum") && heavy.length)
    flags.push({ level: "high", code: "plant_on_counted", message: `Heavy plant on a ${item.unit ?? cls} item: ${heavy.join(", ")}` });
  if (cls === "structural" && earth.length >= 2)
    flags.push({ level: "high", code: "earthmoving_on_structure", message: `Earthmoving fleet on a structural item: ${earth.join(", ")}` });
  if (tanker.length && !["pavement", "earthwork", "concrete"].includes(cls))
    flags.push({ level: "high", code: "tanker", message: `Water tanker on a ${cls} item` });
  if (mat.some(n => BITUMEN_MAT.test(n)) && cls !== "pavement" && cls !== "spray")
    flags.push({ level: "high", code: "bitumen_wrong", message: `Bitumen material on a non-bituminous item` });
  if (eq.some(n => MANUAL_CREW.test(n)))
    flags.push({ level: "med", code: "manual_in_equip", message: `"Manual/Labour crew" listed under equipment` });
  if (cls === "counted" && eq.length > 2)
    flags.push({ level: "med", code: "too_many_eq", message: `${eq.length} machines on a counted item (expected 0–1)` });
  if ((cls === "pavement" || cls === "concrete") && eq.length === 0 && mat.length === 0)
    flags.push({ level: "med", code: "undermapped", message: `Major layer item has no equipment or materials configured` });
  return flags;
}

const KEEP_LIGHT = /needle\s*vibrator|screed\s*vibrator|plate\s*(vibrator|compactor)|rammer|chain\s*pulley|hydra\b|winch|grinder|welding|concrete mixer\b|small mixer/i;

export function plantToClear(item: ReviewItem): string[] {
  const cls = classifyItem(item);
  if (!["counted", "lumpsum", "structural"].includes(cls)) return [];
  return (item.equipment || [])
    .map(e => e.equipmentName || "")
    .filter(n => n && (HEAVY_PLANT.test(n) || MANUAL_CREW.test(n)) && !KEEP_LIGHT.test(n));
}
