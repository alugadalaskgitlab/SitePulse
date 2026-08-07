import { describe, it, expect } from "vitest";
import { getBaseSiteName, siteMatchesPermitted } from "../shared/siteName";

// Real production-shaped site strings that caused the 13-vs-10 report bug:
// edited DPRs carry a provenance suffix in `site`, and site-access checks
// compared the full string exactly, hiding edited reports from restricted users.
const PERMITTED = ["TAKKADPALLY-SIRUR"];

describe("getBaseSiteName (shared)", () => {
  it("returns plain site names unchanged", () => {
    expect(getBaseSiteName("TAKKADPALLY-SIRUR")).toBe("TAKKADPALLY-SIRUR");
  });

  it("strips en-dash 'Edited by' suffixes (production format)", () => {
    expect(getBaseSiteName("TAKKADPALLY-SIRUR – Edited by Manager – 2026-06-07 07:00:21"))
      .toBe("TAKKADPALLY-SIRUR");
    expect(getBaseSiteName("TAKKADPALLY-SIRUR – Edited by Admin – 2026-05-27 07:36:38"))
      .toBe("TAKKADPALLY-SIRUR");
    expect(getBaseSiteName("TAKKADPALLY-SIRUR – Edited by Engineer – 2026-06-01 14:47:27"))
      .toBe("TAKKADPALLY-SIRUR");
  });

  it("strips hyphen / em-dash / colon separated suffixes and 'Copy by'", () => {
    expect(getBaseSiteName("SITE A - Edited by Admin - 2026-01-01 10:00:00")).toBe("SITE A");
    expect(getBaseSiteName("SITE A — Copy by Manager — 2026-01-01 10:00:00")).toBe("SITE A");
    expect(getBaseSiteName("SITE A: Edited by Admin 2026-01-01")).toBe("SITE A");
    expect(getBaseSiteName("SITE A Edited by Admin 2026-01-01")).toBe("SITE A");
  });

  it("is case-insensitive on the suffix keyword", () => {
    expect(getBaseSiteName("SITE A – edited by admin – 2026-01-01")).toBe("SITE A");
  });

  it("does not mangle site names that legitimately contain dashes", () => {
    expect(getBaseSiteName("DTPL-BASAVAKALYAN")).toBe("DTPL-BASAVAKALYAN");
    expect(getBaseSiteName("VATPALLY LAXMI NARASIMHA CONSTUCTIONS-VENKAT REDDY"))
      .toBe("VATPALLY LAXMI NARASIMHA CONSTUCTIONS-VENKAT REDDY");
  });

  it("handles empty / degenerate input without throwing", () => {
    expect(getBaseSiteName("")).toBe("");
    // A string that is ONLY a suffix falls back to the original rather than ""
    expect(getBaseSiteName("– Edited by Admin – 2026-01-01")).toBe("– Edited by Admin – 2026-01-01");
  });
});

describe("siteMatchesPermitted (server access filter)", () => {
  it("matches plain DPR site names against permitted list", () => {
    expect(siteMatchesPermitted("TAKKADPALLY-SIRUR", PERMITTED)).toBe(true);
  });

  it("matches suffixed (edited) DPR site names — the 13-vs-10 bug", () => {
    expect(siteMatchesPermitted("TAKKADPALLY-SIRUR – Edited by Manager – 2026-06-07 07:00:21", PERMITTED)).toBe(true);
    expect(siteMatchesPermitted("TAKKADPALLY-SIRUR – Edited by Admin – 2026-05-27 07:36:38", PERMITTED)).toBe(true);
    expect(siteMatchesPermitted("TAKKADPALLY-SIRUR – Edited by Engineer – 2026-06-01 14:47:27", PERMITTED)).toBe(true);
  });

  it("still hides other sites from restricted users (no over-grant)", () => {
    expect(siteMatchesPermitted("FDR KK ROAD", PERMITTED)).toBe(false);
    expect(siteMatchesPermitted("FDR KK ROAD – Edited by Admin – 2026-01-01 10:00:00", PERMITTED)).toBe(false);
    // A different site whose name merely CONTAINS the permitted name must not match
    expect(siteMatchesPermitted("TAKKADPALLY-SIRUR-EXTENSION", PERMITTED)).toBe(false);
  });

  it("normalises the permitted names too (defensive both-sides matching)", () => {
    expect(siteMatchesPermitted(
      "TAKKADPALLY-SIRUR – Edited by Admin – 2026-01-01",
      ["TAKKADPALLY-SIRUR – Edited by Manager – 2025-12-31"],
    )).toBe(true);
  });

  it("empty permitted list matches nothing", () => {
    expect(siteMatchesPermitted("TAKKADPALLY-SIRUR", [])).toBe(false);
  });
});

describe("restricted-user visibility parity (simulated route filters)", () => {
  // Mirrors the exact filter now used by /api/dprs/with-details and getDprs.
  const allActiveDprs = [
    { id: 225, site: "TAKKADPALLY-SIRUR – Edited by Admin – 2026-05-27 07:36:38" },
    { id: 226, site: "TAKKADPALLY-SIRUR" },
    { id: 229, site: "TAKKADPALLY-SIRUR – Edited by Engineer – 2026-06-01 14:47:27" },
    { id: 230, site: "TAKKADPALLY-SIRUR" },
    { id: 234, site: "TAKKADPALLY-SIRUR – Edited by Manager – 2026-06-07 07:00:21" },
    { id: 300, site: "FDR KK ROAD" },
  ];

  it("restricted manager sees the same Takkadpally set as an admin", () => {
    const adminView = allActiveDprs.filter(d => getBaseSiteName(d.site) === "TAKKADPALLY-SIRUR");
    const managerView = allActiveDprs.filter(d => siteMatchesPermitted(d.site, PERMITTED));
    expect(managerView.map(d => d.id)).toEqual(adminView.map(d => d.id));
    expect(managerView).toHaveLength(5); // includes all 3 edited reports
  });

  it("reports from non-permitted sites stay hidden", () => {
    const managerView = allActiveDprs.filter(d => siteMatchesPermitted(d.site, PERMITTED));
    expect(managerView.find(d => d.id === 300)).toBeUndefined();
  });
});
