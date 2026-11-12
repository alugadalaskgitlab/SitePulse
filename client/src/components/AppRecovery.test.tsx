// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { AppErrorBoundary, AppUpdateNotice, handleVitePreloadError } from "./AppRecovery";

afterEach(() => {
  cleanup();
  sessionStorage.removeItem("sp_chunk_reload_at");
});

describe("app recovery", () => {
  it("shows a friendly reload fallback when a route throws during render", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    function BrokenRoute(): JSX.Element {
      throw new Error("render failed");
    }

    render(
      <AppErrorBoundary>
        <BrokenRoute />
      </AppErrorBoundary>,
    );

    expect(screen.getByTestId("app-error-fallback").textContent)
      .toContain("This screen couldn’t be loaded");
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
    consoleError.mockRestore();
  });

  it("automatically reloads once on a failed lazy chunk and respects the one-minute guard", () => {
    const reload = vi.fn();
    render(<AppUpdateNotice />);
    const firstFailure = new Event("vite:preloadError", { cancelable: true });
    act(() => handleVitePreloadError(firstFailure, reload));
    expect(firstFailure.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
    expect(screen.getByTestId("app-update-notice").textContent)
      .toContain("A new version is ready — tap to refresh");
    act(() => handleVitePreloadError(new Event("vite:preloadError", { cancelable: true }), reload));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("uses an update recovery message rather than the generic screen error for chunk failures", () => {
    sessionStorage.setItem("sp_chunk_reload_at", String(Date.now()));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    function BrokenChunk(): JSX.Element {
      throw new Error("Failed to fetch dynamically imported module: /assets/old-page.js");
    }

    render(<AppErrorBoundary><BrokenChunk /></AppErrorBoundary>);
    expect(screen.getByTestId("chunk-load-recovery").textContent).toContain("A new version is available");
    expect(screen.queryByText("This screen couldn’t be loaded")).toBeNull();
    consoleError.mockRestore();
  });

  it("shows the refresh prompt for a waiting service-worker update", async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
    const activeWorker = {} as ServiceWorker;
    const registration = new EventTarget() as unknown as ServiceWorkerRegistration;
    Object.defineProperties(registration, {
      active: { value: activeWorker },
      waiting: { value: {} as ServiceWorker },
      installing: { value: null },
    });
    const serviceWorker = new EventTarget() as unknown as ServiceWorkerContainer;
    Object.defineProperties(serviceWorker, {
      controller: { value: activeWorker },
      getRegistration: { value: vi.fn().mockResolvedValue(registration) },
      ready: { value: Promise.resolve(registration) },
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: serviceWorker,
    });

    try {
      render(<AppUpdateNotice />);
      expect(await screen.findByTestId("app-update-notice")).toBeTruthy();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(navigator, "serviceWorker", originalDescriptor);
      } else {
        Object.defineProperty(navigator, "serviceWorker", {
          configurable: true,
          value: undefined,
        });
      }
    }
  });
});
