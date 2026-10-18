import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  selectedRows: [] as any[][],
  writes: [] as any[],
  returnedBill: undefined as any,
  paymentAccounts: [] as any[],
}));

function query(rows: any[] = []) {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    for: () => chain,
    set: (value: any) => {
      fixtures.writes.push(value);
      return query();
    },
    returning: () => Promise.resolve(fixtures.returnedBill ? [fixtures.returnedBill] : []),
    then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
  };
  return chain;
}

const transaction = {
  select: vi.fn(() => query(fixtures.selectedRows.shift() ?? [])),
  update: vi.fn(() => query()),
};

const database = {
  select: vi.fn(() => query([{ value: JSON.stringify(fixtures.paymentAccounts) }])),
  transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
    callback(transaction)),
  query: {
    vendorBills: {
      findFirst: vi.fn(async () => fixtures.returnedBill),
    },
  },
};

vi.mock("../server/db", () => ({ db: database }));

let DatabaseStorage: typeof import("../server/storage").DatabaseStorage;

beforeEach(async () => {
  ({ DatabaseStorage } = await import("../server/storage"));
  fixtures.selectedRows = [];
  fixtures.writes = [];
  fixtures.returnedBill = undefined;
  fixtures.paymentAccounts = [
    { id: "hdfc_ca", name: "HDFC - CA", type: "CA", source: "own" },
    { id: "alps_infra_works", name: "ALPS Infra - Union Bank (works)", type: "CC", source: "third_party" },
  ];
  vi.clearAllMocks();
});

function approvedBill(billType: string, amountPaid: number | null, overrides: Record<string, unknown> = {}) {
  return {
    id: 23,
    billType,
    status: "approved",
    totalAmount: 12_000,
    netPayableAmount: 10_000,
    amountPaid,
    additionalAdjustments: [],
    ...overrides,
  };
}

describe("VB-PAID-01 funding-source storage guard", () => {
  const savePayer = (existing: any, details: any) => {
    fixtures.selectedRows.push([existing]);
    fixtures.returnedBill = { ...existing, ...details, items: [] };
    return new DatabaseStorage().updateVendorBillPaymentDetails(existing.id, details);
  };

  it("rejects an ALPS payment paired with an HLC-owned account", async () => {
    const existing = approvedBill("material", null, { paidBy: "alps", paymentAccountKey: null });
    await expect(savePayer(existing, {
      paidBy: "alps",
      paymentAccountKey: "hdfc_ca",
    })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "The selected bank/account is not configured for ALPS-funded payments.",
    });
    expect(fixtures.writes).toEqual([]);
  });

  it("accepts an ALPS payment paired with the third-party ALPS account", async () => {
    const existing = approvedBill("material", null, { paidBy: null, paymentAccountKey: null });
    await savePayer(existing, {
      paidBy: "alps",
      paymentAccountKey: "alps_infra_works",
    });
    expect(fixtures.writes).toEqual([{
      paidBy: "alps",
      paymentAccountKey: "alps_infra_works",
    }]);
  });

  it("confirms a flagged payer by updating only payer and account, preserving financial facts", async () => {
    const frozenSnapshot = { netPayableAmount: 900, calculatedAt: "2026-10-01T12:00:00.000Z" };
    const existing = approvedBill("all", 40, {
      status: "paid",
      paidBy: " ALPS INFRA WORKS ",
      paymentAccountKey: null,
      totalAmount: 1_000,
      netPayableAmount: 900,
      hireStatements: [{ id: 10, calculationSnapshot: frozenSnapshot }],
    });
    const expectedAfter = {
      ...existing,
      paidBy: "alps",
      paymentAccountKey: "alps_infra_works",
    };
    fixtures.selectedRows.push([existing]);
    fixtures.returnedBill = expectedAfter;

    const result = await new DatabaseStorage().confirmVendorBillAlpsPayer(23, "alps_infra_works");

    expect(result?.before.paidBy).toBe(" ALPS INFRA WORKS ");
    expect(result?.after).toMatchObject({
      paidBy: "alps",
      paymentAccountKey: "alps_infra_works",
      status: "paid",
      amountPaid: 40,
      totalAmount: 1_000,
      netPayableAmount: 900,
      hireStatements: [{ calculationSnapshot: frozenSnapshot }],
    });
    expect(fixtures.writes).toEqual([{
      paidBy: "alps",
      paymentAccountKey: "alps_infra_works",
    }]);
    expect(result?.after.hireStatements).toEqual(result?.before.hireStatements);
  });

  it("rejects stale or structured payer values before any write", async () => {
    const existing = approvedBill("material", null, { paidBy: "company" });
    fixtures.selectedRows.push([existing]);

    await expect(new DatabaseStorage().confirmVendorBillAlpsPayer(23, "alps_infra_works"))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(fixtures.writes).toEqual([]);
  });

  it("requires the selected account to be configured as third-party", async () => {
    const existing = approvedBill("material", null, { paidBy: "ALPS INFRA" });
    fixtures.selectedRows.push([existing]);

    await expect(new DatabaseStorage().confirmVendorBillAlpsPayer(23, "hdfc_ca"))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fixtures.writes).toEqual([]);
  });
});

