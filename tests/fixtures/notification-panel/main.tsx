import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { AdminNotifications } from "../../../client/src/components/AdminNotifications";
import { queryClient } from "../../../client/src/lib/queryClient";
import "../../../client/src/index.css";

const notifications = Array.from({ length: 36 }, (_, index) => {
  const id = 36 - index;
  return {
    id,
    type: index % 3 === 0 ? "warning" : "info",
    title: id === 1 ? "Oldest notification" : `Notification ${id}`,
    message: `Long-list fixture notification ${id}; its controls must remain reachable.`,
    isRead: 0,
    createdAt: new Date(Date.UTC(2026, 0, Math.max(1, id))).toISOString(),
  };
});

const subscription = {
  endpoint: "https://push.example/fixture-device",
  toJSON: () => ({
    endpoint: "https://push.example/fixture-device",
    keys: { p256dh: "fixture-p256dh", auth: "fixture-auth" },
  }),
  unsubscribe: async () => true,
};

const state = {
  syncCalls: 0,
  activationCalls: 0,
  permissionCalls: 0,
  getSubscriptionCalls: 0,
};
(window as Window & { notificationFixture: typeof state }).notificationFixture = state;

Object.defineProperty(navigator, "serviceWorker", {
  configurable: true,
  value: {
    ready: Promise.resolve({
      pushManager: {
        getSubscription: async () => {
          state.getSubscriptionCalls += 1;
          return subscription;
        },
        subscribe: async () => subscription,
      },
    }),
  },
});
Object.defineProperty(window, "PushManager", { configurable: true, value: class PushManager {} });
Object.defineProperty(window, "Notification", {
  configurable: true,
  value: {
    requestPermission: async () => {
      state.permissionCalls += 1;
      return "granted";
    },
  },
});

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  const pathname = new URL(url, window.location.origin).pathname;
  if (pathname === "/api/notifications") {
    return new Response(JSON.stringify(notifications), { headers: { "Content-Type": "application/json" } });
  }
  if (pathname === "/api/notifications/unread-count") {
    return new Response(JSON.stringify({ count: notifications.length }), { headers: { "Content-Type": "application/json" } });
  }
  if (pathname === "/api/push/subscribe") {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (body.mode === "sync") state.syncCalls += 1;
    if (body.mode === "activate") state.activationCalls += 1;
    return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return originalFetch(input, init);
};

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <div style={{ position: "fixed", top: 8, right: 8 }}>
      <AdminNotifications />
    </div>
  </QueryClientProvider>,
);