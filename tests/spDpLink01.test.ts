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
        partyId: 7,
        partyName: "North party",
        siteId: 18,
        siteName: "Test road",
        orderNo: "PO-91",
        periodFrom: "2026-11-01",
        periodTo: "2026-11-30",
        status: "open",
        mixLines: [{ mixName: "BC order", orderedMt: 100 }],
      },
    });
  });

  it("sends the active mix version after an order mix change", () => {
    const payload = buildSupplyOrderDispatchProPayload(order({
      lines: [{
        mixTemplateId: 4,
        mixName: "BC base",
        orderedMt: 100,
        orderMix: { mixName: "BC base", bitumenPercent: 5, components: [] },
        mixVersions: [
          { mixName: "BC base", bitumenPercent: 5, effectiveAt: "2026-01-01T00:00:00.000Z", components: [] },
          { mixName: "BC revised", bitumenPercent: 5.3, sourceBitumenPercent: 5, ldoNorm: 8, effectiveAt: new Date().toISOString(), components: [{ materialId: 13, materialName: "Dust", aggregateSharePercent: 100 }] },
        ],
      }],
    }));

    expect(payload.mixLines[0]).toMatchObject({
      mixName: "BC revised",
      orderMix: {
        mixName: "BC revised",
        bitumenPercent: 5.3,
        ldoNorm: 8,
        components: [{ materialId: 13, materialName: "Dust", aggregateSharePercent: 100 }],
      },
    });
  });

  it("coalesces later edits and close/reopen states into the pending order payload", async () => {
    mockDb.state.selections.push([{ id: 5, status: "retry" }]);
    await enqueueSupplyOrderDispatchPro(order({
      status: "closed",
      periodTo: "2026-12-15",
      lines: [{ mixTemplateId: 4, mixName: "BC revised", orderedMt: 120 }],
    }));

    expect(mockDb.state.inserts).toHaveLength(0);
    expect(mockDb.state.updates[0]).toMatchObject({
      status: "pending",
      operation: "order",
      payload: { status: "closed", periodTo: "2026-12-15", mixLines: [{ mixName: "BC revised", orderedMt: 120 }] },
    });
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
