import { describe, expect, it } from "vitest";
import {
  oldestPendingFirst, pendingAge, pendingDieselHref, pendingIndentHref, pendingIrnHref,
} from "../client/src/lib/homePendingActions";

describe("HOME-01 pending actions", () => {
  const now = new Date("2026-09-26T10:00:00Z");

  it("sorts each category oldest first by creation timestamp without mutating query data", () => {
    const items = [
      { id: 3, createdAt: "2026-09-25T10:00:00Z", date: "2026-09-20" },
      { id: 2, createdAt: "2026-09-21T10:00:00Z", date: "2026-09-25" },
      { id: 4, createdAt: null, date: "2026-09-24" },
      { id: 1, createdAt: null, date: null },
    ];
    expect(oldestPendingFirst(items).map((item) => item.id)).toEqual([2, 4, 3, 1]);
    expect(items.map((item) => item.id)).toEqual([3, 2, 4, 1]);
  });

  it("shows meaningful days/hours and labels unknown age honestly", () => {
    expect(pendingAge({ createdAt: "2026-09-21T10:00:00Z" }, now)).toBe("Pending 5 days");
    expect(pendingAge({ createdAt: "2026-09-26T08:00:00Z" }, now)).toBe("Pending 2 hours");
    expect(pendingAge({ createdAt: "2026-09-26T09:45:00Z" }, now)).toBe("Pending less than an hour");
    expect(pendingAge({}, now)).toBe("Age unavailable");
  });

  it("builds record-specific links to existing detail destinations", () => {
    expect(pendingDieselHref(61)).toBe("/plant/diesel-requirements?returnTo=/&dieselReqId=61");
    expect(pendingIndentHref(71)).toBe("/plant/purchase-indents?returnTo=/&indentId=71");
    expect(pendingIrnHref(81)).toBe("/irn/81?returnTo=/");
  });
});