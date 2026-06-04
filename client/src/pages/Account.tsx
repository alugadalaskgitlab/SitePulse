import { useState, useEffect } from "react";
import { Link } from "wouter";
import { User, Bell, Shield, Clock, ChevronRight, CheckCircle, XCircle, Loader2, BellOff } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";

function usePushStatus() {
  const [status, setStatus] = useState<"checking" | "active" | "inactive" | "not_allowed" | "unsupported">("checking");

  useEffect(() => {
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    if (!supported) {
      setStatus("unsupported");
      return;
    }

    (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          setStatus("inactive");
          return;
        }
        const subJson = subscription.toJSON();
        const res = await apiRequest("POST", "/api/push/subscribe", {
          subscription: { endpoint: subJson.endpoint, keys: subJson.keys },
          label: "Device",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (body.message === "notifications_disabled") {
            setStatus("not_allowed");
          } else {
            setStatus("inactive");
          }
          return;
        }
        setStatus("active");
      } catch {
        setStatus("inactive");
      }
    })();
  }, []);

  return status;
}

export default function Account() {
  const { user, isAdmin, isManager } = useAuth();
  const pushStatus = usePushStatus();

  const roleLabel = isAdmin ? "Admin" : isManager ? "Manager" : "Engineer";

  const initials = user?.fullName
    ? user.fullName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "?";

  const sessionPolicyLabel =
    user?.sessionPolicy === "strict"
      ? "Strict (auto-lock after 5 min idle)"
      : "Sticky (stay signed in)";

  return (
    <div className="max-w-lg mx-auto space-y-5 py-2">
      {/* Header card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4">
        <div
          className="w-14 h-14 bg-amber-500 rounded-full flex items-center justify-center font-bold text-xl text-white flex-shrink-0"
          data-testid="account-avatar"
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-base font-semibold text-slate-900 truncate"
            data-testid="account-name"
          >
            {user?.fullName || user?.email}
          </p>
          {user?.fullName && (
            <p
              className="text-sm text-slate-500 truncate"
              data-testid="account-email"
            >
              {user.email}
            </p>
          )}
          <span
            className="inline-block mt-1 text-xs font-medium bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5"
            data-testid="account-role"
          >
            {roleLabel}
          </span>
        </div>
      </div>

      {/* Account details */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Account Details
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {/* Role */}
          <div className="flex items-center gap-3 px-4 py-3.5">
            <Shield className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500">Role</p>
              <p className="text-sm font-medium text-slate-800" data-testid="account-role-detail">
                {roleLabel}
              </p>
            </div>
          </div>

          {/* Session policy */}
          <div className="flex items-center gap-3 px-4 py-3.5">
            <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500">Session policy</p>
              <p
                className="text-sm font-medium text-slate-800"
                data-testid="account-session-policy"
              >
                {sessionPolicyLabel}
              </p>
            </div>
          </div>

          {/* User ID */}
          <div className="flex items-center gap-3 px-4 py-3.5">
            <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500">User ID</p>
              <p
                className="text-sm font-medium text-slate-800"
                data-testid="account-user-id"
              >
                #{user?.id}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Push notifications card */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Push Notifications
          </p>
        </div>

        {/* Status row */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
          <Bell className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500">Status on this device</p>
            <div className="flex items-center gap-1.5 mt-0.5" data-testid="push-status">
              {pushStatus === "checking" && (
                <>
                  <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                  <span className="text-sm text-slate-500">Checking…</span>
                </>
              )}
              {pushStatus === "active" && (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-sm font-medium text-green-700">Active</span>
                </>
              )}
              {pushStatus === "inactive" && (
                <>
                  <XCircle className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-sm text-slate-500">Not subscribed</span>
                </>
              )}
              {pushStatus === "not_allowed" && (
                <>
                  <BellOff className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-sm text-amber-700">Disabled by admin</span>
                </>
              )}
              {pushStatus === "unsupported" && (
                <>
                  <XCircle className="w-3.5 h-3.5 text-slate-300" />
                  <span className="text-sm text-slate-400">Not supported on this browser</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Link to preferences */}
        <Link href="/notifications/preferences">
          <a
            className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer"
            data-testid="link-notification-preferences"
          >
            <Bell className="w-4 h-4 text-orange-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">Notification preferences</p>
              <p className="text-xs text-slate-500">Manage which sections send you push alerts</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
          </a>
        </Link>
      </div>
    </div>
  );
}
