// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { AppErrorBoundary, AppUpdateNotice } from "./AppRecovery";

afterEach(cleanup);

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

  it("shows the quiet refresh prompt when Vite reports a failed chunk preload", () => {
    render(<AppUpdateNotice />);
    act(() => window.dispatchEvent(new Event("vite:preloadError")));
    expect(screen.getByTestId("app-update-notice").textContent)
      .toContain("A new version is ready — tap to refresh");
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
