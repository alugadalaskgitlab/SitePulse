// DPR Structure — 4-level hierarchy
// Level 1: structureType → Level 2: structureSubType → Level 3: stage → Level 4: itemOfWork

export type StructureHierarchy = {
  [type: string]: {
    [subType: string]: {
      [stage: string]: string[];
    };
  };
};

export const STRUCTURE_HIERARCHY: StructureHierarchy = {
  "Culvert": {
    "Pipe Culvert": {
      "Excavation":   ["Excavation", "Rock Cutting", "Other"],
      "Bedding":      ["PCC Bedding", "Sand Bedding", "Granular Bedding", "Other"],
      "Pipe Laying":  ["Pipe Laying", "Pipe Jointing", "Other"],
      "Head Wall":    ["Excavation", "PCC", "RCC M20", "Shuttering", "De-shuttering", "Backfilling", "Other"],
      "Wing Wall":    ["Excavation", "PCC", "RCC M20", "Shuttering", "De-shuttering", "Backfilling", "Other"],
      "Backfilling":  ["Backfilling", "Compaction", "Other"],
      "Other":        ["Excavation", "PCC", "RCC M20", "Shuttering", "De-shuttering", "Backfilling", "Bar Bending", "Other"],
    },
    "Box Culvert": {
      "Excavation":   ["Excavation", "Rock Cutting", "Other"],
      "Foundation":   ["PCC", "RCC M20", "RCC M25", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Walls":        ["RCC M20", "RCC M25", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Slab":         ["RCC M20", "RCC M25", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Head Wall":    ["Excavation", "PCC", "RCC M20", "Shuttering", "De-shuttering", "Backfilling", "Other"],
      "Wing Wall":    ["Excavation", "PCC", "RCC M20", "Shuttering", "De-shuttering", "Backfilling", "Other"],
      "Backfilling":  ["Backfilling", "Compaction", "Other"],
      "Other":        ["Excavation", "PCC", "RCC M20", "RCC M25", "Shuttering", "De-shuttering", "Backfilling", "Bar Bending", "Other"],
    },
    "Slab Culvert": {
      "Excavation":           ["Excavation", "Rock Cutting", "Other"],
      "Foundation / Abutment":["PCC", "RCC M20", "RCC M25", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Deck Slab":            ["RCC M20", "RCC M25", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Head Wall":            ["Excavation", "PCC", "RCC M20", "Shuttering", "De-shuttering", "Backfilling", "Other"],
      "Backfilling":          ["Backfilling", "Compaction", "Other"],
      "Other":                ["Excavation", "PCC", "RCC M20", "RCC M25", "Shuttering", "De-shuttering", "Backfilling", "Bar Bending", "Other"],
    },
    "Other": {
      "Other": ["Excavation", "PCC", "RCC M20", "RCC M25", "RCC M30", "Shuttering", "De-shuttering", "Backfilling", "Bar Bending", "Other"],
    },
  },

  "Bridge": {
    "Minor Bridge": {
      "Excavation":    ["Excavation", "Rock Cutting", "Other"],
      "Foundation":    ["PCC", "RCC M20", "RCC M25", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Pier / Abutment":["RCC M25", "RCC M30", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Pier Cap":      ["RCC M25", "RCC M30", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Girder":        ["RCC M25", "RCC M30", "Prestressed", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Deck Slab":     ["RCC M25", "RCC M30", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Wearing Coat":  ["PCC M30", "Bituminous", "Other"],
      "Backfilling":   ["Backfilling", "Compaction", "Other"],
      "Other":         ["Excavation", "PCC", "RCC M20", "RCC M25", "RCC M30", "Shuttering", "De-shuttering", "Backfilling", "Bar Bending", "Other"],
    },
    "Major Bridge": {
      "Excavation":    ["Excavation", "Rock Cutting", "Other"],
      "Foundation":    ["PCC", "RCC M25", "RCC M30", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Pier / Abutment":["RCC M25", "RCC M30", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Pier Cap":      ["RCC M25", "RCC M30", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Girder":        ["RCC M30", "Prestressed", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Deck Slab":     ["RCC M25", "RCC M30", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Wearing Coat":  ["PCC M30", "Bituminous", "Other"],
      "Backfilling":   ["Backfilling", "Compaction", "Other"],
      "Other":         ["Excavation", "PCC", "RCC M25", "RCC M30", "Shuttering", "De-shuttering", "Backfilling", "Bar Bending", "Other"],
    },
    "Other": {
      "Other": ["Excavation", "PCC", "RCC M20", "RCC M25", "RCC M30", "Shuttering", "De-shuttering", "Backfilling", "Bar Bending", "Other"],
    },
  },

  "CD Work": {
    "Causeway": {
      "Excavation":  ["Excavation", "Rock Cutting", "Other"],
      "Foundation":  ["PCC", "RCC M20", "Shuttering", "De-shuttering", "Other"],
      "Body Wall":   ["RCC M20", "Masonry", "Shuttering", "De-shuttering", "Other"],
      "Apron":       ["PCC", "RCC M20", "Other"],
      "Flooring":    ["PCC", "RCC M20", "Other"],
      "Backfilling": ["Backfilling", "Compaction", "Other"],
      "Other":       ["Excavation", "PCC", "RCC M20", "Masonry", "Shuttering", "De-shuttering", "Backfilling", "Other"],
    },
    "Vented Causeway": {
      "Excavation":  ["Excavation", "Rock Cutting", "Other"],
      "Foundation":  ["PCC", "RCC M20", "Shuttering", "De-shuttering", "Other"],
      "Piers":       ["RCC M20", "Shuttering", "De-shuttering", "Other"],
      "Slab":        ["RCC M20", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Backfilling": ["Backfilling", "Compaction", "Other"],
      "Other":       ["Excavation", "PCC", "RCC M20", "Shuttering", "De-shuttering", "Backfilling", "Bar Bending", "Other"],
    },
    "Other": {
      "Other": ["Excavation", "PCC", "RCC M20", "RCC M25", "Shuttering", "De-shuttering", "Backfilling", "Masonry", "Other"],
    },
  },

  "Retaining Wall": {
    "Gravity Wall": {
      "Excavation":  ["Excavation", "Rock Cutting", "Other"],
      "Foundation":  ["PCC", "RCC M20", "Shuttering", "De-shuttering", "Other"],
      "Body Wall":   ["RCC M20", "Masonry", "Shuttering", "De-shuttering", "Other"],
      "Backfilling": ["Backfilling", "Compaction", "Filter Media", "Other"],
      "Other":       ["Excavation", "PCC", "RCC M20", "Masonry", "Shuttering", "De-shuttering", "Backfilling", "Other"],
    },
    "Cantilever Wall": {
      "Excavation":  ["Excavation", "Rock Cutting", "Other"],
      "Foundation":  ["PCC", "RCC M25", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Stem":        ["RCC M25", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Backfilling": ["Backfilling", "Compaction", "Filter Media", "Other"],
      "Other":       ["Excavation", "PCC", "RCC M25", "Shuttering", "De-shuttering", "Backfilling", "Bar Bending", "Other"],
    },
    "Counter-fort Wall": {
      "Excavation":   ["Excavation", "Rock Cutting", "Other"],
      "Foundation":   ["PCC", "RCC M25", "RCC M30", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Base Slab":    ["RCC M25", "RCC M30", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Stem":         ["RCC M25", "RCC M30", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Counter-forts":["RCC M25", "RCC M30", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Backfilling":  ["Backfilling", "Compaction", "Filter Media", "Other"],
      "Other":        ["Excavation", "PCC", "RCC M25", "RCC M30", "Shuttering", "De-shuttering", "Backfilling", "Bar Bending", "Other"],
    },
    "Other": {
      "Other": ["Excavation", "PCC", "RCC M20", "RCC M25", "Masonry", "Shuttering", "De-shuttering", "Backfilling", "Other"],
    },
  },

  "Drain": {
    "RCC Drain": {
      "Excavation":  ["Excavation", "Other"],
      "Foundation":  ["PCC", "RCC M20", "Shuttering", "De-shuttering", "Other"],
      "Side Walls":  ["RCC M20", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Cover Slab":  ["RCC M20", "Precast Cover", "Shuttering", "De-shuttering", "Bar Bending", "Other"],
      "Backfilling": ["Backfilling", "Compaction", "Other"],
      "Other":       ["Excavation", "PCC", "RCC M20", "Shuttering", "De-shuttering", "Backfilling", "Bar Bending", "Other"],
    },
    "Masonry Drain": {
      "Excavation":  ["Excavation", "Other"],
      "Foundation":  ["PCC", "Masonry", "Other"],
      "Side Walls":  ["Masonry", "Plaster", "Other"],
      "Cover Slab":  ["RCC M20", "Precast Cover", "Other"],
      "Backfilling": ["Backfilling", "Compaction", "Other"],
      "Other":       ["Excavation", "PCC", "RCC M20", "Masonry", "Plaster", "Backfilling", "Other"],
    },
    "Catch Water Drain": {
      "Excavation":  ["Excavation", "Other"],
      "Lining":      ["PCC", "Masonry", "RCC M20", "Other"],
      "Backfilling": ["Backfilling", "Compaction", "Other"],
      "Other":       ["Excavation", "PCC", "Masonry", "RCC M20", "Backfilling", "Other"],
    },
    "Other": {
      "Other": ["Excavation", "PCC", "RCC M20", "Masonry", "Shuttering", "De-shuttering", "Backfilling", "Other"],
    },
  },

  "Other": {
    "Other": {
      "Other": ["Excavation", "PCC", "RCC M20", "RCC M25", "RCC M30", "Shuttering", "De-shuttering", "Backfilling", "Bar Bending", "Masonry", "Plaster", "Other"],
    },
  },
};

export const STRUCTURE_TYPES = Object.keys(STRUCTURE_HIERARCHY);

export function getSubTypes(structureType: string): string[] {
  const entry = STRUCTURE_HIERARCHY[structureType];
  return entry ? Object.keys(entry) : ["Other"];
}

export function getStages(structureType: string, subType: string): string[] {
  const entry = STRUCTURE_HIERARCHY[structureType]?.[subType];
  return entry ? Object.keys(entry) : ["Other"];
}

export function getItemsOfWork(structureType: string, subType: string, stage: string): string[] {
  const items = STRUCTURE_HIERARCHY[structureType]?.[subType]?.[stage];
  return items ?? ["Other"];
}
