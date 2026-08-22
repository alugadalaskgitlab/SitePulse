/**
 * Instruction 06X-HF2 — Site Dashboard activity filter helper tests.
 *
 * Covers:
 *  A — normalizeActivity: trim, collapse whitespace, lower-case
 *  B — activityFilterValue: BOQ-linked rows use "boq:<id>" identity
 *  C — activityFilterValue: legacy rows use normalized text
 *  D — isBoqActivityValue / boqActivityId round-trip
 *  E — buildActivityFilterOptions: same boqItemId with differing activity text → one entry
 *  F — buildActivityFilterOptions: legacy normalized-text deduplication
 *  G — buildActivityFilterOptions: Scarifying-like legacy values (uppercase stored)
 *  H — buildActivityFilterOptions: BOQ item fields used for label when present
 *  I — dprMatchesActivityFilter: BOQ filter matches by id regardless of text
 *  J — dprMatchesActivityFilter: legacy filter matches by normalized text, boqItemId null
 *  K — dprMatchesActivityFilter: legacy filter does NOT match BOQ-linked row with same text
 *  L — dprMatchesActivityFilter: "boq:" filter does NOT match legacy row with same activity text
 *  M — activityFilterLabel: returns label from options, falls back to raw value
 *  N — composability: site + activity filter together (BOQ and legacy)
 *  O — composability: date + engineer + activity (legacy normalized)
 */

import { describe, it, expect } from "vitest";
import {
  normalizeActivity,
  activityFilterValue,
  isBoqActivityValue,
  boqActivityId,
  buildActivityFilterOptions,
  dprMatchesActivityFilter,
  activityFilterLabel,
} from "@/lib/activityFilter";

// ── A: normalizeActivity ──────────────────────────────────────────────────────

describe("A: normalizeActivity", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeActivity("  Scarifying  ")).toBe("scarifying");
  });

  it("collapses multiple internal spaces", () => {
    expect(normalizeActivity("BC  Laying")).toBe("bc laying");
  });

  it("collapses tabs and newlines", () => {
    expect(normalizeActivity("WMM\tLaying\nWork")).toBe("wmm laying work");
  });

  it("lower-cases the result", () => {
    expect(normalizeActivity("SCARIFYING")).toBe("scarifying");
    expect(normalizeActivity("Bituminous Concrete")).toBe("bituminous concrete");
  });

  it("is idempotent", () => {
    const once = normalizeActivity("  BC  Laying  ");
    expect(normalizeActivity(once)).toBe(once);
  });
});

// ── B & C: activityFilterValue ────────────────────────────────────────────────

describe("B: activityFilterValue — BOQ-linked rows", () => {
  it("returns 'boq:<id>' for non-null boqItemId", () => {
    expect(activityFilterValue("Scarifying", 42)).toBe("boq:42");
    expect(activityFilterValue("BC Laying", 1)).toBe("boq:1");
  });

  it("same boqItemId with different activity text produces same value", () => {
    const v1 = activityFilterValue("SCARIFYING", 7);
    const v2 = activityFilterValue("Scarifying base", 7);
    expect(v1).toBe(v2);
    expect(v1).toBe("boq:7");
  });
});

describe("C: activityFilterValue — legacy rows", () => {
  it("returns normalizedActivity for null boqItemId", () => {
    expect(activityFilterValue("SCARIFYING", null)).toBe("scarifying");
    expect(activityFilterValue("  BC  Laying  ", null)).toBe("bc laying");
  });

  it("returns normalized for undefined boqItemId", () => {
    expect(activityFilterValue("WMM Laying", undefined)).toBe("wmm laying");
  });
});

// ── D: isBoqActivityValue / boqActivityId ────────────────────────────────────

describe("D: isBoqActivityValue / boqActivityId", () => {
  it("recognises 'boq:' prefix", () => {
    expect(isBoqActivityValue("boq:42")).toBe(true);
    expect(isBoqActivityValue("boq:1")).toBe(true);
  });

  it("rejects plain text values", () => {
    expect(isBoqActivityValue("scarifying")).toBe(false);
    expect(isBoqActivityValue("")).toBe(false);
    expect(isBoqActivityValue("bc laying")).toBe(false);
  });

  it("extracts numeric id", () => {
    expect(boqActivityId("boq:42")).toBe(42);
    expect(boqActivityId("boq:1")).toBe(1);
    expect(boqActivityId("boq:100")).toBe(100);
  });
});

