import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and } from "drizzle-orm";
import { bulkTripArrangementSchema } from "../shared/tripArrangementLink";
const state = vi.hoisted(()=>({db:null as any}));
vi.mock("../server/db",()=>({get db(){return state.db;}}));
import { bulkLinkTripArrangement, tripArrangementOptions } from "../server/tripArrangementLink";
import { bulkTripConditions } from "../server/siteMaterialTripFilters";
import { siteMaterialTrips } from "../shared/schema";

// Real PostgreSQL, connection-local temporary tables only. No operational row,
// public sequence, account, permission, or business data is modified.
const client = new pg.Client({connectionString:process.env.DEV_DATABASE_URL});
const actor = {userId:16,userName:"Isolated trip-link test",userRole:"manager"};
const input = bulkTripArrangementSchema.parse({
  site:"TEST SITE",material:"soil",supplier:" Carrier ",vehicleNumber:"ts-01 ab 1234",
  dateFrom:"2026-10-01",dateTo:"2026-10-08",roleFilter:"all",earthworkArrangementId:11,
});
beforeAll(async()=>{
  await client.connect();
  expect((await client.query("select current_database() n")).rows[0].n).toBe("sitelog_dev");
  for(const name of ["sites","boq_projects","earthwork_arrangements","site_material_trips","audit_logs"])
    await client.query(`CREATE TEMP TABLE ${name} (LIKE public.${name} INCLUDING DEFAULTS)`);
  await client.query("CREATE TEMP SEQUENCE trip_link_audit_ids");
  await client.query("ALTER TABLE pg_temp.audit_logs ALTER COLUMN id SET DEFAULT nextval('pg_temp.trip_link_audit_ids')");
  await client.query("INSERT INTO pg_temp.sites (id,name) VALUES (1,'TEST SITE'),(2,'OUTSIDE')");
  await client.query("INSERT INTO pg_temp.boq_projects (id,site_id,name) VALUES (1,1,'Test project'),(2,2,'Outside')");
  await client.query("INSERT INTO pg_temp.earthwork_arrangements (id,boq_project_id,material_label,agency_name) VALUES (11,1,'Soil','Excavator'),(22,1,'Soil','Previous'),(33,2,'Soil','Outside')");
  state.db=drizzle(client);
},20000);
beforeEach(async()=>{
  await client.query("UPDATE pg_temp.earthwork_arrangements SET status='approved',revision_history='[]'");
  await client.query("DROP TRIGGER IF EXISTS fail_audit ON pg_temp.audit_logs");
  await client.query("TRUNCATE pg_temp.site_material_trips, pg_temp.audit_logs");
  await client.query(`INSERT INTO pg_temp.site_material_trips
    (id,date,site,material,quantity,uom,supplier,vehicle_number,material_source_type,earthwork_arrangement_id,is_deleted)
    VALUES
    (1,'2026-10-02','TEST SITE','SOIL',600,'CFT','CARRIER','TS01AB1234','own_source',NULL,false),
    (2,'2026-10-03','TEST SITE','SOIL',800,'CFT','Carrier','TS-01 AB1234',NULL,NULL,false),
    (3,'2026-10-03','TEST SITE','SOIL',1000,'CFT','CARRIER','TS01AB1234',NULL,22,false),
    (4,'2026-10-03','TEST SITE','SOIL',600,'CFT','OUTSIDE','TS01AB1234',NULL,NULL,false),
    (5,'2026-10-03','TEST SITE','SOIL',600,'CFT','CARRIER','TS01AB1234',NULL,11,false),
    (6,'2026-10-03','TEST SITE','SOIL',600,'CFT','CARRIER','TS01AB1234',NULL,NULL,true),
    (7,'2026-09-01','TEST SITE','SOIL',600,'CFT','CARRIER','TS01AB1234',NULL,NULL,false)`);
});
afterAll(async()=>{await client.end();});
const rows = async()=> (await client.query("SELECT to_jsonb(t) row FROM pg_temp.site_material_trips t ORDER BY id")).rows.map(r=>r.row);
describe("explicit bulk trip arrangement linking",()=>{
  it("refuses drafts without writing and reports every excluded trip",async()=>{
    await client.query("UPDATE pg_temp.earthwork_arrangements SET status='draft' WHERE id=11");
    const before=await rows(),p=await bulkLinkTripArrangement(input);
    expect(p).toMatchObject({eligibleCount:0,excludedCount:2});
    await expect(bulkLinkTripArrangement({...input,previewToken:p.previewToken},actor)).rejects.toMatchObject({status:400});
    expect(await rows()).toEqual(before);
  });
  it("links only trips before cancellation, preserving all other columns and existing links",async()=>{
    await client.query(`UPDATE pg_temp.earthwork_arrangements SET status='cancelled',revision_history=$1 WHERE id=11`,[JSON.stringify([{eventType:"status_change",previousStatus:"approved",status:"cancelled",effectiveFrom:"2026-10-03",recordedAt:"2026-10-08"}])]);
    const before=await rows(),p=await bulkLinkTripArrangement(input);
    expect(p).toMatchObject({eligibleCount:1,excludedCount:1});
    expect(p.exclusionMessage).toContain("1 trips excluded");
    await bulkLinkTripArrangement({...input,previewToken:p.previewToken},actor);
    expect(await rows()).toEqual(before.map(r=>r.id===1?{...r,earthwork_arrangement_id:11}:r));
  });
  it("invalidates confirmation when status evidence changes",async()=>{
    const p=await bulkLinkTripArrangement(input);
    await client.query("UPDATE pg_temp.earthwork_arrangements SET status='in_progress' WHERE id=11");
    await expect(bulkLinkTripArrangement({...input,previewToken:p.previewToken},actor)).rejects.toMatchObject({code:"TRIP_SELECTION_CHANGED"});
  });
  it("preview eligible IDs equal the actual written set, including own source; only arrangement changes",async()=>{
    const before=await rows();
    const preview=await bulkLinkTripArrangement(input);
    expect(preview).toMatchObject({eligibleCount:2,overwriteCount:0,alreadyLinkedCount:2});
    expect(await bulkLinkTripArrangement({...input,previewToken:preview.previewToken},actor)).toMatchObject({updatedCount:2});
    const after=await rows();
    for(let i=0;i<before.length;i++){
      expect(after[i]).toEqual({...before[i],earthwork_arrangement_id:i<2?11:before[i].earthwork_arrangement_id});
    }
    const audit=(await client.query("SELECT transaction_id,old_values,new_values FROM pg_temp.audit_logs ORDER BY transaction_id")).rows;
    expect(audit.map(r=>r.transaction_id)).toEqual([1,2]);
    expect(audit[0]).toMatchObject({old_values:{earthworkArrangementId:null},new_values:{earthworkArrangementId:11}});
  });
  it("re-run excludes existing links and returns a 409 no-match error",async()=>{
    const p=await bulkLinkTripArrangement(input);
    await bulkLinkTripArrangement({...input,previewToken:p.previewToken},actor);
    const again=await bulkLinkTripArrangement(input);
    expect(again.eligibleCount).toBe(0);
    await expect(bulkLinkTripArrangement({...input,previewToken:again.previewToken},actor)).rejects.toMatchObject({status:409,code:"NO_MATCHING_TRIPS"});
  });
  it("explicit overwrite has its own count and audits the previous arrangement",async()=>{
    const overwrite={...input,onlyUnlinked:false};
    const p=await bulkLinkTripArrangement(overwrite);
    expect(p).toMatchObject({eligibleCount:3,overwriteCount:1});
    await bulkLinkTripArrangement({...overwrite,previewToken:p.previewToken},actor);
    expect((await client.query("SELECT old_values,new_values FROM pg_temp.audit_logs WHERE transaction_id=3")).rows[0])
      .toEqual({old_values:{earthworkArrangementId:22},new_values:{earthworkArrangementId:11}});
  });
  it("refuses a stale confirmation instead of silently changing the eligible set",async()=>{
    const p=await bulkLinkTripArrangement(input);
    await client.query("UPDATE pg_temp.site_material_trips SET earthwork_arrangement_id=22 WHERE id=1");
    await expect(bulkLinkTripArrangement({...input,previewToken:p.previewToken},actor)).rejects.toMatchObject({status:409,code:"TRIP_SELECTION_CHANGED"});
    expect((await client.query("SELECT count(*) n FROM pg_temp.audit_logs")).rows[0].n).toBe("0");
  });
  it("rolls back every trip if even one audit insert fails",async()=>{
    const before=await rows(),p=await bulkLinkTripArrangement(input);
    await client.query("CREATE FUNCTION pg_temp.reject_trip_link_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END $$");
    await client.query("CREATE TRIGGER fail_audit BEFORE INSERT ON pg_temp.audit_logs FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_trip_link_audit()");
    await expect(bulkLinkTripArrangement({...input,previewToken:p.previewToken},actor)).rejects.toThrow();
    expect(await rows()).toEqual(before);
  });
  it("requires the site's arrangement and respects deny-all site scope",async()=>{
    await expect(bulkLinkTripArrangement({...input,earthworkArrangementId:33})).rejects.toMatchObject({status:400});
    expect((await bulkLinkTripArrangement({...input,permittedSiteNames:[]})).eligibleCount).toBe(0);
    expect((await tripArrangementOptions("TEST SITE")).map(x=>x.id).sort((a,b)=>a-b)).toEqual([11,22]);
  });
  it("no-arrangement filtering cannot be overridden by overwrite mode",async()=>{
    expect(await bulkLinkTripArrangement({...input,onlyUnlinked:false,onlyWithoutArrangement:true})).toMatchObject({eligibleCount:2,overwriteCount:0});
  });
  it("the existing material-source predicate still excludes own source",async()=>{
    const ordinary=await state.db.select({id:siteMaterialTrips.id}).from(siteMaterialTrips).where(and(...bulkTripConditions(input)));
    const includingOwn=await state.db.select({id:siteMaterialTrips.id}).from(siteMaterialTrips).where(and(...bulkTripConditions(input,true)));
    expect(ordinary.map((r:any)=>r.id)).toEqual([2,3,5]);
    expect(includingOwn.map((r:any)=>r.id)).toEqual([1,2,3,5]);
  });
  it("rejects role subsets, missing site and unapproved extra mutation fields",()=>{
    for(const patch of [{roleFilter:"in_house"},{site:""},{quantity:999},{supplierVendorId:5}]){
      expect(bulkTripArrangementSchema.safeParse({...input,...patch}).success).toBe(false);
    }
  });
});
