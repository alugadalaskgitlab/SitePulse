/**
 * Instruction 028A — Carry Bituminous Arrangement Effects Through to Procurement.
 *
 * §17 route-path scenarios exercised through the REAL engine (calculateBomDemand)
 * plus the REAL serialisation stage (computeShortageRow with the same opts the
 * shortage-check route passes, including arrangementCompanyFraction forwarded
 * from engine outputs). §18 mapping warnings, §20 earthwork regression,
 * §21 ordinary-row regression.
 */
import { describe, it, expect } from "vitest";
import {
  calculateBomDemand,
  computeShortageRow,
  type ArrangementDemandInput,
  type BomInputItem,
  type ShortageMaterialDemand,
} from "../shared/planningEngine";
import { bituminousDefaultComponents } from "../shared/executionArrangementCategories";

// ─── Fixtures (mirror 028 test file) ─────────────────────────────────────────

function dbmItem(overrides: Partial<BomInputItem> = {}): BomInputItem {
  return {
    id: 11,
    itemCode: "5.4",
    itemName: null,
    description: "Providing and laying Dense Bituminous Macadam with VG-40 bitumen as per MoRTH 505",
    unit: "MT",
    currentQty: 10000,
    materials: [],
    derivedKeyMaterials: [
      { materialName: "Bitumen VG-40", uom: "MT", qtyPerBoqUnit: 0.045, isAuto: true },
      { materialName: "Coarse Aggregates 20mm", uom: "MT", qtyPerBoqUnit: 0.6, isAuto: true },
    ],
    equipment: [
      { equipmentName: "Sensor Paver", qtyPerBoqUnit: 0.008, count: 1, consumptionNorm: 15, fuelType: "Diesel" },
    ],
    labour: [{ designation: "Paving Crew", qtyPerBoqUnit: 0.02 }],
    ...overrides,
  } as BomInputItem;
}

function primeCoatItem(overrides: Partial<BomInputItem> = {}): BomInputItem {
  return {
    id: 21,
    itemCode: "5.1",
    itemName: null,
    description: "Providing and applying prime coat with SS-1 bitumen emulsion over prepared granular surface",
    unit: "SQM",
    currentQty: 20000,
    materials: [],
    derivedKeyMaterials: [
      { materialName: "Bitumen Emulsion SS-1", uom: "KG", qtyPerBoqUnit: 0.9, isAuto: true },
    ],
    equipment: [
      { equipmentName: "Bitumen Sprayer", qtyPerBoqUnit: 0.001, count: 1, consumptionNorm: 5, fuelType: "Diesel" },
    ],
    labour: [{ designation: "Spray Crew", qtyPerBoqUnit: 0.001 }],
    ...overrides,
  } as BomInputItem;
}

function bitArr(overrides: Partial<ArrangementDemandInput> = {}): ArrangementDemandInput {
  return {
    id: 300,
    status: "approved",
    allocatedQty: 10000,
    boqItemId: 11,
    workCategory: "bituminous",
    bituminousItemType: "dbm",
    components: bituminousDefaultComponents("complete_supply_and_lay", "dbm") as Record<string, string>,
    agencyName: "M/s BlackTop",
    ...overrides,
  };
}

function barsFor(items: BomInputItem[]) {
  return items.map((it, i) => ({
    id: 900 + i, boqItemId: it.id!, chainageFrom: null, chainageTo: null,
    startMonth: 1, endMonth: 6, plannedQty: Number(it.currentQty), isQtyOverride: false,
  }));
}
function demandOf(items: BomInputItem[], arrangements?: ArrangementDemandInput[]) {
  return calculateBomDemand(items, barsFor(items) as any, 12, { arrangements });
}
const mat = (d: ReturnType<typeof demandOf>, name: RegExp) => d.materials.find(m => name.test(m.materialName));

