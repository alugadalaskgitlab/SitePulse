import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initPush } from "./push";
import { storage } from "./storage";
import { ensureBootstrapAdmin, backfillSplitPermissions, migrateEmailPhoneSchema, backfillPlantSubPermissions } from "./auth";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        const responseStr = JSON.stringify(capturedJsonResponse);
        logLine += ` :: ${responseStr.length > 200 ? responseStr.slice(0, 200) + "..." : responseStr}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  initPush();
  await registerRoutes(httpServer, app);

  try {
    await storage.resetAllSequences();
    console.log("Startup: All database sequences reset successfully");
  } catch (e) {
    console.error("Startup: Failed to reset sequences:", e);
  }

  try {
    await storage.ensureHeatingSessionDipColumns();
  } catch (e) {
    console.error("Startup: Failed to ensure heating session dip columns:", e);
  }

  try {
    await storage.migrateLegacyGeneratorNamesToCanonical();
  } catch (e) {
    console.error("Startup: Failed to migrate legacy generator names:", e);
  }

  // Audit note (Task #546): there is no separate `bitumen_flow_readings` table —
  // bitumen is tracked exclusively via depth-based dip readings in `bitumen_dip_readings`.
  // All auto-insert paths for that table already use .onConflictDoNothing():
  //   • _syncShiftLogReadings()  — shift log save / update
  // Heating sessions do NOT auto-insert bitumen dip rows.
  // The table also has an explicit duplicate-check in createBitumenDipReading() for
  // manual entries (throws DUPLICATE_BITUMEN_DIP before inserting).
  // This startup call removes any historical duplicates that pre-date the unique index.
  try {
    await storage.deduplicateBitumenDipReadings();
  } catch (e) {
    console.error("Startup: deduplicateBitumenDipReadings failed:", e);
  }

  try {
    await storage.deduplicateLdoDipReadings();
  } catch (e) {
    console.error("Startup: deduplicateLdoDipReadings failed:", e);
  }

  try {
    await storage.deduplicateLdoFlowSlotReadings();
  } catch (e) {
    console.error("Startup: deduplicateLdoFlowSlotReadings failed:", e);
  }

  try {
    await storage.backfillLdoFlowReadingsFromHeatingSessions();
  } catch (e) {
    console.error("Startup: Failed to backfill LDO flow readings from heating sessions:", e);
  }

  try {
    await storage.backfillLdoReceiptsFromMaterialReceipts();
  } catch (e) {
    console.error("Startup: Failed to backfill LDO flow readings from material receipts:", e);
  }

  try {
    const r = await storage.fixLdoStockDeductionErrors();
    console.log(`Startup: fixLdoStockDeductionErrors — receiptsBackfilled=${r.receiptsBackfilled}, receiptLedgerRemoved=${r.receiptLedgerRemoved}, dispatchLedgerRemoved=${r.dispatchLedgerRemoved}, balancesFixed=${r.balancesFixed}, errors=${r.errors}`);
  } catch (e) {
    console.error("Startup: fixLdoStockDeductionErrors failed:", e);
  }

  try {
    const r2 = await storage.backfillDispatchNotes();
    console.log(`Startup: backfillDispatchNotes — updated: ${r2.updated}, skipped: ${r2.skipped}, errors: ${r2.errors}`);
  } catch (e) {
    console.error("Startup: backfillDispatchNotes failed:", e);
  }

  try {
    const r3 = await storage.backfillBitumenTankNumbers();
    console.log(`Startup: backfillBitumenTankNumbers — updated: ${r3.updated}, errors: ${r3.errors}`);
  } catch (e) {
    console.error("Startup: backfillBitumenTankNumbers failed:", e);
  }

  try {
    const result = await storage.migrate6mmDownUomFix();
    console.log(`Startup: ${result.message}`);
  } catch (e) {
    console.error("Startup: migrate6mmDownUomFix failed:", e);
  }

  try {
    await backfillSplitPermissions();
  } catch (e) {
    console.error("Startup: backfillSplitPermissions failed:", e);
  }

  try {
    await backfillPlantSubPermissions();
  } catch (e) {
    console.error("Startup: backfillPlantSubPermissions failed:", e);
  }

  try {
    await migrateEmailPhoneSchema();
  } catch (e) {
    console.error("Startup: migrateEmailPhoneSchema failed:", e);
  }

  try {
    await ensureBootstrapAdmin();
  } catch (e) {
    console.error("Startup: ensureBootstrapAdmin failed:", e);
  }

  try {
    await storage.purgeOrphanedDeletionReversals();
  } catch (e) {
    console.error("Startup: purgeOrphanedDeletionReversals failed:", e);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