async function markPaid(existing: ReturnType<typeof approvedBill>, paidAmount = Number(existing.amountPaid)) {
  fixtures.selectedRows.push([existing], []); // locked bill, then linked hire statements
  fixtures.returnedBill = { ...existing, status: "paid" };
  return new DatabaseStorage().updateVendorBillStatus(existing.id, "paid", "accounts user", paidAmount);
}

describe("VB-23 vendor bill paid-transition storage guard", () => {
  it.each(["ALL", "EQUIPMENT"])(
    "blocks a partially recorded %s bill before any status write",
    async (billType) => {
      const transition = markPaid(approvedBill(billType, 9_999.99));

      await expect(transition).rejects.toMatchObject({
        code: "CONFLICT",
        message: "Record the remaining equipment hire balance before marking this bill paid.",
      });
      expect(fixtures.writes).toEqual([]);
    },
  );

  it.each(["all", "equipment"])(
    "allows a fully recorded %s bill and executes the real paid transition",
    async (billType) => {
      const result = await markPaid(approvedBill(billType, 10_000));

      expect(result).toMatchObject({ id: 23, status: "paid" });
      expect(fixtures.writes).toHaveLength(1);
      expect(fixtures.writes[0]).toMatchObject({
        status: "paid",
        amountPaid: 10_000,
        paymentRecordedBy: "ACCOUNTS USER",
        paidAt: expect.any(String),
      });
    },
  );

  it.each(["ALL", "EQUIPMENT"])(
    "preserves legacy %s handling when no frozen net payable or paid amount exists",
    async (billType) => {
      await markPaid(approvedBill(billType, null, { netPayableAmount: null }), 12_000);

      expect(fixtures.writes[0]).toMatchObject({
        status: "paid",
        amountPaid: 12_000,
      });
    },
  );

  it("does not apply the equipment payment guard to a material bill", async () => {
    await markPaid(approvedBill("MATERIAL", 1));

    expect(fixtures.writes).toHaveLength(1);
    expect(fixtures.writes[0]).toMatchObject({
      status: "paid",
      amountPaid: 1,
      paymentRecordedBy: "ACCOUNTS USER",
    });
  });

  it("keeps missing-amount corrections read-only for negative-net paid bills", async () => {
    const { DatabaseStorage } = await import("../server/storage");
    fixtures.selectedRows.push([
      approvedBill("ALL", null, { status: "paid", netPayableAmount: -200 }),
    ], []);

    await expect(new DatabaseStorage().recordMissingVendorBillPaidAmount(23, 0)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Negative-net bills are review-only on this page.",
    });
    expect(fixtures.writes).toEqual([]);
  });
});