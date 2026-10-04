import {randomBytes} from "node:crypto";
import bcrypt from "bcryptjs";
import fs from "node:fs/promises";
import {db,go,api,save,close} from "./browser.mjs";
const pool=await db();
try {
  const identifier=`dpr-summary-${randomBytes(7).toString("hex")}@example.invalid`;
  const password=randomBytes(30).toString("base64url");
  const hash=await bcrypt.hash(password,12);
  const {rows:[user]}=await pool.query("insert into users(email,password_hash,full_name,is_active,is_admin,notifications_enabled) values($1,$2,$3,true,true,false) returning id", [identifier,hash,"Summary Development Verification"]);
  await fs.writeFile("/tmp/dpr-summary-fix-state.json",JSON.stringify({userId:user.id,identifier,password}),{mode:0o600});
  await go("/login");
  const first=await api("/api/auth/login",{identifier,password});
  if(first.status!==202)throw Error(`Expected pending new device, got ${first.status}`);
  const approved=await pool.query("update user_devices set status='approved',approved_at=now() where user_id=$1 and status='pending' returning id,user_id,status",[user.id]);
  if(approved.rows.length!==1)throw Error("Expected precisely one newly created test device");
  const second=await api("/api/auth/login",{identifier,password});
  if(second.status!==200 || second.body.status!=="ok")throw Error("Real login failed");
  await save("auth-evidence",{database:"sitelog_dev",userId:user.id,firstStatus:first.status,approvedDevices:approved.rows,secondStatus:second.status,authBypass:false});
  await go("/site");
  console.log("Authenticated development test user",user.id);
} finally {await pool.end();await close();}