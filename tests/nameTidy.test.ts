import { describe, expect, it } from "vitest";
import { suggestTidyName } from "../shared/nameTidy";

describe("name tidy suggestions", () => {
  it("uses sentence case while keeping standard abbreviations", () => {
    expect(suggestTidyName("EARTHEN SHOULDERS WITH WMM AND M15", "sentence"))
      .toBe("Earthen shoulders with WMM and M15");
    expect(suggestTidyName("TACK COAT 1", "sentence")).toBe("Tack coat 1");
  });

  it("uses title case for people and sites and removes edited suffixes", () => {
    expect(suggestTidyName("GANGARAM NARSIMULU", "title")).toBe("Gangaram Narsimulu");
    expect(suggestTidyName("ALLADURG PWD ROAD TO PAMPAD Edited by Sunil", "site"))
      .toBe("Alladurg PWD Road to Pampad");
    expect(suggestTidyName("KM STONE", "site")).toBe("Kilometre stone");
    expect(suggestTidyName("20MM / 10/12MM / JCB-PLANT", "sentence")).toBe("20mm / 10/12mm / JCB-plant");
    expect(suggestTidyName("TAKKADPALLY–SIRUR", "site")).toBe("Takkadpally–Sirur");
  });
});
