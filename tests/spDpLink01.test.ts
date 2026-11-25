import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => {
  const state: {
    selections: any[];
    inserts: any[];
    updates: any[];
  } = { selections: [], inserts: [], updates: [] };
  const db: any = {
    select: vi.fn(() => {
      const query: any = {};
      query.from = () => query;
      query.innerJoin = () => query;
      query.leftJoin = () => query;
      query.where = () => query;
      query.orderBy = () => query;
      query.for = () => query;
      query.limit = async () => state.selections.shift() ?? [];
      return query;
    }),
    insert: vi.fn(() => ({
      values: async (values: any) => { state.inserts.push(values); return []; },
    })),
    update: vi.fn(() => ({
      set: (values: any) => {
        state.updates.push(values);
        return { where: async () => [] };
      },
    })),
    transaction: vi.fn(async (callback: (tx: any) => Promise<any>) => callback(db)),
  };
  return { db, state };
});

vi.mock("../server/db", () => ({
  db: mockDb.db,
  pool: { connect: vi.fn() },
}));

import {
  buildSupplyOrderDispatchProPayload,
  enqueueDispatchProChange,
  enqueueSupplyOrderDispatchPro,
  resolveSupplyOrderDispatchProLink,
  sendDispatchProOutboxRow,
} from "../server/dispatchProOutbox";

const order = (overrides: Record<string, unknown> = {}) => ({
  id: 91,
  partyId: 7,
  partyName: "North party",
  siteId: 18,
  siteName: "Test road",
  orderNo: "PO-91",
  periodFrom: "2026-11-01",
  periodTo: "2026-11-30",
  status: "open",
  lines: [{
    mixTemplateId: 4,
    mixName: "BC",
    enteredQuantity: 100,
    enteredUnit: "MT",
    orderedMt: 100,
    plannedMtPerDay: 10,
    orderMix: { mixName: "BC order", bitumenPercent: 5, components: [{ materialId: 12, materialName: "20MM", aggregateSharePercent: 100 }] },
  }],
  ...overrides,
});

