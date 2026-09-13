// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  toast: vi.fn(),
  getSubscription: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  requestPermission: vi.fn(),
}));

vi.mock("@/lib/queryClient", () => ({ apiRequest: mocks.apiRequest }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

import { PushNotificationSetup } from "../client/src/components/PushNotificationSetup";

const subscription = {
  endpoint: "https://push.example/browser-device",
  toJSON: () => ({
    endpoint: "https://push.example/browser-device",
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

describe("PushNotificationSetup activation and sync", () => {
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

  it("silently synchronizes on mount and remount without requesting permission", async () => {
    installPushBrowser(subscription);
    const first = render(<PushNotificationSetup />);

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledTimes(1));
    expect(mocks.apiRequest).toHaveBeenLastCalledWith("POST", "/api/push/subscribe", expect.objectContaining({ mode: "sync" }));
    expect(mocks.requestPermission).not.toHaveBeenCalled();

    first.unmount();
    render(<PushNotificationSetup />);
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledTimes(2));
    expect(mocks.requestPermission).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("button-notification-settings"));
    expect(mocks.requestPermission).not.toHaveBeenCalled();
  });

  it("requests permission and activates only after the user explicitly enables push", async () => {
    installPushBrowser(null);
    render(<PushNotificationSetup />);

    fireEvent.click(screen.getByTestId("button-notification-settings"));
    fireEvent.click(await screen.findByTestId("button-enable-push"));

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith(
      "POST",
      "/api/push/subscribe",
      expect.objectContaining({ mode: "activate" }),
    ));
    expect(mocks.requestPermission).toHaveBeenCalledTimes(1);
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
  });

  it("does not subscribe when notification permission is denied", async () => {
    installPushBrowser(null);
    mocks.requestPermission.mockResolvedValue("denied");
    render(<PushNotificationSetup />);

    fireEvent.click(screen.getByTestId("button-notification-settings"));
    fireEvent.click(await screen.findByTestId("button-enable-push"));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Permission Denied" })));
    expect(mocks.subscribe).not.toHaveBeenCalled();
    expect(mocks.apiRequest).not.toHaveBeenCalled();
  });

  it("recognizes apiRequest's thrown disabled-account response during silent sync", async () => {
    installPushBrowser(subscription);
    mocks.apiRequest.mockRejectedValue(new Error('403: {"message":"notifications_disabled"}'));
    render(<PushNotificationSetup />);

    await waitFor(() => expect(mocks.unsubscribe).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId("button-notification-settings"));
    expect(await screen.findByText("Notifications not enabled for your account")).toBeTruthy();
    expect(mocks.requestPermission).not.toHaveBeenCalled();
  });
});