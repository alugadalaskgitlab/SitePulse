import webpush from "web-push";
import { storage } from "./storage";

let pushInitialized = false;

export function initPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@hlc-sitelog.com";

  if (!publicKey || !privateKey) {
    console.log("[Push] VAPID keys not configured — push notifications disabled");
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  pushInitialized = true;
  console.log("[Push] Initialized with VAPID keys");
}

export async function sendTestPush(endpoint: string, p256dh: string, auth: string) {
  if (!pushInitialized) return;

  try {
    const payload = JSON.stringify({
      title: "Notifications Enabled",
      body: "You will now receive push alerts for all data entries",
      url: "/",
      icon: "/icon-192x192.png",
      tag: "hlc-test",
    });

    await webpush.sendNotification(
      { endpoint, keys: { p256dh, auth } },
      payload
    );
    console.log("[Push] Test notification sent successfully");
  } catch (err: any) {
    console.error("[Push] Test notification failed:", err.message);
  }
}

export async function sendPushToAll(title: string, body: string, url?: string) {
  return sendPushToAudience(title, body, url, "all");
}

// Targeted push. The `audience` filter relies on the server-assigned
// `role` column on push_subscriptions (derived from the authenticated
// session at subscribe time, not client input), so it cannot be spoofed.
//   audience='all'      -> every active subscription
//   audience='managers' -> only subscriptions with role='manager' or 'admin'
// If audience='managers' but no manager/admin device has subscribed, the
// alert is dropped (and logged) rather than silently broadcast — the
// admin-inbox notification remains the persistent record.
export async function sendPushToAudience(
  title: string,
  body: string,
  url?: string,
  audience: "all" | "managers" = "all",
) {
  if (!pushInitialized) return;

  try {
    // Only deliver to subscriptions belonging to notification-enabled users
    // (or legacy anonymous rows kept for back-compat).
    let subscriptions = await storage.getActivePushSubscriptions();
    if (subscriptions.length === 0) return;

    if (audience === "managers") {
      subscriptions = subscriptions.filter((s) => s.role === "manager" || s.role === "admin");
      if (subscriptions.length === 0) {
        console.log(`[Push] No manager/admin devices subscribed — dropping push for "${title}". Inbox notification still recorded.`);
        return;
      }
    }

    const payload = JSON.stringify({
      title,
      body,
      url: url || "/",
      icon: "/icon-192x192.png",
      tag: `hlc-${Date.now()}`,
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          );
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            console.log(`[Push] Removing stale subscription: ${sub.endpoint.slice(0, 60)}...`);
            await storage.deletePushSubscriptionByEndpoint(sub.endpoint);
          } else {
            console.error(`[Push] Failed to send to ${sub.endpoint.slice(0, 60)}:`, err.message);
          }
        }
      })
    );
  } catch (err) {
    console.error("[Push] Error sending notifications:", err);
  }
}

// Section-targeted push. Only delivers to users who have `notify=true`
// for the given sectionKey in their permission matrix AND have
// notificationsEnabled=true on their user account.
// If no users have opted in for the section, the push is dropped silently.
export async function sendPushToSection(
  sectionKey: string,
  title: string,
  body: string,
  url?: string,
) {
  if (!pushInitialized) return;

  try {
    const notifyUserIds = await storage.getUsersToNotify(sectionKey);
    if (notifyUserIds.length === 0) return;
    const notifySet = new Set(notifyUserIds);

    // getActivePushSubscriptions already filters by notificationsEnabled.
    const allActive = await storage.getActivePushSubscriptions();
    const subscriptions = allActive.filter(
      (s) => s.userId != null && notifySet.has(s.userId as number),
    );
    if (subscriptions.length === 0) return;

    const payload = JSON.stringify({
      title,
      body,
      url: url || "/",
      icon: "/icon-192x192.png",
      tag: `hlc-${Date.now()}`,
    });

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            console.log(`[Push] Removing stale subscription: ${sub.endpoint.slice(0, 60)}...`);
            await storage.deletePushSubscriptionByEndpoint(sub.endpoint);
          } else {
            console.error(`[Push] Section ${sectionKey}: failed to send to ${sub.endpoint.slice(0, 60)}:`, err.message);
          }
        }
      }),
    );
  } catch (err) {
    console.error("[Push] Error sending section notifications:", err);
  }
}
