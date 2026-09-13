// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  invalidateQueries: vi.fn(),
  toast: vi.fn(),
  getSubscription: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  requestPermission: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: {
      id: 7,
      fullName: "Notification Tester",
      email: "notification@example.invalid",
      sessionPolicy: "sticky",
    },
    isAdmin: false,
    isManager: true,
  }),
}));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: mocks.apiRequest,
  queryClient: { invalidateQueries: mocks.invalidateQueries },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

import Account from "../client/src/pages/Account";

const subscription = {
  endpoint: "https://push.example/account-device",
  toJSON: () => ({
    endpoint: "https://push.example/account-device",
    keys: { p256dh: "p256dh", auth: "auth" },
  }),
  unsubscribe: mocks.unsubscribe,
};

function installPushBrowser(subscriptionForStatus: typeof subscription | null) {
  mocks.getSubscription.mockResolvedValue(subscriptionForStatus);
  mocks.subscribe.mockResolvedValue(subscription);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: mocks.getSubscription,
          subscribe: mocks.subscribe,
        },
      }),
    },
  });
  Object.defineProperty(window, "PushManager", { configurable: true, value: class PushManager {} });
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: { requestPermission: mocks.requestPermission },
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false })),
  });
}

function renderAccount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Account />
    </QueryClientProvider>,
  );
}

describe("Account push notification status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiRequest.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    mocks.requestPermission.mockResolvedValue("granted");
    mocks.unsubscribe.mockResolvedValue(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ publicKey: "AQ" }),
    }));
  });

  afterEach(() => {
    cleanup();
  });

  it("silently synchronizes existing subscriptions on mount and remount without requesting permission", async () => {
    installPushBrowser(subscription);
    const first = renderAccount();

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledTimes(1));
    expect(mocks.apiRequest).toHaveBeenLastCalledWith(
      "POST",
      "/api/push/subscribe",
      expect.objectContaining({ mode: "sync" }),
    );
    expect(screen.getByTestId("push-status").textContent).toContain("Active");
    expect(mocks.requestPermission).not.toHaveBeenCalled();

    first.unmount();
    renderAccount();
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledTimes(2));
    expect(mocks.requestPermission).not.toHaveBeenCalled();
  });

  it("uses explicit activation only after the user enables this device", async () => {
    installPushBrowser(null);
    renderAccount();

    fireEvent.click(await screen.findByTestId("button-enable-push"));

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith(
      "POST",
      "/api/push/subscribe",
      expect.objectContaining({ mode: "activate" }),
    ));
    expect(mocks.requestPermission).toHaveBeenCalledTimes(1);
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
  });

  it("cleans up disabled or foreign local subscriptions after apiRequest throws", async () => {
    installPushBrowser(subscription);
    mocks.apiRequest.mockRejectedValue(new Error('403: {"message":"notifications_disabled"}'));
    const disabled = renderAccount();

    await waitFor(() => expect(mocks.unsubscribe).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("push-status").textContent).toContain("Disabled by admin");
    disabled.unmount();

    vi.clearAllMocks();
    mocks.unsubscribe.mockResolvedValue(true);
    installPushBrowser(subscription);
    mocks.apiRequest.mockRejectedValue(new Error('403: {"message":"subscription_not_owned"}'));
    renderAccount();

    await waitFor(() => expect(mocks.unsubscribe).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("push-status").textContent).toContain("Not subscribed");
    expect(mocks.requestPermission).not.toHaveBeenCalled();
  });
});