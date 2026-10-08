// Read-only development inventory. No production connection or repair.
import pg from "pg";
import fs from "node:fs";
import crypto from "node:crypto";
import { canLinkTripArrangement } from "../shared/tripArrangementLink";
import { arrangementStatusAsOf } from "../shared/arrangementStatusHistory";
const p = new pg.Client({connectionString:process.env.DEV_DATABASE_URL});
await p.connect();
try {
  await p.query("BEGIN READ ONLY");
  const database=(await p.query("select current_database() n")).rows[0].n;
  if(database!=="sitelog_dev")throw Error("Development database required");
  const trips=(await p.query("select *,to_char(date,'YYYY-MM-DD') trip_date from site_material_trips order by id")).rows;
  const arrangements=(await p.query("select * from earthwork_arrangements order by id")).rows;
  const byId=new Map(arrangements.map(a=>[a.id,a]));
  const invalid=trips.filter(t=>t.earthwork_arrangement_id!=null).flatMap(t=>{
    const a=byId.get(t.earthwork_arrangement_id);
    const statusInput=a?{status:a.status,revisionHistory:a.revision_history}:null;
    if(statusInput&&canLinkTripArrangement(statusInput,t.trip_date))return [];
    return [{tripId:t.id,date:t.trip_date,site:t.site,material:t.material,transporter:t.supplier,
      arrangementId:t.earthwork_arrangement_id,agency:a?.agency_name??null,
      statusAsOf:statusInput?arrangementStatusAsOf(statusInput,t.trip_date):"missing arrangement",
      isDeleted:t.is_deleted}];
  });
  const digest=(rows:unknown[])=>({count:rows.length,checksum:crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex")});
  fs.mkdirSync("reports/trip-link02",{recursive:true});
  fs.writeFileSync("reports/trip-link02/existing-links.json",JSON.stringify({database,readOnly:true,
    totalTrips:trips.length,linkedTrips:trips.filter(t=>t.earthwork_arrangement_id!=null).length,
    invalidCount:invalid.length,invalidActiveCount:invalid.filter(t=>!t.isDeleted).length,
    rows:invalid},null,2));
  fs.writeFileSync("reports/trip-link02/inventory-checksums.json",JSON.stringify({trips:digest(trips),arrangements:digest(arrangements)},null,2));
  console.log(JSON.stringify({database,invalidCount:invalid.length,rows:invalid}));
  await p.query("ROLLBACK");
}finally{await p.end();}
