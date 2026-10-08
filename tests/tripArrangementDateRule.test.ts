import { describe, expect, it } from "vitest";
import { canLinkTripArrangement, hasValidTripLinkPeriod, tripArrangementLinkError } from "../shared/tripArrangementLink";
import { APPLICABLE_ARRANGEMENT_STATUSES } from "../shared/materialReceiptSummary";

const cancelled = {
  status: "cancelled",
  revisionHistory: [
    {eventType:"status_change",previousStatus:"draft",status:"approved",effectiveFrom:"2026-06-01"},
    {eventType:"status_change",previousStatus:"approved",status:"cancelled",effectiveFrom:"2026-09-01"},
  ],
};
describe("shared new trip arrangement date rule",()=>{
  it.each(APPLICABLE_ARRANGEMENT_STATUSES)("uses existing receipt status %s",status=>{
    expect(canLinkTripArrangement({status},"2026-07-01")).toBe(true);
  });
  it.each(["draft","submitted","rejected","cancelled","superseded","on_hold","completed"])("rejects new links in %s without historical evidence",status=>{
    expect(canLinkTripArrangement({status},"2026-07-01")).toBe(false);
    expect(hasValidTripLinkPeriod({status})).toBe(false);
  });
  it("uses effective trip dates, including both transition boundaries",()=>{
    expect(canLinkTripArrangement(cancelled,"2026-05-31")).toBe(false);
    expect(canLinkTripArrangement(cancelled,"2026-06-01")).toBe(true);
    expect(canLinkTripArrangement(cancelled,"2026-08-31")).toBe(true);
    expect(canLinkTripArrangement(cancelled,"2026-09-01")).toBe(false);
    expect(hasValidTripLinkPeriod(cancelled)).toBe(true);
    expect(tripArrangementLinkError(cancelled,"2026-10-01")).toContain("cancelled");
  });
  it("does not guess an absent or invalid trip date",()=>{
    expect(canLinkTripArrangement({status:"approved"},null)).toBe(false);
    expect(canLinkTripArrangement({status:"approved"},"2026-02-30")).toBe(false);
  });
});
