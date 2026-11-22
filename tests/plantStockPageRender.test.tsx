// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  search: "",
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey?: unknown[] }) => {
    const key = String(options.queryKey?.[0] ?? "");
    if (!key || key === "null") return { data: undefined, isLoading: false, refetch: vi.fn() };
    if (key.includes("party-statement")) {
      return {
        data: {
          summary: {
            totalReceived: 0,
            dispatchedOwn: 0,
            borrowedFromHlc: 0,
            replenishedToHlc: 0,
            outstanding: 0,
            uom: "MT",
          },
          entries: [],
        },
        isLoading: false,
        refetch: vi.fn(),
      };
    }
    return {
      data: key.includes("reconciliation") ? undefined : [],
      isLoading: false,
      refetch: vi.fn(),
    };
  },
  useMutation: () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), getQueryData: vi.fn() }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
  useLocation: () => ["/plant/stock", mocks.navigate],
  useSearch: () => mocks.search,
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: 1, isOwner: false, isAdmin: false },
    featureCan: () => true,
    sectionCan: () => true,
  }),
}));
vi.mock("@/lib/featureFlags", () => ({
  useFeatureFlags: () => ({ companyName: "Test Company", companyShortName: "Test", logoFile: null }),
}));
vi.mock("@/hooks/use-origin", () => ({
  useOrigin: () => ({ appendPlantContext: (path: string) => path }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn(), queryClient: { invalidateQueries: vi.fn() } }));

import PlantStock from "../client/src/pages/PlantStock";

describe("Plant Stock page navigation", () => {
  beforeEach(() => {
    mocks.search = "";
    mocks.navigate.mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => null,
      text: async () => "",
    })));
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each([
    ["Stores", "?tab=stock&returnTo=%2Fstores%2Fhub", "/stores/hub", "stores"],
    ["HMP Operations", "?tab=stock&returnTo=%2Fplant%2Fhub", "/plant/hub", "hmp"],
    ["Stores with context", "?tab=ledger&context=stores&returnTo=%2Fstores%2Fhub", "/stores/hub", "stores"],
    ["HMP Operations with context", "?tab=ledger&context=hmp&returnTo=%2Fplant%2Fhub", "/plant/hub", "hmp"],
    ["Stores context without returnTo", "?tab=ledger&context=stores", "/stores/hub", "stores"],
    ["HMP context without returnTo", "?tab=stock&context=hmp", "/plant/hub", "hmp"],
    ["Stores without context or returnTo", "?tab=ledger", "/stores/hub", "stores"],
    ["HMP without context or returnTo", "?tab=stock", "/plant/hub", "hmp"],
  ])("opens stock and ledger without crashing from %s", async (_source, search, backHref, context) => {
    mocks.search = search;
    render(<PlantStock />);

    expect(await screen.findByRole("tab", { name: /stock summary/i })).toBeTruthy();
    expect(screen.getByTestId("button-back").closest("a")?.getAttribute("href")).toBe(backHref);

    const ledgerTab = screen.getByRole("tab", { name: /ledger details/i });
    fireEvent.mouseDown(ledgerTab, { button: 0 });
    fireEvent.click(ledgerTab);
    expect(ledgerTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel")).toBeTruthy();

    if (search.includes("&context=")) {
      expect(mocks.navigate).not.toHaveBeenCalled();
    } else {
      await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));
      expect(mocks.navigate.mock.calls[0][0]).toContain(`context=${context}`);
      expect(mocks.navigate.mock.calls[0][1]).toEqual({ replace: true });
    }
  });
});
