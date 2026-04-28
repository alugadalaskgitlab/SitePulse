import { useState, useEffect } from "react";
import { Bell, BellOff, Smartphone, Share, Plus, CheckCircle, XCircle, Loader2, Settings, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushNotificationSetup() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [notAllowed, setNotAllowed] = useState(false);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setPushSupported(supported);

    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    setIsStandalone(standalone);

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIos(ios);

    if (supported) {
      checkSubscriptionStatus();
    } else {
      setCheckingStatus(false);
    }
  }, []);

  async function checkSubscriptionStatus() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (err) {
      console.error("Error checking push subscription:", err);
    } finally {
      setCheckingStatus(false);
    }
  }

  async function enablePush() {
    setIsLoading(true);
    setNotAllowed(false);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast({ title: "Permission Denied", description: "Please allow notifications in your browser settings", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      const vapidRes = await fetch("/api/push/vapid-key");
      const { publicKey } = await vapidRes.json();
      if (!publicKey) {
        toast({ title: "Error", description: "Push notifications not configured on server", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const subJson = subscription.toJSON();
      try {
        const res = await apiRequest("POST", "/api/push/subscribe", {
          subscription: {
            endpoint: subJson.endpoint,
            keys: subJson.keys,
          },
          label: isIos ? "iOS Device" : "Device",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          await subscription.unsubscribe();
          if (body.message === "notifications_disabled") {
            setNotAllowed(true);
            return;
          }
          throw new Error(body.message || "Failed to register subscription");
        }
      } catch (serverErr: any) {
        await subscription.unsubscribe();
        throw serverErr;
      }

      setIsSubscribed(true);
      toast({ title: "Notifications Enabled", description: "You will now receive push notifications for all data entries" });
    } catch (err: any) {
      console.error("Push subscribe error:", err);
      setIsSubscribed(false);
      toast({ title: "Failed", description: err.message || "Could not enable push notifications", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  async function disablePush() {
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await apiRequest("DELETE", "/api/push/unsubscribe", { endpoint });
      }
      setIsSubscribed(false);
      toast({ title: "Notifications Disabled", description: "Push notifications turned off for this device" });
    } catch (err) {
      console.error("Push unsubscribe error:", err);
      toast({ title: "Error", description: "Failed to disable notifications", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs" data-testid="button-notification-settings">
          <Settings className="w-3 h-3" />
          Push Notification Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Push Notifications
          </DialogTitle>
        </DialogHeader>

        {checkingStatus ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !pushSupported ? (
          <div className="text-center py-6 space-y-3">
            <XCircle className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Push notifications are not supported on this browser.
            </p>
            {isIos && !isStandalone && (
              <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-left space-y-2">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Add to Home Screen Required
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  On iPhone/iPad, push notifications only work when the app is installed to your Home Screen:
                </p>
                <ol className="text-xs text-amber-700 dark:text-amber-300 space-y-1 list-decimal list-inside">
                  <li className="flex items-center gap-1">
                    Tap the <Share className="w-3 h-3 inline" /> Share button in Safari
                  </li>
                  <li className="flex items-center gap-1">
                    Scroll down and tap <Plus className="w-3 h-3 inline" /> Add to Home Screen
                  </li>
                  <li>Open the app from your Home Screen</li>
                  <li>Come back here to enable notifications</li>
                </ol>
              </div>
            )}
          </div>
        ) : notAllowed ? (
          <div className="text-center py-6 space-y-3">
            <ShieldOff className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">Notifications not enabled for your account</p>
            <p className="text-sm text-muted-foreground">
              Ask an admin to turn on push notifications for your user account in User Management.
            </p>
            <Button variant="outline" className="w-full" onClick={() => setNotAllowed(false)} data-testid="button-notallowed-back">
              Back
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              {isSubscribed ? (
                <>
                  <CheckCircle className="w-8 h-8 text-green-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Notifications Active</p>
                    <p className="text-xs text-muted-foreground">This device will receive push notifications for all data entries</p>
                  </div>
                </>
              ) : (
                <>
                  <BellOff className="w-8 h-8 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Notifications Off</p>
                    <p className="text-xs text-muted-foreground">Enable to receive push alerts for DPR submissions, material entries, equipment logs, and more</p>
                  </div>
                </>
              )}
            </div>

            {isSubscribed ? (
              <Button variant="outline" onClick={disablePush} disabled={isLoading} className="w-full gap-2" data-testid="button-disable-push">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellOff className="w-4 h-4" />}
                Disable Notifications
              </Button>
            ) : (
              <Button onClick={enablePush} disabled={isLoading} className="w-full gap-2" data-testid="button-enable-push">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                Enable Push Notifications
              </Button>
            )}

            {isIos && !isStandalone && !isSubscribed && (
              <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-200 flex items-center gap-1">
                  <Smartphone className="w-3 h-3" />
                  iPhone/iPad Setup
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  For push notifications to work, add this app to your Home Screen first:
                </p>
                <ol className="text-xs text-amber-700 dark:text-amber-300 space-y-1 list-decimal list-inside">
                  <li className="flex items-center gap-1">
                    Tap <Share className="w-3 h-3 inline" /> Share in Safari
                  </li>
                  <li className="flex items-center gap-1">
                    Tap <Plus className="w-3 h-3 inline" /> Add to Home Screen
                  </li>
                  <li>Open from Home Screen, then enable here</li>
                </ol>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
