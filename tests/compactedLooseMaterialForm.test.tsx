// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const fixtures = vi.hoisted(() => ({
  materials: [] as any[],
  templates: [] as any[],
  mutationPayloads: [] as any[],
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey?: unknown[] }) => {
    const key = options.queryKey?.[0];
    if (key === "/api/plant-module/materials") return { data: fixtures.materials, isLoading: false, refetch: vi.fn() };
    if (key === "/api/plant-module/mix-templates") return { data: fixtures.templates, isLoading: false, refetch: vi.fn() };
    return { data: [], isLoading: false, refetch: vi.fn() };
  },
  useMutation: () => ({
    mutate: (variables: any) => {
      fixtures.mutationPayloads.push(variables);
      if (variables?.name && variables?.procurementRoute) {
        fixtures.materials.push({
          ...variables,
          id: 2,
          bulkDensity: variables.bulkDensity ?? null,
          savedBulkDensity: variables.bulkDensity ?? null,
        });
      }
    },
    isPending: false,
  }),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
  isForbiddenError: () => false,
  NO_PERMISSION_DESCRIPTION: "",
  NO_CREATE_PERMISSION_DESCRIPTION: "",
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    sectionCan: () => true,
    featureCan: () => false,
    isOwner: false,
    isAdmin: true,
    user: { id: 7, fullName: "Test User" },
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { MaterialMaster, MixTemplateMaster } from "../client/src/pages/Plant";

const material = (values: Record<string, unknown>) => ({
  id: 1,
  name: "GSB",
  category: "Aggregate",
  defaultUom: "Ton",
  procurementRoute: "material",
  bulkDensity: 1.75,
  savedBulkDensity: 1.75,
  conversionFromUom: "CFT",
  rolledDensity: 2.2,
  rollingPct: 98,
  looseFactor: 1.2,
  wastagePct: 0,
  ...values,
});

const template = () => ({
  id: 9,
  name: "GSB MIX",
  mixType: "GSB",
  bitumenPercent: 0,
  binderGrade: "VG-30",
  ldoNorm: 6,
  densityTPerCum: 2.2,
  rolledDensity: 2.2,
  rollingPct: 98,
  looseFactor: 1.2,
  wastagePct: 0,
  isStandard: 1,
  partyId: null,
  baseTemplateId: null,
  notes: "",
});

function previewText(testId: string): string {
  return screen.getByTestId(testId).textContent ?? "";
}

describe("compacted-and-loose Material Master forms", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    fixtures.materials = [];
    fixtures.templates = [];
    fixtures.mutationPayloads = [];
  });

  afterEach(cleanup);

  it.each([
    ["saved numbers", { rolledDensity: 2.2, rollingPct: 98, looseFactor: 1.2, wastagePct: 0 }],
    ["saved numeric strings", { rolledDensity: "2.2", rollingPct: "98", looseFactor: "1.2", wastagePct: "0" }],
  ])("opens an existing material with %s and derives its preview density", async (_label, profile) => {
    fixtures.materials = [material(profile)];
    render(<MaterialMaster />);

    fireEvent.click(screen.getByTestId("button-edit-material-1"));

    const preview = await screen.findByTestId("compacted-loose-preview");
    expect(preview.textContent).toContain("For 100 cum compacted: Weight 215.6 MT · Loose 120 cum (4,238 CFT)");
    expect(preview.textContent).toContain("1 cum loose weighs 1.80 MT");
    const density = screen.getByTestId("input-bulk-density") as HTMLInputElement;
    expect(density.value).toBe("1.80");
    expect(density.readOnly).toBe(true);
    expect(screen.getByText(/1 CFT = 0\.051 MT · 100 CFT = 5\.09 MT/)).toBeTruthy();
    expect(screen.queryByText(/1530 CFT|43\.32 m³/)).toBeNull();
  });

  it("updates a newly typed material live and derives the read-only density", async () => {
    render(<MaterialMaster />);
    fireEvent.click(screen.getByTestId("button-add-material"));

    fireEvent.change(screen.getByTestId("input-material-name"), { target: { value: "GSB" } });
    fireEvent.click(screen.getByTestId("select-material-procurement-route"));
    fireEvent.click(await screen.findByRole("option", { name: /Bulk Material/ }));
    fireEvent.change(screen.getByTestId("input-rolled-density"), { target: { value: "2.2" } });
    fireEvent.change(screen.getByTestId("input-rolling-pct"), { target: { value: "98" } });
    fireEvent.change(screen.getByTestId("input-extra-loose-pct"), { target: { value: "20" } });
    fireEvent.change(screen.getByTestId("input-wastage-pct"), { target: { value: "0" } });

    const preview = await screen.findByTestId("compacted-loose-preview");
    expect(preview.textContent).toContain("For 100 cum compacted: Weight 215.6 MT · Loose 120 cum (4,238 CFT)");
    expect(preview.textContent).toContain("1 cum loose weighs 1.80 MT");
    const density = screen.getByTestId("input-bulk-density") as HTMLInputElement;
    expect(density.value).toBe("1.80");
    expect(density.readOnly).toBe(true);

    fireEvent.click(screen.getByTestId("button-save-material"));
    expect(fixtures.mutationPayloads[0].looseFactor).toBe(1.2);
    expect(fixtures.mutationPayloads[0].wastagePct).toBe(0);

    cleanup();
    render(<MaterialMaster />);
    fireEvent.click(screen.getByTestId("button-edit-material-2"));
    expect((await screen.findByTestId("input-extra-loose-pct") as HTMLInputElement).value).toBe("20");
    const reopenedWastage = screen.getByTestId("input-wastage-pct") as HTMLInputElement;
    expect(reopenedWastage.value).toBe("0");
    expect(reopenedWastage.placeholder).toBe("");
    expect(previewText("compacted-loose-preview")).toContain("Weight 215.6 MT · Loose 120 cum (4,238 CFT)");
    const reopenedDensity = screen.getByTestId("input-bulk-density") as HTMLInputElement;
    expect(reopenedDensity.value).toBe("1.80");
    expect(reopenedDensity.readOnly).toBe(true);
  });

  it("keeps material and mix-template profile state independent while showing the same calculation", async () => {
    fixtures.materials = [material({})];
    fixtures.templates = [template()];
    render(<><MaterialMaster /><MixTemplateMaster /></>);

    fireEvent.click(screen.getByTestId("button-edit-material-1"));
    fireEvent.click(screen.getByTestId("button-edit-template-9"));

    const materialPreview = await screen.findByTestId("compacted-loose-preview");
    const templatePreview = await screen.findByTestId("template-compacted-loose-preview");
    expect(materialPreview.textContent).toContain("Weight 215.6 MT");
    expect(templatePreview.textContent).toContain("Weight 215.6 MT");

    fireEvent.change(screen.getByTestId("input-rolled-density"), { target: { value: "2.4" } });

    expect(materialPreview.textContent).toContain("Weight 235.2 MT");
    expect(templatePreview.textContent).toContain("Weight 215.6 MT");
    expect(templatePreview.textContent).toContain("1 cum loose weighs 1.80 MT");
  });
});
