// DPR Structure — 3-level cascade + fixed items list
// Level 1: structureType → Level 2: structureSubType → Level 3: stage
// Level 4 (itemOfWork): always the fixed STRUCTURE_ITEMS set

export type StageMap = { [subType: string]: string[] };
export type StructureHierarchy = { [type: string]: StageMap };

export const STRUCTURE_HIERARCHY: StructureHierarchy = {
  "Culvert": {
    "Pipe Culvert":  ["Excavation", "Bedding", "Pipe Laying", "Head Wall", "Wing Wall", "Backfilling", "Other"],
    "Box Culvert":   ["Excavation", "Foundation", "Walls", "Slab", "Head Wall", "Wing Wall", "Backfilling", "Other"],
    "Slab Culvert":  ["Excavation", "Foundation / Abutment", "Deck Slab", "Head Wall", "Backfilling", "Other"],
    "Other":         ["Other"],
  },
  "Bridge": {
    "Minor Bridge":  ["Excavation", "Foundation", "Pier / Abutment", "Pier Cap", "Girder", "Deck Slab", "Wearing Coat", "Backfilling", "Other"],
    "Major Bridge":  ["Excavation", "Foundation", "Pier / Abutment", "Pier Cap", "Girder", "Deck Slab", "Wearing Coat", "Other"],
    "ROB":           ["Excavation", "Foundation", "Pier / Abutment", "Pier Cap", "Girder", "Deck Slab", "Wearing Coat", "Other"],
    "VUP / LUP":     ["Excavation", "Foundation", "Walls", "Slab", "Wearing Coat", "Backfilling", "Other"],
    "Other":         ["Other"],
  },
  "CD Work": {
    "Causeway":         ["Excavation", "Foundation", "Body Wall", "Apron", "Flooring", "Backfilling", "Other"],
    "Vented Causeway":  ["Excavation", "Foundation", "Piers", "Slab", "Backfilling", "Other"],
    "Other":            ["Other"],
  },
  "Retaining Wall": {
    "Other": ["Excavation", "Foundation", "Body Wall", "Backfilling", "Other"],
  },
  "Drain": {
    "Lined Drain":      ["Excavation", "Foundation", "Side Walls", "Cover Slab", "Backfilling", "Other"],
    "Unlined Drain":    ["Excavation", "Other"],
    "Catch Water Drain":["Excavation", "Lining", "Other"],
    "Other":            ["Other"],
  },
  "Other": {
    "Other": ["Other"],
  },
};

export const STRUCTURE_TYPES = Object.keys(STRUCTURE_HIERARCHY);

// Fixed set of items of work — same across all stages
export const STRUCTURE_ITEMS = [
  "Excavation", "PCC", "RCC M20", "RCC M25", "RCC M30",
  "Shuttering", "De-shuttering", "Backfilling", "Other",
];

// Resolve to a known type key for hierarchy lookup (custom values → "Other")
function effectiveType(val: string): string {
  return STRUCTURE_TYPES.includes(val) ? val : "Other";
}

export function getSubTypes(structureType: string): string[] {
  return Object.keys(STRUCTURE_HIERARCHY[effectiveType(structureType)]);
}

export function getStages(structureType: string, subType: string): string[] {
  const typeMap = STRUCTURE_HIERARCHY[effectiveType(structureType)];
  const knownSubs = Object.keys(typeMap);
  const effectiveSub = knownSubs.includes(subType) ? subType : "Other";
  return typeMap[effectiveSub] ?? ["Other"];
}
