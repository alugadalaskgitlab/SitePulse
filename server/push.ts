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

export async function sendPushToAll(title: string, body: string, url?: string) {
  if (!pushInitialized) return;

  try {
    const subscriptions = await storage.getAllPushSubscriptions();
    if (subscriptions.length === 0) return;

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
