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

// Resolve a user's id from their display name (raisedBy text).
// Returns the id when exactly one active user matches (case-insensitive).
// Returns null and logs a warning on ambiguous or no-match so callers
// can no-op safely rather than sending to the wrong person.
async function resolveUserIdByName(name: string): Promise<number | null> {
  const directory = await storage.getUsersDirectory();
  const normalised = name.trim().toLowerCase();
  const matches = directory.filter((u) => u.fullName.trim().toLowerCase() === normalised);
  if (matches.length === 1) return matches[0].id;
  if (matches.length === 0) {
    console.log(`[Push] resolveUserIdByName: no active user found for name "${name}" — skipping targeted push`);
  } else {
    console.log(`[Push] resolveUserIdByName: ${matches.length} users share name "${name}" — ambiguous, skipping targeted push`);
  }
  return null;
}

// Send a targeted push to the person who raised a record.
// Prefers authorUserId (FK, always accurate). Falls back to resolving by
// raisedBy name when authorUserId is absent (legacy records). No-ops when
// the raiser cannot be uniquely identified or has push disabled.
export async function sendPushToRaiser(
  authorUserId: number | null | undefined,
  raisedBy: string,
  title: string,
  body: string,
  url?: string
) {
  if (!pushInitialized) return;

  let userId = authorUserId ?? null;
  if (!userId) {
    userId = await resolveUserIdByName(raisedBy);
  }
  if (!userId) return;

  return sendPushToUser(userId, title, body, url);
}

// Send a push notification to a specific user by their userId.
// Respects the user's notificationsEnabled setting via getActivePushSubscriptions
// (which already filters out disabled users). No-ops if the user has no active
// subscriptions or has push disabled.
export async function sendPushToUser(userId: number, title: string, body: string, url?: string) {
  if (!pushInitialized) return;

  try {
    const subscriptions = await storage.getActivePushSubscriptions();
    const userSubs = subscriptions.filter((s) => s.userId === userId);
    if (userSubs.length === 0) return;

    const payload = JSON.stringify({
      title,
      body,
      url: url || "/",
      icon: "/icon-192x192.png",
      tag: `hlc-${Date.now()}`,
    });

    await Promise.allSettled(
      userSubs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            console.log(`[Push] Removing stale subscription: ${sub.endpoint.slice(0, 60)}...`);
            await storage.deletePushSubscriptionByEndpoint(sub.endpoint);
          } else {
            console.error(`[Push] Failed to send to user ${userId} at ${sub.endpoint.slice(0, 60)}:`, err.message);
          }
        }
      })
    );
  } catch (err) {
    console.error("[Push] Error sending user notification:", err);
  }
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