/** Serialise a demand material row exactly the way the shortage-check route does. */
function serialiseRow(row: any, opts: { stock?: number; incoming?: number } = {}) {
  const isBituminousArrangedRow = row.arrangementWorkCategory === "bituminous";
  const hlc = row.arrangementHlcQty as number | undefined;
  const arrangementCompanyFraction = isBituminousArrangedRow && hlc != null && row.totalQty > 0
    ? Math.max(0, Math.min(1, hlc / row.totalQty))
    : undefined;
  const shortage = computeShortageRow(
    row as ShortageMaterialDemand,
    opts.stock ?? 0, true, opts.incoming ?? 0, 1, 0,
    {
      horizonMonthIndex: 12,
      hlcRecordedStock: opts.stock ?? 0,
      confirmedIncomingPurchase: opts.incoming ?? 0,
      isEarthworkBulkRequirement: !!row.isEarthworkBulkRequirement,
      ...(arrangementCompanyFraction != null ? { arrangementCompanyFraction } : {}),
    },
  );
  return { shortage, arrangementCompanyFraction, isBituminousArrangedRow };
}

// ─── §17A — complete outsourcing removes company demand, keeps physical ──────

describe("§17A — complete DBM outsourcing through the serialisation path", () => {
  const d = demandOf([dbmItem()], [bitArr()]);
  const binder = mat(d, /Bitumen|VG-40/i)!;

  it("engine stamps category marker and full agency split", () => {
    expect((binder as any).arrangementWorkCategory).toBe("bituminous");
    expect((binder as any).arrangementOutsourcedQty).toBeCloseTo(binder.totalQty, 1);
    expect((binder as any).arrangementHlcQty).toBeCloseTo(0, 3);
  });

  it("serialised row: physical totalDemand kept, company actionable = 0", () => {
    const { shortage, arrangementCompanyFraction } = serialiseRow(binder);
    expect(arrangementCompanyFraction).toBeCloseTo(0, 4);
    expect(shortage.totalDemand).toBeCloseTo(binder.totalQty, 3); // physical stays visible
    expect(shortage.demandUpToSelectedDate).toBeCloseTo(0, 3);    // company share
    expect(shortage.actionableShortfall).toBeCloseTo(0, 3);
    expect(shortage.companyActionableQty).toBeCloseTo(0, 3);
    expect(shortage.arrangementCompanyFraction).toBeCloseTo(0, 3);
  });
});

// ─── §17B — company supplies binder: only aggregates excluded ────────────────

describe("§17B — company-supplies-binder DBM", () => {
  const comps = { ...bituminousDefaultComponents("complete_supply_and_lay", "dbm"), binder_bitumen: "hlc" } as Record<string, string>;
  const d = demandOf([dbmItem()], [bitArr({ components: comps })]);

  it("binder retained (company), aggregates excluded (agency)", () => {
    const binder = mat(d, /Bitumen|VG-40/i)!;
    const agg = mat(d, /Aggregate/i)!;
    const { shortage: sBinder, arrangementCompanyFraction: fBinder } = serialiseRow(binder);
    expect(fBinder).toBeUndefined(); // no split attached → fraction 1, PI qty full
    expect(sBinder.actionableShortfall).toBeCloseTo(binder.totalQty, 1);
    const { shortage: sAgg, arrangementCompanyFraction: fAgg } = serialiseRow(agg);
    expect(fAgg).toBeCloseTo(0, 3);
    expect(sAgg.actionableShortfall).toBeCloseTo(0, 3);
    expect(sAgg.totalDemand).toBeCloseTo(agg.totalQty, 3);
  });
});

// ─── §17D — prime coat: agency sprays, company supplies emulsion ─────────────

describe("§17D — prime coat with company-supplied emulsion", () => {
  const comps = {
    ...bituminousDefaultComponents("labour_equipment_only", "prime_coat"),
    binder_bitumen: "hlc",
  } as Record<string, string>;
  const d = demandOf(
    [primeCoatItem()],
    [bitArr({ id: 301, boqItemId: 21, allocatedQty: 20000, bituminousItemType: "prime_coat", components: comps })],
  );

  it("emulsion demand fully retained for company procurement", () => {
    const emulsion = mat(d, /Emulsion/i)!;
    const { shortage, arrangementCompanyFraction } = serialiseRow(emulsion);
    expect(arrangementCompanyFraction ?? 1).toBeGreaterThan(0.999);
    expect(shortage.actionableShortfall).toBeCloseTo(emulsion.totalQty, 1);
  });
});

// ─── §17E/F — draft has no effect; cancelled returns demand ──────────────────

