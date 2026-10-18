import { describe, expect, it } from "vitest";
import {
  buildHireSiteSuggestion,
  getVendorBillAttentionKinds,
  isAlpsLikeFreeTextPayer,
  summarizeVendorBillAttention,
} from "../shared/vendorBillAttention";

describe("vendor bill attention list rules", () => {
  it("marks each unanswered field and keeps confirmed ALL SITES complete", () => {
    expect(getVendorBillAttentionKinds({
      siteId: null,
      siteScopeConfirmed: null,
      status: "paid",
      amountPaid: null,
      paidBy: "ALPS INFRA WORKS",
      periodFrom: null,
      periodTo: null,
      billDate: "2026-10-01",
    }, -1)).toEqual(["site", "paid_amount", "period", "negative_net", "payer_text_needs_confirming"]);

    expect(getVendorBillAttentionKinds({
      siteId: null,
      siteScopeConfirmed: true,
      status: "approved",
      amountPaid: null,
      periodFrom: "2026-09-01",
      periodTo: "2026-09-30",
      billDate: "2026-09-29",
    }, 10)).toEqual(["bill_date_before_period_end"]);
  });

  it("does not treat an explicit zero as a missing paid amount", () => {
    expect(getVendorBillAttentionKinds({
      siteId: 3,
      siteScopeConfirmed: true,
      status: "paid",
      amountPaid: 0,
      periodFrom: "2026-09-01",
      periodTo: "2026-09-30",
      billDate: "2026-09-30",
    }, 0)).toEqual([]);
  });

  it("summarizes each gap kind while counting each bill once", () => {
    expect(summarizeVendorBillAttention([
      { kinds: ["site", "negative_net"] },
      { kinds: ["site", "paid_amount"] },
    ])).toEqual({
      bills: 2,
      counts: {
        site: 2,
        paid_amount: 1,
        period: 0,
        bill_date_before_period_end: 0,
        negative_net: 1,
        payer_text_needs_confirming: 0,
      },
    });
  });

  it("flags ALPS-containing free text but not structured payer values or personal names", () => {
    expect(isAlpsLikeFreeTextPayer("  Alps Infra Works  ")).toBe(true);
    for (const value of [null, undefined, "", "  ", "company", "ALPS", "PERSONAL", "SURESH"]) {
      expect(isAlpsLikeFreeTextPayer(value)).toBe(false);
    }

    const completeBill = {
      siteId: 1,
      siteScopeConfirmed: true,
      status: "approved",
      amountPaid: 0,
      periodFrom: "2026-09-01",
      periodTo: "2026-09-30",
      billDate: "2026-09-30",
    };
    expect(getVendorBillAttentionKinds({ ...completeBill, paidBy: "SURESH" }, 0)).toEqual([]);
    expect(getVendorBillAttentionKinds({ ...completeBill, paidBy: "ALPS INFRA" }, 0))
      .toEqual(["payer_text_needs_confirming"]);
  });

  it("suggests a hire site only when all statement activity identifies the same single site", () => {
    const bill = {
      hireStatements: [{ equipmentId: 12, periodFrom: "2026-10-01", periodTo: "2026-10-04" }],
    };
    const sites = [{ id: 5, name: "Takkadpally-Sirur" }];
    const onlyOneSite = buildHireSiteSuggestion(bill, [
      { equipmentId: 12, equipmentName: "JCB-02", date: "2026-09-30", siteName: "Other Site" },
      { equipmentId: 12, equipmentName: "JCB-02", date: "2026-10-01", siteName: "SITE*: Takkadpally-Sirur" },
      { equipmentId: 12, equipmentName: "JCB-02", date: "2026-10-04", siteName: "Takkadpally-Sirur" },
    ], sites);
    expect(onlyOneSite).toEqual({
      siteId: 5,
      siteName: "Takkadpally-Sirur",
      evidence: ["JCB-02 worked only at Takkadpally-Sirur between 2026-10-01 and 2026-10-04"],
    });

    expect(buildHireSiteSuggestion(bill, [
      { equipmentId: 12, equipmentName: "JCB-02", date: "2026-10-01", siteName: "Site A" },
      { equipmentId: 12, equipmentName: "JCB-02", date: "2026-10-02", siteName: "Site B" },
    ], [{ id: 1, name: "Site A" }, { id: 2, name: "Site B" }])).toBeNull();
    expect(buildHireSiteSuggestion(bill, [], sites)).toBeNull();
    expect(buildHireSiteSuggestion({ hireStatements: [] }, [
      { equipmentId: 12, equipmentName: "JCB-02", date: "2026-10-01", siteName: "Site A" },
    ], sites)).toBeNull();
  });

  it("does not guess when different statements indicate different sites", () => {
    const suggestion = buildHireSiteSuggestion({
      hireStatements: [
        { equipmentId: 12, periodFrom: "2026-10-01", periodTo: "2026-10-02" },
        { equipmentId: 14, periodFrom: "2026-10-01", periodTo: "2026-10-02" },
      ],
    }, [
      { equipmentId: 12, equipmentName: "JCB-02", date: "2026-10-01", siteName: "Site A" },
      { equipmentId: 14, equipmentName: "Roller-01", date: "2026-10-01", siteName: "Site B" },
    ], [{ id: 1, name: "Site A" }, { id: 2, name: "Site B" }]);
    expect(suggestion).toBeNull();
  });
});