// ── E: buildActivityFilterOptions — same boqItemId, differing text ────────────

describe("E: buildActivityFilterOptions — same BOQ id with differing activity text", () => {
  it("collapses to one entry (first seen label wins)", () => {
    const dprs = [
      {
        progress: [
          { activity: "SCARIFYING", boqItemId: 7 },
          { activity: "Scarifying base course", boqItemId: 7 }, // same id, different text
        ],
      },
    ];
    const opts = buildActivityFilterOptions(dprs);
    const boqOpts = opts.filter((o) => o.value === "boq:7");
    expect(boqOpts).toHaveLength(1);
    expect(boqOpts[0].label).toBe("SCARIFYING"); // first seen
  });

  it("two different BOQ ids produce two entries", () => {
    const dprs = [
      {
        progress: [
          { activity: "WMM Laying", boqItemId: 3 },
          { activity: "BC Laying", boqItemId: 5 },
        ],
      },
    ];
    const opts = buildActivityFilterOptions(dprs);
    expect(opts.some((o) => o.value === "boq:3")).toBe(true);
    expect(opts.some((o) => o.value === "boq:5")).toBe(true);
  });
});

// ── F: buildActivityFilterOptions — legacy normalized deduplication ───────────

describe("F: buildActivityFilterOptions — legacy normalized-text deduplication", () => {
  it("collapses same text in different cases to one entry", () => {
    const dprs = [
      {
        progress: [
          { activity: "SCARIFYING", boqItemId: null },
          { activity: "scarifying", boqItemId: null },
          { activity: "  Scarifying  ", boqItemId: null },
        ],
      },
    ];
    const opts = buildActivityFilterOptions(dprs);
    const scarOpts = opts.filter((o) => o.value === "scarifying");
    expect(scarOpts).toHaveLength(1);
  });

  it("preserves distinct normalised values as separate entries", () => {
    const dprs = [
      {
        progress: [
          { activity: "SCARIFYING", boqItemId: null },
          { activity: "BC LAYING", boqItemId: null },
        ],
      },
    ];
    const opts = buildActivityFilterOptions(dprs);
    expect(opts.some((o) => o.value === "scarifying")).toBe(true);
    expect(opts.some((o) => o.value === "bc laying")).toBe(true);
  });
});

// ── G: buildActivityFilterOptions — Scarifying-like uppercase legacy ──────────

describe("G: buildActivityFilterOptions — Scarifying-like uppercase legacy values", () => {
  it("Scarifying stored as 'SCARIFYING' (legacy uppercase) → value is 'scarifying'", () => {
    const dprs = [
      { progress: [{ activity: "SCARIFYING", boqItemId: null }] },
    ];
    const opts = buildActivityFilterOptions(dprs);
    expect(opts).toHaveLength(1);
    expect(opts[0].value).toBe("scarifying");
    expect(opts[0].label).toBe("SCARIFYING"); // raw text preserved for label
  });

  it("filter value 'scarifying' matches a DPR with activity 'SCARIFYING'", () => {
    const dpr = { progress: [{ activity: "SCARIFYING", boqItemId: null }] };
    expect(dprMatchesActivityFilter(dpr, "scarifying")).toBe(true);
  });

  it("filter value 'scarifying' matches mixed-case variants", () => {
    const variants = ["Scarifying", "scarifying", "SCARIFYING", " Scarifying "];
    for (const activity of variants) {
      const dpr = { progress: [{ activity, boqItemId: null }] };
      expect(dprMatchesActivityFilter(dpr, "scarifying")).toBe(true);
    }
  });
});

// ── H: buildActivityFilterOptions — BOQ item fields for label ─────────────────

describe("H: buildActivityFilterOptions — BOQ item fields drive label", () => {
  it("uses boqItemDisplayName when boqItem is provided", () => {
    const dprs = [
      {
        progress: [
          {
            activity: "SCARIFYING",
            boqItemId: 10,
            boqItem: { displayName: "Scarifying & Loosening", itemName: null, description: null },
          },
        ],
      },
    ];
    const opts = buildActivityFilterOptions(dprs);
    const opt = opts.find((o) => o.value === "boq:10");
    expect(opt).toBeDefined();
    expect(opt!.label).toBe("Scarifying & Loosening");
  });

  it("falls back to activity text when boqItem is null", () => {
    const dprs = [
      {
        progress: [
          { activity: "BC LAYING", boqItemId: 11, boqItem: null },
        ],
      },
    ];
    const opts = buildActivityFilterOptions(dprs);
    const opt = opts.find((o) => o.value === "boq:11");
    expect(opt).toBeDefined();
    expect(opt!.label).toBe("BC LAYING");
  });
});

