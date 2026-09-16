import { describe, expect, it } from "vitest";
import { dprSaveErrorMetadata } from "../server/dprSaveError";

describe("safe DPR save diagnostics", () => {
  it("extracts SQLSTATE from a wrapped database error without SQL or values", () => {
    const error = Object.assign(new Error("SQL with private bound parameters"), {
      query: "private SQL",
      params: ["private payload"],
      cause: Object.assign(new Error("private database detail"), {
        code: "42703", column: "boq_item_id", table: "site_purchases",
        detail: "private data", stack: "private stack",
      }),
    });
    expect(dprSaveErrorMetadata(error)).toEqual({
      errorType: "Error", sqlState: "42703", column: "boq_item_id", table: "site_purchases",
    });
    expect(JSON.stringify(dprSaveErrorMetadata(error))).not.toContain("private");
  });

  it("bounds cyclic causes and excludes arbitrary diagnostic strings", () => {
    const error: any = { code: "private credential string", column: "invalid identifier with payload" };
    error.cause = error;
    expect(dprSaveErrorMetadata(error)).toEqual({ errorType: "Error" });
    expect(dprSaveErrorMetadata(new TypeError("private message"))).toEqual({ errorType: "TypeError" });
    expect(dprSaveErrorMetadata(null)).toEqual({ errorType: "Error" });
  });
});