describe("§17E/F — draft and cancelled arrangements", () => {
  it("draft arrangement changes nothing", () => {
    const d = demandOf([dbmItem()], [bitArr({ status: "draft" })]);
    const binder = mat(d, /Bitumen|VG-40/i)!;
    expect((binder as any).arrangementOutsourcedQty).toBeUndefined();
    const { shortage, arrangementCompanyFraction } = serialiseRow(binder);
    expect(arrangementCompanyFraction).toBeUndefined();
    expect(shortage.actionableShortfall).toBeCloseTo(binder.totalQty, 1);
  });

  it("cancelled arrangement returns full company demand", () => {
    const d = demandOf([dbmItem()], [bitArr({ status: "cancelled" })]);
    const binder = mat(d, /Bitumen|VG-40/i)!;
    expect((binder as any).arrangementWorkCategory).toBeUndefined();
    const { shortage } = serialiseRow(binder);
    expect(shortage.actionableShortfall).toBeCloseTo(binder.totalQty, 1);
  });
});

// ─── §7 — stock/incoming interact with COMPANY share, not physical ───────────

describe("§7 — partial outsourcing with stock coverage", () => {
  // 50% of the item outsourced via allocatedQty = half the item qty
  const d = demandOf([dbmItem()], [bitArr({ allocatedQty: 5000 })]);
  const binder = mat(d, /Bitumen|VG-40/i)!;

  it("actionable = company share − stock, never physical − stock", () => {
    const hlc = (binder as any).arrangementHlcQty as number;
    expect(hlc).toBeGreaterThan(0);
    expect(hlc).toBeLessThan(binder.totalQty);
    const stock = hlc / 2;
    const { shortage } = serialiseRow(binder, { stock });
    expect(shortage.actionableShortfall).toBeCloseTo(hlc - stock, 1);
    expect(shortage.totalDemand).toBeCloseTo(binder.totalQty, 3);
  });
});

// ─── §18 — mapping warnings surfaced, physical demand unchanged ──────────────

describe("§18 — mapping warnings", () => {
  it("agency component with no recipe resource yields warning, no demand change", () => {
    // Recipe with no aggregates at all, but arrangement assigns aggregates to agency
    const item = dbmItem({
      derivedKeyMaterials: [{ materialName: "Bitumen VG-40", uom: "MT", qtyPerBoqUnit: 0.045, isAuto: true }],
    });
    const base = demandOf([item]);
    const d = demandOf([item], [bitArr()]);
    const warn = d.mappingWarnings.find(w => w.boqItemId === 11 && /aggregate/i.test(w.componentKey + w.componentLabel));
    expect(warn).toBeTruthy();
    // Physical binder qty unchanged vs base
    expect(mat(d, /Bitumen/i)!.totalQty).toBeCloseTo(mat(base, /Bitumen/i)!.totalQty, 3);
  });
});

// ─── §20 — earthwork regression: no fraction passed, behaviour unchanged ─────

describe("§20 — earthwork rows untouched by 028A scaling", () => {
  it("earthwork-style row without arrangementCompanyFraction keeps v2 behaviour", () => {
    const row: ShortageMaterialDemand = {
      materialName: "Earth / Borrow Soil", uom: "CUM", totalQty: 1000,
      monthlyQty: { 1: 400, 2: 600 }, breakdown: [], materialId: null, sourceBoqItemId: null,
    } as any;
    const s = computeShortageRow(row, 0, false, 0, 1, 0, {
      horizonMonthIndex: 12, isEarthworkBulkRequirement: true,
    });
    expect(s.demandUpToSelectedDate).toBeCloseTo(1000, 3);
    expect(s.companyActionableQty).toBeUndefined();
    expect(s.arrangementCompanyFraction).toBeUndefined();
  });
});

// ─── §21 — ordinary rows (no arrangements): serialisation identical ──────────

describe("§21 — ordinary row regression", () => {
  it("rows without arrangements carry no 028A fields and full demand", () => {
    const d = demandOf([dbmItem()]);
    const binder = mat(d, /Bitumen/i)!;
    expect((binder as any).arrangementWorkCategory).toBeUndefined();
    const { shortage, isBituminousArrangedRow } = serialiseRow(binder);
    expect(isBituminousArrangedRow).toBe(false);
    expect(shortage.actionableShortfall).toBeCloseTo(binder.totalQty, 1);
    expect(shortage.companyActionableQty).toBeUndefined();
  });
});
