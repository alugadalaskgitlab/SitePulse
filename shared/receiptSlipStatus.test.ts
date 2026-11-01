import { describe, expect, it } from "vitest";
import { receiptSlipSendWindow } from "./receiptSlipStatus";

describe("receipt slip send window", () => {
  it("hides records created before the rollout cutoff", () => {
    expect(receiptSlipSendWindow("2026-10-29T18:29:59.000Z", null, new Date("2026-11-01T00:00:00.000Z")))
      .toEqual({ slipSendTrackingEnabled: false, slipSendWindowOpen: false });
  });

  it("opens for 36 hours after save and closes after expiry", () => {
    const createdAt = "2026-10-30T00:00:00.000Z";
    expect(receiptSlipSendWindow(createdAt, null, new Date("2026-10-31T11:59:59.000Z")).slipSendWindowOpen).toBe(true);
    expect(receiptSlipSendWindow(createdAt, null, new Date("2026-10-31T12:00:01.000Z")).slipSendWindowOpen).toBe(false);
  });

  it("restarts the window after a later edit", () => {
    const status = receiptSlipSendWindow(
      "2026-10-29T18:00:00.000Z",
      "2026-10-30T10:00:00.000Z",
      new Date("2026-10-31T09:00:00.000Z"),
    );
    expect(status).toEqual({ slipSendTrackingEnabled: true, slipSendWindowOpen: true });
  });
});