describe("H2: detailed DPR endpoint provides canonical BOQ label fields", () => {
  it("batch-loads unique BOQ items and attaches them to progress rows", async () => {
    const fs = await import("node:fs/promises");
    const routes = await fs.readFile("server/routes.ts", "utf8");
    const route = routes.slice(
      routes.indexOf('app.get("/api/dprs/with-details"'),
      routes.indexOf("// Get site material logs", routes.indexOf('app.get("/api/dprs/with-details"')),
    );
    expect(route).toContain("boqItemIds");
    expect(route).toContain("drizzleInArray(boqItems.id, boqItemIds)");
    expect(route).toContain("boqItem:");
  });
});

// ── I: dprMatchesActivityFilter — BOQ filter matches by id ───────────────────

describe("I: dprMatchesActivityFilter — BOQ filter matches by id regardless of text", () => {
  it("'boq:42' matches a row with boqItemId=42", () => {
    const dpr = {
      progress: [{ activity: "SCARIFYING", boqItemId: 42 }],
    };
    expect(dprMatchesActivityFilter(dpr, "boq:42")).toBe(true);
  });

  it("'boq:42' does NOT match a row with boqItemId=99", () => {
    const dpr = {
      progress: [{ activity: "SCARIFYING", boqItemId: 99 }],
    };
    expect(dprMatchesActivityFilter(dpr, "boq:42")).toBe(false);
  });

  it("'boq:42' matches regardless of activity text", () => {
    const dpr = {
      progress: [{ activity: "Completely Different Text", boqItemId: 42 }],
    };
    expect(dprMatchesActivityFilter(dpr, "boq:42")).toBe(true);
  });

  it("returns true if any row in the DPR matches", () => {
    const dpr = {
      progress: [
        { activity: "BC LAYING", boqItemId: 5 },
        { activity: "WMM", boqItemId: 42 },
      ],
    };
    expect(dprMatchesActivityFilter(dpr, "boq:42")).toBe(true);
  });
});

// ── J: dprMatchesActivityFilter — legacy normalized text match ────────────────

describe("J: dprMatchesActivityFilter — legacy normalized text match", () => {
  it("matches by normalized text when boqItemId is null", () => {
    const dpr = { progress: [{ activity: "SCARIFYING", boqItemId: null }] };
    expect(dprMatchesActivityFilter(dpr, "scarifying")).toBe(true);
  });

  it("filter value must be exact after normalization (no partial match)", () => {
    const dpr = { progress: [{ activity: "WMM LAYING", boqItemId: null }] };
    expect(dprMatchesActivityFilter(dpr, "wmm")).toBe(false);
    expect(dprMatchesActivityFilter(dpr, "wmm laying")).toBe(true);
  });
});

// ── K: legacy filter does NOT match BOQ-linked row ───────────────────────────

describe("K: dprMatchesActivityFilter — legacy filter does NOT match BOQ-linked row", () => {
  it("normalized text filter skips rows with boqItemId set", () => {
    // A row with boqItemId=7 and activity "SCARIFYING" should NOT match the
    // legacy filter "scarifying" — it belongs to the BOQ identity space.
    const dpr = { progress: [{ activity: "SCARIFYING", boqItemId: 7 }] };
    expect(dprMatchesActivityFilter(dpr, "scarifying")).toBe(false);
  });
});

// ── L: BOQ filter does NOT match legacy row ───────────────────────────────────

describe("L: dprMatchesActivityFilter — BOQ filter does NOT match legacy row", () => {
  it("'boq:42' does NOT match a row with boqItemId null even if activity happens to say 'boq:42'", () => {
    const dpr = { progress: [{ activity: "boq:42", boqItemId: null }] };
    expect(dprMatchesActivityFilter(dpr, "boq:42")).toBe(false);
  });
});

// ── M: activityFilterLabel ───────────────────────────────────────────────────

