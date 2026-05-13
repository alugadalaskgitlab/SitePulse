/**
 * Security regression test: every non-public write endpoint must require authentication.
 *
 * Strategy
 * --------
 * • Mock `storage` — avoids real DB calls from startup migrations inside registerRoutes.
 * • Mock `push`   — avoids VAPID key requirement.
 * • Do NOT mock `server/auth` or `server/auth-routes`:
 *     – The real `requireAuth` global middleware is active.
 *     – The real `registerAuthRoutes` registers all /api/auth/* routes, so they
 *       are discovered and included in the coverage sweep.
 *     – Without a session cookie, `lookupSessionFromCookie` returns
 *       { kind: "missing" } immediately (no DB hit) and `requireAuth` sends 401.
 * • After all routes are registered we walk Express's `_router.stack` to collect
 *   every POST / PUT / PATCH / DELETE route, resolve path params to safe dummy
 *   values, fire each one without any cookie, and assert 401 or 403.
 * • Known-public write paths (intentionally unauthenticated) are explicitly
 *   allowlisted and skipped.
 */

import { vi, describe, it, expect, beforeAll } from "vitest";
import express from "express";
import { createServer } from "http";
import request, { type Test } from "supertest";

// ---------------------------------------------------------------------------
// Mocks — hoisted before any import that transitively uses them
// ---------------------------------------------------------------------------

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

vi.mock("../server/storage", () => {
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};

  const storageProxy = new Proxy(methods, {
    get(target, prop: string) {
      if (!(prop in target)) {
        // Default stub resolves to an empty array so property accesses like
        // `result.updated` yield `undefined` (falsy) rather than throwing.
        target[prop] = vi.fn().mockResolvedValue([]);
      }
      return target[prop];
    },
  });

  return {
    StockShortageError: class StockShortageError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = "StockShortageError";
      }
    },
    storage: storageProxy,
  };
});

// server/auth and server/auth-routes are intentionally NOT mocked.
//
// • The real `requireAuth` middleware runs for every request, so write
//   endpoints without a session cookie correctly get 401 before their
//   handler fires — without any DB queries being made.
// • The real `registerAuthRoutes` registers all /api/auth/* write endpoints
//   so they are included in route discovery and coverage.

import { registerRoutes } from "../server/routes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;
type WriteMethod = (typeof WRITE_METHODS)[number];

/** Maps HTTP write methods to Supertest agent method names. */
const SUPERTEST_METHOD: Record<WriteMethod, keyof Pick<request.SuperTest<Test>, "post" | "put" | "patch" | "delete">> = {
  POST: "post",
  PUT: "put",
  PATCH: "patch",
  DELETE: "delete",
};

const WRITE_METHOD_SET = new Set<string>(WRITE_METHODS);

/**
 * Write endpoints that are intentionally public — authentication is not
 * required by design. These are excluded from the 401/403 assertion.
 * Format: "METHOD /path"
 */
const ALLOWED_PUBLIC_WRITE_PATHS = new Set([
  // Standard auth endpoints — unauthenticated by design
  "POST /api/auth/login",
  "POST /api/auth/logout",
  // Cross-user device claim flow: called from the login screen before a session
  // exists. Validates a signed device token and mints a new session if approved.
  "POST /api/auth/claim-device",
  // Estimator portal uses a separate PIN-based cookie, not the main session
  "POST /api/estimator/session",
  "DELETE /api/estimator/session",
]);

/**
 * Replace Express path params (`:id`, `:name`, etc.) with a safe dummy value
 * so the URL is syntactically valid when firing a request.
 */
function resolvePathParams(path: string): string {
  return path.replace(/:([^/()]+)(\([^)]*\))?/g, "1");
}

interface RouteEntry {
  method: WriteMethod;
  path: string;
}

/**
 * Walk Express's internal router stack and return every registered write-method
 * route (POST / PUT / PATCH / DELETE).
 */
function extractWriteRoutes(app: express.Express): RouteEntry[] {
  const routes: RouteEntry[] = [];

  function traverse(stack: any[], prefix = "") {
    for (const layer of stack) {
      if (layer.route) {
        const rawPath: string | string[] = layer.route.path;
        const paths = Array.isArray(rawPath) ? rawPath : [rawPath];
        for (const p of paths) {
          const fullPath = prefix + p;
          for (const method of Object.keys(layer.route.methods)) {
            const upper = method.toUpperCase();
            if (WRITE_METHOD_SET.has(upper)) {
              routes.push({ method: upper as WriteMethod, path: fullPath });
            }
          }
        }
      } else if (layer.handle?.stack) {
        // Nested Router mounted with app.use("/prefix", router) — attempt to
        // extract the literal prefix from the compiled regexp.
        let nestedPrefix = prefix;
        if (layer.regexp?.source) {
          const match = layer.regexp.source.match(/^\^\\\/([^\\?]+)/);
          if (match) {
            nestedPrefix =
              prefix + "/" + match[1].replace(/\\\//g, "/").replace(/\/$/, "");
          }
        }
        traverse(layer.handle.stack, nestedPrefix);
      }
    }
  }

  // _router is an internal Express property — intentional use here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  traverse((app as any)._router?.stack ?? []);
  return routes;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let app: express.Express;
let writeRoutes: RouteEntry[];

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);

  writeRoutes = extractWriteRoutes(app);
}, 30_000);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Write endpoint authentication guard", () => {
  it("discovers a meaningful number of write routes (sanity check)", () => {
    // If route discovery is broken the security test would give a false-positive
    // (0 routes trivially pass). Require at least 50 to catch that case.
    expect(writeRoutes.length).toBeGreaterThan(50);
  });

  it("every non-public write endpoint returns 401 or 403 without a session cookie", async () => {
    const failures: string[] = [];

    for (const { method, path } of writeRoutes) {
      // Only check /api/* routes — skip static-file helpers etc.
      if (!path.startsWith("/api/")) continue;

      const key = `${method} ${path}`;

      // Skip endpoints that are intentionally public.
      if (ALLOWED_PUBLIC_WRITE_PATHS.has(key)) continue;

      const url = resolvePathParams(path);
      const stMethod = SUPERTEST_METHOD[method];

      const res = await request(app)[stMethod](url)
        .set("Content-Type", "application/json")
        .send({});

      if (res.status !== 401 && res.status !== 403) {
        failures.push(`${method} ${path} → HTTP ${res.status} (expected 401 or 403)`);
      }
    }

    if (failures.length > 0) {
      const list = failures.map((f) => `  • ${f}`).join("\n");
      throw new Error(
        `${failures.length} write endpoint(s) did not reject an unauthenticated request:\n${list}\n\n` +
          `Each endpoint must reject via the global requireAuth middleware or an ` +
          `assertAuthed / assertAdmin / assertCreate / assertEdit guard inside the handler. ` +
          `If the endpoint is intentionally public, add it to ALLOWED_PUBLIC_WRITE_PATHS.`,
      );
    }
  }, 120_000);
});