describe("SP-DP-LINK-01 supply order DispatchPro outbox", () => {
  const originalSecret = process.env.SITEPULSE_SHARED_SECRET;
  const originalBaseUrl = process.env.DISPATCHPRO_BASE_URL;

  beforeEach(() => {
    mockDb.state.selections.length = 0;
    mockDb.state.inserts.length = 0;
    mockDb.state.updates.length = 0;
    process.env.SITEPULSE_SHARED_SECRET = "test-only-key";
    process.env.DISPATCHPRO_BASE_URL = "https://dispatchpro.example.test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalSecret === undefined) delete process.env.SITEPULSE_SHARED_SECRET;
    else process.env.SITEPULSE_SHARED_SECRET = originalSecret;
    if (originalBaseUrl === undefined) delete process.env.DISPATCHPRO_BASE_URL;
    else process.env.DISPATCHPRO_BASE_URL = originalBaseUrl;
  });

  it("queues an order snapshot with party, site, order number, mixes, period and status", async () => {
    mockDb.state.selections.push([]);
    const result = await enqueueSupplyOrderDispatchPro(order());

    expect(result.queued).toBe(true);
    expect(mockDb.state.inserts).toHaveLength(1);
    expect(mockDb.state.inserts[0]).toMatchObject({
      dispatchId: 0,
      supplyOrderId: 91,
      operation: "order",
      externalRef: "SP-ORDER-91",
      status: "pending",
      payload: {
        sitePulseOrderId: "SP-ORDER-91",
        partyName: "North party",
        sitePulsePartyId: "7",
        siteName: "Test road",
        sitePulseSiteId: "18",
        orderNumber: "PO-91",
        periodFrom: "2026-11-01",
        periodTo: "2026-11-30",
        status: "open",
        mixLines: [{ mix: "BC", orderedMT: 100 }],
      },
    });
  });

  it.each(["open", "closed"] as const)("builds the exact DispatchPro contract for a %s order", (status) => {
    const payload = buildSupplyOrderDispatchProPayload(order({
      status,
      lines: [{
        mixTemplateId: 4,
        mixName: "Order-specific mix label",
        dispatchProMixName: "BC template",
        orderedMt: 100,
        orderMix: { mixName: "Order-specific mix label", bitumenPercent: 5, components: [] },
        mixVersions: [
          { mixName: "Later order mix version", bitumenPercent: 5.3, effectiveAt: "2026-11-02T00:00:00.000Z", components: [] },
        ],
      }],
    }));

    expect(Object.keys(payload).sort()).toEqual([
      "sitePulseOrderId", "partyName", "sitePulsePartyId", "siteName", "sitePulseSiteId",
      "orderNumber", "mixLines", "periodFrom", "periodTo", "status",
    ].sort());
    expect(payload).toEqual({
      sitePulseOrderId: "SP-ORDER-91",
      partyName: "North party",
      sitePulsePartyId: "7",
      siteName: "Test road",
      sitePulseSiteId: "18",
      orderNumber: "PO-91",
      mixLines: [{ mix: "BC template", orderedMT: 100 }],
      periodFrom: "2026-11-01",
      periodTo: "2026-11-30",
      status,
    });
    expect(Object.keys(payload.mixLines[0]).sort()).toEqual(["mix", "orderedMT"]);
    expect(payload.mixLines[0].orderedMT).toBeGreaterThan(0);
    expect(payload.periodFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payload.periodTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payload.periodFrom <= payload.periodTo).toBe(true);
    expect(["open", "closed"]).toContain(payload.status);
  });

  it("coalesces later edits and close/reopen states into the pending order payload", async () => {
    mockDb.state.selections.push([{ id: 5, status: "retry" }]);
    await enqueueSupplyOrderDispatchPro(order({
      status: "closed",
      periodTo: "2026-12-15",
      lines: [{ mixTemplateId: 4, mixName: "BC order label", dispatchProMixName: "BC", orderedMt: 120 }],
    }));

    expect(mockDb.state.inserts).toHaveLength(0);
    expect(mockDb.state.updates[0]).toMatchObject({
      status: "pending",
      operation: "order",
      payload: {
        sitePulseOrderId: "SP-ORDER-91",
        status: "closed",
        periodTo: "2026-12-15",
        mixLines: [{ mix: "BC", orderedMT: 120 }],
      },
    });
  });

  it("sends only nonblank string contractor details using the DispatchPro field names", () => {
    const payload = buildSupplyOrderDispatchProPayload(order({
      partyAddress: "  12 Road, Alladurg ",
      partyGstNo: " 36ABCDE1234F1Z5 ",
      partyPanNo: "ABCDE1234F",
      partyContactPerson: " Sunil Kumar ",
      partyMobile: " 9876543210 ",
    }));
    expect(payload.partyDetails).toEqual({
      address: "12 Road, Alladurg",
      gstNo: "36ABCDE1234F1Z5",
      panNo: "ABCDE1234F",
      contactPerson: "Sunil Kumar",
      mobile: "9876543210",
    });
    expect(Object.values(payload.partyDetails ?? {}).every(value => typeof value === "string" && value.length > 0)).toBe(true);
    expect(Object.keys(payload.partyDetails ?? []).sort()).toEqual([
      "address", "contactPerson", "gstNo", "mobile", "panNo",
    ].sort());
  });

  it("omits partyDetails when all Party master details are blank", () => {
    const payload = buildSupplyOrderDispatchProPayload(order({
      partyAddress: "  ",
      partyGstNo: "",
      partyPanNo: null,
      partyContactPerson: null,
      partyMobile: " ",
    }));
    expect(payload).not.toHaveProperty("partyDetails");
  });

  it("does not queue an order without a SitePulse site", async () => {
    const result = await enqueueSupplyOrderDispatchPro(order({ siteId: null }));
    expect(result).toEqual({ queued: false, reason: "site_required" });
    expect(mockDb.state.inserts).toHaveLength(0);
    expect(mockDb.state.selections).toHaveLength(0);
  });

  it("does not send an older no-site payload to DispatchPro", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await sendDispatchProOutboxRow({
      id: 14,
      dispatch_id: 0,
      supply_order_id: 91,
      external_ref: "SP-ORDER-91",
      operation: "order",
      payload: { externalRef: "SP-ORDER-91", siteId: null },
      attempt_count: 1,
      created_at: new Date(),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockDb.state.updates).toContainEqual(expect.objectContaining({
      status: "failed",
      lastError: "Choose a SitePulse site for this order first.",
    }));
  });

  it("rebuilds a failed outbox row from the current order when retried", async () => {
    mockDb.state.selections.push([{ id: 5, status: "failed" }]);
    const currentOrder = order({
      partyName: "Ashok Contractor",
      orderNo: "PO-CURRENT",
      periodTo: "2026-12-15",
      lines: [{ mixTemplateId: 4, mixName: "Current order label", dispatchProMixName: "BC", orderedMt: 225 }],
    });

    await enqueueSupplyOrderDispatchPro(currentOrder);

    expect(mockDb.state.updates[0]).toMatchObject({
      status: "pending",
      payload: {
        sitePulseOrderId: "SP-ORDER-91",
        partyName: "Ashok Contractor",
        orderNumber: "PO-CURRENT",
        mixLines: [{ mix: "BC", orderedMT: 225 }],
        periodTo: "2026-12-15",
      },
    });
  });

  it("uses the same exact mix-template name as the truck payload", async () => {
    mockDb.state.selections.push(
      [{ id: 45, partyId: 7, mixTemplateId: 4, truckNumber: "TG12UH4799", loadWeight: 12, driverName: "Driver" }],
      [{ dispatchProSiteId: "DP-TEST" }],
      [{ name: "BC template exact" }],
    );
    await enqueueDispatchProChange(45, "create");
    const truckMix = mockDb.state.inserts[0].payload.mixType;
    const orderPayload = buildSupplyOrderDispatchProPayload(order({
      lines: [{ mixTemplateId: 4, mixName: "Current order version", dispatchProMixName: "BC template exact", orderedMt: 100 }],
    }));
    expect(orderPayload.mixLines[0].mix).toBe(truckMix);
  });

  it("posts an order, stores the returned site id, and links it to the SitePulse site", async () => {
    mockDb.state.selections.push(
      [{ partyId: 7, siteId: 18 }],
      [{ dispatchProSiteId: null }],
      [{ dispatchProSiteId: null }],
    );
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("X-SitePulse-Key")).toBe("test-only-key");
      return new Response(JSON.stringify({ site: { id: "DP-18", siteCode: "ALLA" } }), { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendDispatchProOutboxRow({
      id: 11,
      dispatch_id: 0,
      supply_order_id: 91,
      external_ref: "SP-ORDER-91",
      operation: "order",
      payload: buildSupplyOrderDispatchProPayload(order()),
      attempt_count: 1,
      created_at: new Date(),
    });

    expect(String(fetchMock.mock.calls[0][0])).toBe("https://dispatchpro.example.test/api/integrations/sitepulse/orders");
    expect(mockDb.state.updates).toContainEqual(expect.objectContaining({
      status: "sent",
      responseSiteId: "DP-18",
      responseSiteName: "ALLA",
    }));
    expect(mockDb.state.updates).toContainEqual({ dispatchProSiteId: "DP-18" });
  });

  it("does not replace a different manual party link before Owner choice", async () => {
    mockDb.state.selections.push(
      [{ partyId: 7, siteId: 18 }],
      [{ dispatchProSiteId: "MANUAL-7" }],
      [{ dispatchProSiteId: null }],
    );
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ siteId: "DP-NEW", siteCode: "NEW" }), { status: 200 })));

    await sendDispatchProOutboxRow({
      id: 12,
      dispatch_id: 0,
      supply_order_id: 91,
      external_ref: "SP-ORDER-91",
      operation: "order",
      payload: buildSupplyOrderDispatchProPayload(order()),
      attempt_count: 1,
      created_at: new Date(),
    });

    expect(mockDb.state.updates).toContainEqual(expect.objectContaining({ responseSiteId: "DP-NEW" }));
    expect(mockDb.state.updates).not.toContainEqual(expect.objectContaining({ dispatchProSiteId: "DP-NEW" }));
  });

  it("requires an Owner choice and records whether to use or replace the existing link", async () => {
    mockDb.state.selections.push(
      [{ id: 91, partyId: 7, siteId: 18 }],
      [{ id: 20, status: "sent", responseSiteId: "DP-NEW", responseSiteName: "NEW" }],
      [{ name: "North party", dispatchProSiteId: "MANUAL-7" }],
      [{ name: "Test road", dispatchProSiteId: null }],
    );
    await resolveSupplyOrderDispatchProLink(91, "use_existing", { userId: 1, name: "Owner" });

    expect(mockDb.state.updates).toContainEqual({ dispatchProSiteId: "MANUAL-7" });
    expect(mockDb.state.updates).toContainEqual({ linkChoice: "use_existing", updatedAt: expect.any(Date) });
    expect(mockDb.state.inserts[0]).toMatchObject({
      module: "plant_supply_order",
      action: "dispatchpro_site_link_choice",
      userRole: "owner",
      newValues: expect.objectContaining({ choice: "use_existing", dispatchProSiteId: "MANUAL-7" }),
    });
  });

  it("replaces the party-wide link only after the Owner chooses Replace", async () => {
    mockDb.state.selections.push(
      [{ id: 91, partyId: 7, siteId: 18 }],
      [{ id: 20, status: "sent", responseSiteId: "DP-NEW", responseSiteName: "NEW" }],
      [{ name: "North party", dispatchProSiteId: "MANUAL-7" }],
      [{ name: "Test road", dispatchProSiteId: null }],
    );
    await resolveSupplyOrderDispatchProLink(91, "replace", { userId: 1, name: "Owner" });

    expect(mockDb.state.updates).toContainEqual({ dispatchProSiteId: "DP-NEW" });
    expect(mockDb.state.inserts[0]).toMatchObject({
      oldValues: expect.objectContaining({ partyDispatchProSiteId: "MANUAL-7" }),
      newValues: expect.objectContaining({ choice: "replace", partyDispatchProSiteId: "DP-NEW" }),
    });
  });

  it("keeps the existing truck payload shape while using an order's site-specific link", async () => {
    mockDb.state.selections.push(
      [{ id: 31, partyId: 7, supplyOrderId: 91, mixTemplateId: 4, truckNumber: "TG12UH4799", loadWeight: 18, driverName: "Driver" }],
      [{ siteDispatchProSiteId: "DP-SITE-18", partyDispatchProSiteId: "MANUAL-7" }],
      [{ name: "BC" }],
    );

    await enqueueDispatchProChange(31, "create");

    expect(mockDb.state.inserts[0]).toMatchObject({
      externalRef: "SP-31",
      operation: "create",
      payload: {
        externalRef: "SP-31",
        siteId: "DP-SITE-18",
        vehicleNo: "TG12UH4799",
        loadMT: 18,
        driverName: "Driver",
        mixType: "BC",
      },
    });
    expect(mockDb.state.inserts[0].payload).not.toHaveProperty("supplyOrderId");
  });
});