describe("M: activityFilterLabel", () => {
  const opts = [
    { value: "boq:7", label: "Scarifying & Loosening" },
    { value: "scarifying", label: "SCARIFYING" },
    { value: "bc laying", label: "BC LAYING" },
  ];

  it("returns matching label for BOQ value", () => {
    expect(activityFilterLabel("boq:7", opts)).toBe("Scarifying & Loosening");
  });

  it("returns matching label for legacy text value", () => {
    expect(activityFilterLabel("scarifying", opts)).toBe("SCARIFYING");
  });

  it("falls back to raw filterValue when not found in options", () => {
    expect(activityFilterLabel("boq:999", opts)).toBe("boq:999");
    expect(activityFilterLabel("unknown activity", opts)).toBe("unknown activity");
  });

  it("returns empty string for empty filterValue", () => {
    expect(activityFilterLabel("", opts)).toBe("");
  });
});

// ── N: composability — site + activity ───────────────────────────────────────

describe("N: composability — site + activity filter simulation", () => {
  /**
   * Simulates the filtering logic in SiteDashboard.dprs useMemo so we can
   * verify site and activity filters compose correctly without rendering React.
   */
  function applyFilters(
    dprs: Array<{ site: string; engineer?: string; progress?: any[] }>,
    siteFilter: string,
    activityFilter: string,
  ) {
    return dprs.filter((dpr) => {
      if (siteFilter && dpr.site !== siteFilter) return false;
      if (activityFilter && !dprMatchesActivityFilter(dpr, activityFilter)) return false;
      return true;
    });
  }

  const data = [
    { site: "SITE A", progress: [{ activity: "SCARIFYING", boqItemId: 7 }] },
    { site: "SITE A", progress: [{ activity: "WMM", boqItemId: null }] },
    { site: "SITE B", progress: [{ activity: "SCARIFYING", boqItemId: 7 }] },
    { site: "SITE B", progress: [{ activity: "BC LAYING", boqItemId: null }] },
  ];

  it("site filter alone works", () => {
    const result = applyFilters(data, "SITE A", "");
    expect(result).toHaveLength(2);
    expect(result.every((d) => d.site === "SITE A")).toBe(true);
  });

  it("BOQ activity filter alone works", () => {
    const result = applyFilters(data, "", "boq:7");
    expect(result).toHaveLength(2);
    expect(result.every((d) => d.progress?.some((p: any) => p.boqItemId === 7))).toBe(true);
  });

  it("legacy activity filter alone works", () => {
    const result = applyFilters(data, "", "wmm");
    expect(result).toHaveLength(1);
    expect(result[0].site).toBe("SITE A");
  });

  it("site + BOQ activity composability", () => {
    const result = applyFilters(data, "SITE B", "boq:7");
    expect(result).toHaveLength(1);
    expect(result[0].site).toBe("SITE B");
    expect(result[0].progress?.[0].boqItemId).toBe(7);
  });

  it("site + legacy activity composability", () => {
    const result = applyFilters(data, "SITE B", "bc laying");
    expect(result).toHaveLength(1);
    expect(result[0].site).toBe("SITE B");
  });
});

// ── O: composability — engineer + activity ────────────────────────────────────

describe("O: composability — engineer + activity filter simulation", () => {
  function applyFilters(
    dprs: Array<{ engineer: string; progress?: any[] }>,
    engineerFilter: string,
    activityFilter: string,
  ) {
    return dprs.filter((dpr) => {
      if (engineerFilter && dpr.engineer !== engineerFilter) return false;
      if (activityFilter && !dprMatchesActivityFilter(dpr, activityFilter)) return false;
      return true;
    });
  }

  const data = [
    { engineer: "ENG1", progress: [{ activity: "SCARIFYING", boqItemId: null }] },
    { engineer: "ENG1", progress: [{ activity: "WMM LAYING", boqItemId: null }] },
    { engineer: "ENG2", progress: [{ activity: "SCARIFYING", boqItemId: null }] },
    { engineer: "ENG2", progress: [{ activity: "SCARIFYING", boqItemId: 7 }] }, // BOQ-linked
  ];

  it("engineer + legacy activity: only matches legacy rows", () => {
    const result = applyFilters(data, "ENG2", "scarifying");
    // ENG2 has 2 entries: one legacy "SCARIFYING" (matches) and one BOQ "SCARIFYING" (does NOT match legacy filter)
    expect(result).toHaveLength(1);
    expect(result[0].progress?.[0].boqItemId).toBeNull();
  });

  it("engineer + BOQ activity: only matches BOQ-linked rows", () => {
    const result = applyFilters(data, "ENG2", "boq:7");
    expect(result).toHaveLength(1);
    expect(result[0].progress?.[0].boqItemId).toBe(7);
  });

  it("engineer filter alone", () => {
    const result = applyFilters(data, "ENG1", "");
    expect(result).toHaveLength(2);
  });
});
