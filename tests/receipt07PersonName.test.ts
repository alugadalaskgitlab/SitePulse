import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatPersonName } from "../shared/personName";

const plantPage = readFileSync(new URL("../client/src/pages/PlantMaterialReceipts.tsx", import.meta.url), "utf8");
const sitePage = readFileSync(new URL("../client/src/pages/SiteMaterialTrips.tsx", import.meta.url), "utf8");
const storage = readFileSync(new URL("../server/storage.ts", import.meta.url), "utf8");

describe("RECEIPT-07 person-name flow", () => {
  it.each([
    ["praveen", "Praveen"],
    ["RAMESH SINGH", "Ramesh Singh"],
    ["k. v. babu", "K. V. Babu"],
    ["k.v. babu", "K.V. Babu"],
    ["K.V. BABU", "K.V. Babu"],
    ["McDonald", "McDonald"],
    ["   ", ""],
    [null, ""],
    ["  john   DOE  ", "john DOE"],
  ])("formats %j as %j", (input, expected) => {
    expect(formatPersonName(input)).toBe(expected);
  });

  it("prefills the plant form, keeps the field editable, and preserves saved blank values on edit", () => {
    expect(plantPage).toContain('useState(user?.fullName || "")');
    expect(plantPage).toContain('value={receivedByName}');
    expect(plantPage).toContain("setReceivedByName(e.target.value)");
    expect(plantPage).toContain("setReceivedByName(formatPersonName(receipt.receivedByName))");
    expect(plantPage).toContain("receivedByName: formatPersonName(receivedByName) || null");
    expect(plantPage).toContain("receivedByName: receipt.receivedByName");
    expect(plantPage).toContain('data-testid="input-received-by-name"');
  });

  it("uses the existing site-trip field without uppercasing and shows it as Received by", () => {
    expect(sitePage).toContain('enteredBy: user?.fullName || ""');
    expect(sitePage).toContain('<Label className="text-sm">Received by</Label>');
    expect(sitePage).toContain("enteredBy: e.target.value");
    expect(sitePage).not.toContain("enteredBy: e.target.value.toUpperCase()");
    expect(sitePage).toContain("receivedByName: trip.enteredBy");
    expect(sitePage).toContain('Received by: {formatPersonName(trip.enteredBy)}');
    expect(sitePage).toContain("formatEnteredByDisplay((trip as any).enteredByUserName");
  });

  it("normalizes person names on create and only when supplied on edit", () => {
    expect(storage).toContain("driverName: formatPersonName(receipt.driverName) || null");
    expect(storage).toContain("receivedByName: formatPersonName(receipt.receivedByName) || null");
    expect(storage).toContain("if (receipt.driverName !== undefined) updates.driverName = formatPersonName(receipt.driverName) || null");
    expect(storage).toContain("if (receipt.receivedByName !== undefined) updates.receivedByName = formatPersonName(receipt.receivedByName) || null");
    expect(storage).toContain("driverName: formatPersonName(data.driverName) || null");
    expect(storage).toContain("enteredBy: formatPersonName(data.enteredBy) || null");
  });
});
