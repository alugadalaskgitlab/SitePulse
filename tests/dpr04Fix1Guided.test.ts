import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveDprBoqProjectId } from "../shared/dprBoqSelection";

const guided = readFileSync("client/src/pages/GuidedDpr.tsx", "utf8");
const boqHook = readFileSync("client/src/hooks/use-dpr-boq-items.ts", "utf8");

describe("DPR-04 Fix 1 — Guided project restoration", () => {
  const projects = [
    { id: 41, status: "active", barCount: 0 },
    { id: 23, status: "active", barCount: 8 },
  ];

  it("keeps the existing new-DPR fallback while preserving an explicit saved null", () => {
    expect(resolveDprBoqProjectId(projects)).toBe(23);
    expect(resolveDprBoqProjectId(projects, undefined)).toBe(23);
    expect(resolveDprBoqProjectId(projects, 41)).toBe(41);
    expect(resolveDprBoqProjectId(projects, null)).toBeNull();
  });

  it("pins both server hydration and local restore through the BOQ hook preference", () => {
    expect(guided).toContain("boqProjectId?: number | null");
    expect(guided).toContain("setBoqProjectPreference({ resolved: true, projectId: restoredProjectId })");
    expect(guided).toContain("setBoqProjectPreference({ resolved: true, projectId: savedBoqProjectId })");
    expect(guided).toContain("preferredProjectId: boqProjectPreference.resolved");
    expect(guided).toContain("serverDraftHydratedRef.current = true");
    expect(guided).toContain("!serverDraftHydratedRef.current && Object.prototype.hasOwnProperty.call(d, \"boqProjectId\")");
    expect(guided).toContain("boqProjectPreference.resolved");
    expect(guided).toContain("serverBoqProjectPinRef.current = data.boqProjectId");
    expect(guided).toContain("onValueChange={handleSiteChange}");
    expect(guided).toContain("localBoqPreferenceScopeRef.current = null");
    expect(boqHook).toContain("preferredProjectId?: number | null");
    expect(boqHook).toContain("resolveDprBoqProjectId(projects, preferredProjectId)");
    expect(boqHook).toContain("if (!response.ok) throw new Error");
    expect(boqHook).toContain("projectsQuery.isSuccess");
  });

  it("does not turn missing legacy autosave fields into a null preference", () => {
    expect(guided).toContain('Object.prototype.hasOwnProperty.call(d, "boqProjectId")');
    expect(guided).toContain('Object.prototype.hasOwnProperty.call(urlDraftDpr, "boqProjectId")');
    expect(guided).toContain("autosaveBoqProjectId !== undefined");
  });
});