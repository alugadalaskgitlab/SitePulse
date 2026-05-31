import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calculator, Lock, Home } from "lucide-react";
import { signOutEstimator } from "@/lib/estimatorAuth";
import { useFeatureFlags } from "@/lib/featureFlags";

export default function EstimatorLogin() {
  const [, setLocation] = useLocation();
  const [pin, setPin] = useState("");
  const { companyName } = useFeatureFlags();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get("returnTo") || "/estimator-hub";

  useEffect(() => {
    signOutEstimator();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/estimator/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin: pin.trim() }),
      });
      if (res.ok) {
        setLocation(returnTo);
      } else {
        setError("Invalid PIN. Please try again.");
        setPin("");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="text-center mb-8">
        <img src="/sitepulse-logo.png" alt="SitePulse" className="h-16 w-16 object-contain mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-foreground">{companyName}</h1>
        <p className="text-muted-foreground text-sm mt-1">Estimate Manager</p>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg justify-center">
            <Lock className="w-5 h-5 text-amber-500" />
            Enter Access PIN
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pin-input" className="sr-only">PIN</Label>
              <Input
                id="pin-input"
                data-testid="input-estimator-pin"
                type="password"
                inputMode="numeric"
                placeholder="Enter PIN"
                value={pin}
                onChange={(e) => { setPin(e.target.value); setError(""); }}
                maxLength={8}
                autoFocus
                className="text-center text-xl tracking-widest h-12"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive text-center" data-testid="text-login-error">{error}</p>
            )}
            <Button
              type="submit"
              className="w-full bg-amber-500 hover:bg-amber-600 text-white"
              disabled={loading || !pin.trim()}
              data-testid="button-estimator-login"
            >
              {loading ? "Verifying…" : "Access Portal"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-muted-foreground text-center">
        <Calculator className="w-3 h-3 inline mr-1" />
        Bituminous Mix &amp; Concrete Rate Calculators
      </p>

      <div className="mt-4">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" data-testid="button-home">
            <Home className="w-3.5 h-3.5" />
            Back to Site Log
          </Button>
        </Link>
      </div>
    </div>
  );
}
