import { describe, expect, it } from "vitest";
import {
  canApplySnlSource,
  buildSnlSearchUrl,
  getSnlSearchItemTitle,
  getSnlSourceDisplayName,
  groupSnlSearchResults,
  MORTH_SDB_DISPLAY_NAME,
  MORTH_SDB_SOURCE_CODE,
} from "../shared/normBook";

describe("manual norms search across books", () => {
  it("uses one all-books request without pinning a sourceId", () => {
    const url = new URL(buildSnlSearchUrl("wet mix macadam", {
      includeOtherBooks: true,
      category: "GRANULAR",
      boqDesc: "WMM clause 406",
    }), "https://app.test");

    expect(url.pathname).toBe("/api/snl/search");
    expect(url.searchParams.get("q")).toBe("wet mix macadam");
    expect(url.searchParams.get("includeOtherBooks")).toBe("true");
    expect(url.searchParams.get("category")).toBe("GRANULAR");
    expect(url.searchParams.get("boqDesc")).toBe("WMM clause 406");
    expect(url.searchParams.has("sourceId")).toBe(false);
  });

  it("keeps MoRTH first, then sorts other books by name and item code", () => {
    const grouped = groupSnlSearchResults([
      { id: 1, sourceCode: "SDB_ROAD", sourceName: "AP SDB Road Works", itemCode: "9.2-B" },
      { id: 2, sourceCode: MORTH_SDB_SOURCE_CODE, sourceName: "old label", itemCode: "4.12" },
      { id: 3, sourceCode: "SDB_MISC", sourceName: "Building SDB", itemCode: "1.4" },
      { id: 4, sourceCode: MORTH_SDB_SOURCE_CODE, sourceName: "old label", itemCode: "2.3" },
    ]);

    expect(grouped.morth.map(item => item.itemCode)).toEqual(["2.3", "4.12"]);
    expect(grouped.otherBooks.map(item => item.sourceName)).toEqual(["AP SDB Road Works", "Building SDB"]);
  });

  it("uses full MoRTH titles and full descriptions for other books", () => {
    expect(getSnlSearchItemTitle({
      sourceCode: MORTH_SDB_SOURCE_CODE,
      sourceName: "MoRTH",
      itemCode: "2.3-i-A",
      shortLabel: "Full nested clearing title",
      description: "Shorter resource description",
    })).toBe("Full nested clearing title");
    expect(getSnlSearchItemTitle({
      sourceCode: "SDB_ROAD",
      sourceName: "AP SDB Road Works",
      itemCode: "9.2-A",
      shortLabel: "truncated 60-character label",
      description: "Complete title from the other book",
    })).toBe("Complete title from the other book");
    expect(getSnlSearchItemTitle({
      sourceCode: MORTH_SDB_SOURCE_CODE,
      sourceName: "MoRTH",
      itemCode: "legacy",
      shortLabel: "x".repeat(80),
      description: "Full legacy description",
    })).toBe("Full legacy description");
    expect(getSnlSourceDisplayName(MORTH_SDB_SOURCE_CODE, "old stored name")).toBe(MORTH_SDB_DISPLAY_NAME);
  });

  it("allows other books only on explicit manual application", () => {
    expect(canApplySnlSource({
      itemSourceCode: "SDB_ROAD",
      selectedBookCode: MORTH_SDB_SOURCE_CODE,
      sourceIsActive: true,
      allowOtherBooks: false,
    })).toBe(false);
    expect(canApplySnlSource({
      itemSourceCode: "SDB_ROAD",
      selectedBookCode: MORTH_SDB_SOURCE_CODE,
      sourceIsActive: true,
      allowOtherBooks: true,
    })).toBe(true);
    expect(canApplySnlSource({
      itemSourceCode: "SDB_ROAD",
      selectedBookCode: MORTH_SDB_SOURCE_CODE,
      sourceIsActive: false,
      allowOtherBooks: true,
    })).toBe(false);
  });
});
