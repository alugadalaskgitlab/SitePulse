import { describe, expect, it } from "vitest";
import { formatEnteredByDisplay } from "./materialReceiptSlipTypes";

describe("receipt entered-by display", () => {
  it("shows the user's display name and creation timestamp", () => {
    expect(formatEnteredByDisplay("Test User", "2026-11-01T03:00:00.000Z"))
      .toMatch(/^Entered by Test User · .+2026/);
  });

  it("shows a dash when legacy rows have no creator metadata", () => {
    expect(formatEnteredByDisplay(null, null)).toBe("—");
  });
});
