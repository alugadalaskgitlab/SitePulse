import { describe, it, expect, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const captured = vi.hoisted(() => ({ conditions: [] as any[] }));
vi.mock("../server/db", () => {
  const builder: any = {
    from: () => builder,
    where: (condition: any) => { captured.conditions.push(condition); return builder; },
    orderBy: () => builder, for: () => builder,
    then: (resolve: any) => Promise.resolve([]).then(resolve),
  };
  const tx = { select: () => builder };
  return { db: { ...tx, transaction: (fn: any) => fn(tx) } };
});
import { storage } from "../server/storage";
const dialect = new PgDialect();
const clauses = (condition: any) => {
  const query = dialect.sqlToQuery(condition);
  return query.sql.replace(/\$(\d+)/g, (_, n) => JSON.stringify(query.params[Number(n)-1]));
};
describe("Trip list / bulk filter contract", () => {
  it("uses identical vehicle, transporter, blank-source and own-source exclusion SQL", async () => {
    captured.conditions = [];
    const filters = { vehicleNumber:" ts-12 34 ",supplier:" carrier ",onlyUnassigned:true,permittedSiteNames:["SITE A"] };
    await storage.getSiteMaterialTrips(filters);
    await storage.bulkAssignSiteMaterialTripMaterialSource({...filters,materialSourceSupplier:"SELLER",actor:{userId:16,userName:"Test"}});
    const [list,bulk] = captured.conditions.map(clauses);
    // The complete predicates are identical modulo order.
    const parts = (sql: string) => sql.slice(1,-1).split(" and ").sort();
    expect(parts(list)).toEqual(parts(bulk));
    expect(list).toContain('"site_material_trips"."supplier"');
    expect(list).toContain('IS DISTINCT FROM \'own_source\'');
  });
  it("ignores whitespace filters and retains own-source trips in the ordinary list", async () => {
    captured.conditions = [];
    await storage.getSiteMaterialTrips({supplier:"  ",vehicleNumber:"  "});
    const sql = clauses(captured.conditions[0]);
    expect(sql).not.toContain('"supplier"');
    expect(sql).not.toContain('"vehicle_number"');
    expect(sql).not.toContain('"material_source_type"');
  });
  it("no-arrangement filter adds IS NULL without dropping existing filters", async () => {
    captured.conditions=[];
    await storage.getSiteMaterialTrips({supplier:"Carrier",vehicleNumber:"TS01",onlyWithoutArrangement:true});
    const text=clauses(captured.conditions[0]);
    expect(text.toLowerCase()).toContain('"earthwork_arrangement_id" is null');
    expect(text).toContain('"supplier"');
    expect(text).toContain('"vehicle_number"');
  });
  it("denies empty site scope without running a list query", async () => {
    captured.conditions=[];
    expect(await storage.getSiteMaterialTrips({supplier:"Carrier",permittedSiteNames:[]})).toEqual([]);
    expect(captured.conditions).toEqual([]);
  });
});
