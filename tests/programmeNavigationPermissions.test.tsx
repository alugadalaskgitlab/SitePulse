// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
const auth = vi.hoisted(() => ({ allowed: new Set<string>() }));
vi.mock("../client/src/lib/auth-context", () => ({
  useAuth: () => ({ sectionCan: (section: string) => auth.allowed.has(section) }),
}));
import { ProgrammeLink, programmeLinkSections } from "../client/src/components/ProgrammeLink";
afterEach(() => { cleanup(); auth.allowed.clear(); });
describe("Programme navigation follows destination permissions", () => {
  it.each([
    ["planning_masters", "/work-program/planning-masters"],
    ["work_programme", "/work-program/5/programme"],
    ["work_programme_review", "/work-program/5/demand"],
    ["norms_library", "/norms"],
    ["edit_requests_review", "/edit-requests"],
    ["qto_boq", "/work-program/5"],
  ])("%s alone exposes only its own destination", (key, href) => {
    expect(programmeLinkSections(href)).toEqual([key]);
    const view = render(<ProgrammeLink href={href}>Destination</ProgrammeLink>);
    expect(screen.queryByText("Destination")).toBeNull();
    auth.allowed.add(key);
    view.rerender(<ProgrammeLink href={href}>Destination</ProgrammeLink>);
    expect(screen.getByRole("link").getAttribute("href")).toBe(href);
  });
  it("lets programme-only users reach the shared project picker, not BOQ detail", () => {
    auth.allowed.add("work_programme");
    render(<><ProgrammeLink href="/work-program">Projects</ProgrammeLink><ProgrammeLink href="/work-program/5">BOQ</ProgrammeLink></>);
    expect(screen.getByText("Projects")).toBeTruthy();
    expect(screen.queryByText("BOQ")).toBeNull();
  });
});
