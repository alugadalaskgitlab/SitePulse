import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes, setEarthworkSchemaReady } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initPush, sendPushToAudience } from "./push";
import { storage } from "./storage";
import { pool } from "./db";
import { verifyStartupReadiness } from "./startupReadiness";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage { rawBody: unknown; }
}

app.use(express.json({
  limit: "50mb",
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined;
  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${Date.now() - start}ms`;
      if (capturedJsonResponse) {
        const text = JSON.stringify(capturedJsonResponse);
        logLine += ` :: ${text.length > 200 ? text.slice(0, 200) + "..." : text}`;
      }
      log(logLine);
    }
  });
  next();
});

(async () => {
  // SELECT-only, fail-closed readiness. Startup must not seed, backfill,
  // reclassify, grant access, alter schema, or rewrite historical records.
  const readiness = await verifyStartupReadiness(pool);
  log(`Read-only startup readiness: ${JSON.stringify(readiness)}`);
  setEarthworkSchemaReady(true);
  initPush();
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ message: err.message || "Internal Server Error" });
    throw err;
  });
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`serving on port ${port}`);
  });
  startStaleGrnNotifications();
})().catch(async error => {
  console.error("Startup stopped without automatic repair:", error);
  await pool.end();
  process.exitCode = 1;
});

// Preserve the existing operational reminder independently of migrations.
// This is NOT a historical repair. Its push provider can prune expired
// subscriptions; this external-effect limitation is documented in the audit.
function startStaleGrnNotifications() {
  const raw = parseInt(process.env.STALE_GRN_THRESHOLD_HOURS || "48", 10);
  const threshold = Number.isFinite(raw) && raw > 0 && raw <= 8760 ? raw : 48;
  async function checkAndNotifyStaleGrns() {
    try {
      const stale = await storage.getStaleGrns(threshold);
      if (stale.length === 0) return;
      const body = stale.length === 1
        ? `Draft GRN ${stale[0].grnNumber} has been waiting for a PI for over ${threshold}h`
        : `${stale.length} draft GRNs have been waiting for a PI for over ${threshold}h`;
      await sendPushToAudience("⏳ Stale Draft GRN Alert", body, "/stores/grns", "managers");
      console.log(`[StaleGRN] Notified managers — ${stale.length} stale draft GRN(s)`);
    } catch (error) {
      console.error("[StaleGRN] Check failed:", error);
    }
  }
  setTimeout(() => {
    checkAndNotifyStaleGrns();
    setInterval(checkAndNotifyStaleGrns, 60 * 60 * 1000);
  }, 30_000);
}
