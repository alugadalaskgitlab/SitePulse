// Explicit development-only additive migration and historical-content evidence.
import fs from "node:fs";
import pg from "pg";
const out="reports/vb-arrange01";
fs.mkdirSync(out,{recursive:true});
const pool=new pg.Pool({connectionString:process.env.DEV_DATABASE_URL});
try {
 if((await pool.query("select current_database() n")).rows[0].n!=="sitelog_dev")throw Error("Development database required");
 const snap=async()=> (await pool.query(`select id, to_jsonb(t)-'material_source_type'-'material_source_label' as content from site_material_trips t order by id`)).rows;
 if(fs.existsSync(`${out}/historical-before.json`))throw Error("Baseline already recorded; refusing to replace it");
 fs.writeFileSync(`${out}/historical-before.json`,JSON.stringify(await snap(),null,2));
 await pool.query(fs.readFileSync("migrations/0043_trip_own_source.sql","utf8"));
 fs.writeFileSync(`${out}/historical-after-schema.json`,JSON.stringify(await snap(),null,2));
 console.log("Two nullable columns added in development; original-column snapshots saved.");
}finally{await pool.end();}
