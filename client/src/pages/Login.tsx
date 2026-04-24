import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ShieldCheck } from "lucide-react";
import companyLogo from "@assets/1B61665A-8ECB-443A-98A5-FB3676935BB8_1_102_a_1767081845854.jpeg";

type LoginResult =
  | { status: "ok" }
  | { status: "device_pending"; deviceLabel?: string; user?: { fullName: string } }
  | { status: "device_revoked"; deviceLabel?: string }
  | { status: "error"; message: string };

export default function Login() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { isAuthenticated, refresh } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LoginResult | null>(null);

  // If already authenticated, send the user straight to /.
  useEffect(() => {
    if (isAuthenticated) navigate("/");
  }, [isAuthenticated, navigate]);

  // While stuck on "device_pending", poll the server every 5s. As soon as the
  // admin approves it the polling endpoint reports "approved" and we retry the
  // login automatically.
  useEffect(() => {
    if (!result || result.status !== "device_pending") return;
    const t = window.setInterval(async () => {
      try {
        const r = await fetch("/api/auth/device-status", {
          credentials: "include",
        });
        if (!r.ok) return;
        const j = await r.json();
        if (j?.status === "approved") {
          window.clearInterval(t);
          await doLogin(); // re-attempt now that the device is approved
        }
        if (j?.status === "revoked") {
          window.clearInterval(t);
          setResult({ status: "device_revoked", deviceLabel: j.deviceLabel });
        }
      } catch {
        /* ignore */
      }
    }, 5000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.status]);

  async function doLogin() {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 200 && j?.status === "ok") {
        qc.clear();
        await refresh();
        setResult({ status: "ok" });
        navigate("/");
        return;
      }
      if (r.status === 202 && j?.status === "device_pending") {
        setResult({
          status: "device_pending",
          deviceLabel: j.deviceLabel,
          user: j.user,
        });
        return;
      }
      if (r.status === 403 && j?.status === "device_revoked") {
        setResult({ status: "device_revoked", deviceLabel: j.deviceLabel });
        return;
      }
      const msg =
        j?.error === "invalid_credentials"
          ? "Invalid email or password."
          : j?.error === "user_inactive"
          ? "This account has been disabled. Contact an administrator."
          : j?.error || "Login failed. Try again.";
      setResult({ status: "error", message: msg });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      setResult({ status: "error", message: msg });
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password || busy) return;
    doLogin();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <Card className="w-full max-w-md" data-testid="card-login">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-3 justify-center">
            <img
              src={companyLogo}
              alt="HLC"
              className="h-12 w-12 rounded object-cover"
            />
            <div>
              <CardTitle className="text-lg leading-tight">
                High Lane Constructions
              </CardTitle>
              <p className="text-xs text-muted-foreground">SiteLog Sign-in</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {result?.status === "device_pending" ? (
            <div className="space-y-4 text-center">
              <ShieldCheck className="mx-auto h-10 w-10 text-amber-600" />
              <h3 className="font-semibold">Waiting for device approval</h3>
              <p className="text-sm text-muted-foreground">
                Hi {result.user?.fullName || "there"}, this device hasn't been
                approved yet. An administrator must approve it before you can
                sign in.
              </p>
              <p className="text-xs text-muted-foreground">
                We'll keep checking and let you in automatically once it's
                approved.
              </p>
              <Button
                variant="outline"
                onClick={() => setResult(null)}
                data-testid="button-cancel-device-pending"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  data-testid="input-password"
                />
              </div>
              {result?.status === "error" && (
                <Alert variant="destructive">
                  <AlertDescription data-testid="text-login-error">
                    {result.message}
                  </AlertDescription>
                </Alert>
              )}
              {result?.status === "device_revoked" && (
                <Alert variant="destructive">
                  <AlertDescription>
                    This device's access has been revoked. Contact an
                    administrator to restore it.
                  </AlertDescription>
                </Alert>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={busy}
                data-testid="button-login"
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground pt-2">
                Forgot your password? Ask an administrator to reset it.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
