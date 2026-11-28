import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
const fx = vi.hoisted(() => ({ owner: true, edit: false, remove: vi.fn(), guard: vi.fn() }));
vi.mock("../server/auth", async original => {
  const actual = await original<typeof import("../server/auth")>();
  const auth = (req: any, _res: any, next: any) => { req.authUser = { id: 9, fullName: "Fixture", isOwner: fx.owner, isActive: true }; req.authPermissions = {}; next(); };
  return { ...actual, optionalAuth: auth, requireAuth: auth };
});
vi.mock("../server/auth-routes", async original => {
  const actual = await original<typeof import("../server/auth-routes")>();
  const edit = (_req: any, res: any, ...keys: any[]) => { fx.guard(...keys); if (!fx.edit) res.status(403).json({ message: "Edit permission required" }); return fx.edit; };
  return { ...actual, assertEdit: edit, assertEditEither: edit };
});
vi.mock("../server/storage", async original => ({
  ...await original<typeof import("../server/storage")>(),
  storage: new Proxy({}, { get: (_t, key) => key === "deleteAttachment" ? fx.remove :
    key === "getAttachment" ? async () => ({ id: 17, moduleType: "diesel_purchase", linkedRecordId: 501, fileName: "wrong.pdf" }) : vi.fn().mockResolvedValue([]) }),
}));
vi.mock("../server/push", () => ({ sendPushToAll: vi.fn(), sendPushToSection: vi.fn(), sendPushToRaiser: vi.fn(), sendPushToAudience: vi.fn(), sendPushToUser: vi.fn(), initPush: vi.fn() }));
let app: express.Express;
beforeAll(async () => { app = express(); app.use(express.json()); await (await import("../server/routes")).registerRoutes(createServer(app), app); });
beforeEach(() => { fx.owner = true; fx.edit = false; fx.guard.mockClear(); fx.remove.mockReset().mockResolvedValue(true); });
it("allows the Owner and passes an authenticated audit actor", async () => {
  expect((await request(app).delete("/api/attachments/17")).status).toBe(204);
  expect(fx.remove).toHaveBeenCalledWith(17, { confirmShared: false, actor: { userId: 9, userName: "Fixture", userRole: "owner" } });
});
it("allows delegated Edit permission rather than requiring Delete", async () => {
  fx.owner = false; fx.edit = true;
  expect((await request(app).delete("/api/attachments/17")).status).toBe(204);
  expect(fx.guard).toHaveBeenCalledWith("site_diesel", "diesel_req_raise");
});
it("refuses a user without Edit", async () => {
  fx.owner = false;
  expect((await request(app).delete("/api/attachments/17?confirmShared=true")).status).toBe(403);
  expect(fx.remove).not.toHaveBeenCalled();
});
it("returns numbered shared places, and forwards explicit confirmation on retry", async () => {
  const { AttachmentReferenceError } = await import("../server/storage");
  fx.remove.mockRejectedValueOnce(new AttachmentReferenceError([{ moduleType: "material_receipt", linkedRecordId: 202, label: "Receipt RECV/DSL/26-27/0066" }]));
  const response = await request(app).delete("/api/attachments/17");
  expect(response.status).toBe(409); expect(response.body.places[0].label).toBe("Receipt RECV/DSL/26-27/0066");
  expect((await request(app).delete("/api/attachments/17?confirmShared=true")).status).toBe(204);
  expect(fx.remove.mock.calls[1][1].confirmShared).toBe(true);
});
