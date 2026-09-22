import { beforeEach, describe, expect, it, vi } from "vitest";

const fx = vi.hoisted(() => ({
  bill: undefined as any,
  txRows: [] as any[][],
  writes: [] as any[],
}));

function query(rows: any[] = [], apply?: (value: any) => void) {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    for: () => chain,
    set: (value: any) => {
      fx.writes.push(value);
      apply?.(value);
      return query();
    },
    then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
  };
  return chain;
}

const tx = {
  select: vi.fn(() => query(fx.txRows.shift() ?? [])),
  update: vi.fn(() => query([], (value) => Object.assign(fx.bill, value))),
};

const database = {
  select: vi.fn(() => query([{
    key: "vendor_bill_company_accounts",
    value: JSON.stringify([{ id: "hdfc-current", name: "HDFC Current", type: "bank" }]),
  }])),
  transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
    callback(tx)),
  query: {
    vendorBills: {
      findFirst: vi.fn(async () => fx.bill),
    },
  },
};

vi.mock("../server/db", () => ({ db: database }));

let DatabaseStorage: typeof import("../server/storage").DatabaseStorage;

beforeEach(async () => {
  ({ DatabaseStorage } = await import("../server/storage"));
  fx.bill = undefined;
  fx.txRows = [];
  fx.writes = [];
  vi.clearAllMocks();
});

function bill(overrides: Record<string, unknown> = {}) {
  fx.bill = {
    id: 231,
    billType: "all",
    status: "approved",
    totalAmount: 12_000,
    netPayableAmount: 10_000,
    amountPaid: 0,
    additionalAdjustments: [],
    items: [],
    hireStatements: [],
    ...overrides,
  };
  return fx.bill;
}

function queuePaymentSaveAndPaidTransition() {
  fx.txRows.push([fx.bill], [fx.bill], []);
}

describe("VB-23B vendor bill payment save", () => {
  it("persists every combined-bill payment field before the real paid transition", async () => {
    bill();
    queuePaymentSaveAndPaidTransition();
    const storage = new DatabaseStorage();

    const saved = await storage.updateVendorBillPaymentDetails(231, {
      paymentMode: "bank_transfer",
      paidBy: "company",
      paymentAccountKey: "hdfc-current",
      amountPaid: 10_000,
    });
    const paid = await storage.updateVendorBillStatus(231, "paid", "accounts user");

    expect(saved).toMatchObject({
      paymentMode: "bank_transfer",
      paidBy: "company",
      paymentAccountKey: "hdfc-current",
      amountPaid: 10_000,
    });
    expect(fx.writes[0]).toEqual({
      paymentMode: "bank_transfer",
      paidBy: "company",
      amountPaid: 10_000,
      paymentAccountKey: "hdfc-current",
    });
    expect(paid).toMatchObject({ id: 231, status: "paid", amountPaid: 10_000 });
    expect(fx.writes[1]).toMatchObject({
      status: "paid",
      amountPaid: 10_000,
      paymentRecordedBy: "ACCOUNTS USER",
    });
  });

  it.each([
    ["a negative amount", { amountPaid: -1 }, {}, "BAD_REQUEST"],
    ["an amount above the frozen ceiling", { amountPaid: 10_000.01 }, {}, "BAD_REQUEST"],
    ["a null amount on a frozen bill", { amountPaid: null }, {}, "BAD_REQUEST"],
    ["an amount while draft", { amountPaid: 1 }, { status: "draft" }, "CONFLICT"],
    ["an amount while verified", { amountPaid: 1 }, { status: "verified" }, "CONFLICT"],
    ["a changed amount after payment", { amountPaid: 9_999 }, {
      status: "paid",
      amountPaid: 10_000,
    }, "CONFLICT"],
  ])("rejects %s without writing", async (_label, details, overrides, code) => {
    bill(overrides);
    fx.txRows.push([fx.bill]);

    await expect(
      new DatabaseStorage().updateVendorBillPaymentDetails(231, details),
    ).rejects.toMatchObject({ code });
    expect(fx.writes).toEqual([]);
  });

  it("retains the existing cumulative-payment behavior for equipment bills", async () => {
    bill({ billType: "equipment" });
    queuePaymentSaveAndPaidTransition();
    const storage = new DatabaseStorage();

    await storage.updateVendorBillPaymentDetails(231, { amountPaid: 10_000 });
    const paid = await storage.updateVendorBillStatus(231, "paid", "accounts user");

    expect(fx.writes[0]).toEqual({ amountPaid: 10_000 });
    expect(paid).toMatchObject({ status: "paid", amountPaid: 10_000 });
  });

  it.each(["material", "transport", "labour"])(
    "rejects cumulative payment amounts for %s bills",
    async (billType) => {
      bill({ billType });
      fx.txRows.push([fx.bill]);

      await expect(
        new DatabaseStorage().updateVendorBillPaymentDetails(231, { amountPaid: 1 }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Cumulative payment amounts are available only on equipment or combined bills.",
      });
      expect(fx.writes).toEqual([]);
    },
  );
});