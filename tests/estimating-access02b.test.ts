import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { can, DEFAULT_ROLE_TICKS, type FeatureAccessState } from "../shared/featureAccess";

describe("Estimating access gates", () => {
  const app = readFileSync("client/src/App.tsx", "utf8");
  const hub = readFileSync("client/src/components/HubShell.tsx", "utf8");
  const routes = readFileSync("server/routes.ts", "utf8");

  it("uses feature access for estimator page visibility and returns 403 from protected API actions", () => {
    expect(app).toContain('<Route path="/estimator-hub" component={gated(EstimatorHub, "estimator_portal")} />');
    expect(hub).toContain('const canSeeEstimator = featureCan("estimating", "view")');
    expect(hub).toContain('...(canSeeEstimator ? [{ href: "/estimator-login"');
    expect(routes).toContain('res.status(403).json({ error: "forbidden", feature, action });');
    expect(routes).toContain('if (!assertFeatureAction(req, res, "estimating", "view")) return;');
  });

  it("allows a non-Owner with Estimating View, denies one without it, and leaves every default role unticked", () => {
    const user = { id: 21, isActive: true, isOwner: false, isAdmin: false };
    const allowed: FeatureAccessState = {
      rolesConfigured: true,
      userRoles: [4],
      roleTicks: { 4: { estimating: { view: true } } },
      licensedModules: ["estimating"],
    };
    const denied: FeatureAccessState = {
      rolesConfigured: true,
      userRoles: [4],
      roleTicks: { 4: {} },
      licensedModules: ["estimating"],
    };

    expect(can(user, "estimating", "view", allowed)).toBe(true);
    expect(can(user, "estimating", "view", denied)).toBe(false);
    expect(can({ ...user, isOwner: true }, "estimating", "view", denied)).toBe(true);
    for (const ticks of Object.values(DEFAULT_ROLE_TICKS)) {
      expect(Object.keys(ticks).some(key => key.startsWith("estimating."))).toBe(false);
    }
  });
});
