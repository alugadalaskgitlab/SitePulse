import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
const dir="reports/arrange02b";fs.mkdirSync(dir,{recursive:true});
const p=new pg.Client({connectionString:process.env.DEV_DATABASE_URL});await p.connect();
if((await p.query("select current_database() n")).rows[0].n!=="sitelog_dev")throw Error("Development only");
const tables=["vendor_bills","vendor_bill_items","earthwork_arrangements","site_material_trips","progress_entries","vendor_bill_payments","vendor_rate_cards"];
const result={};
for(const table of tables){
 const exists=(await p.query("select to_regclass($1) n",[table])).rows[0].n;
 if(!exists)continue;
 const rows=(await p.query(`select to_jsonb(t) - 'billing_terms' - 'arrangement_pricing' v from ${table} t order by id`)).rows.map(r=>r.v);
 result[table]={count:rows.length,sha256:crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex")};
}
const file=`${dir}/integrity-before.json`;
if(process.argv.includes("--check")) {
 const before=JSON.parse(fs.readFileSync(file));
 fs.writeFileSync(`${dir}/integrity-after.json`,JSON.stringify(result,null,2));
 if(JSON.stringify(before)!==JSON.stringify(result))throw Error("Historical rows changed");
 console.log("Historical row checksums identical");
}else {if(fs.existsSync(file))throw Error("Refusing to replace baseline");fs.writeFileSync(file,JSON.stringify(result,null,2));}
await p.end();
