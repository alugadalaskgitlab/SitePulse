import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Loader2 } from "lucide-react";

const MANAGER_PIN = "1234";
const ADMIN_PIN = "5678";

interface PinAuthProps {
  onSuccess: (role: "manager" | "admin") => void;
}

export function PinAuth({ onSuccess }: PinAuthProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    // Simulate validation delay
    await new Promise(resolve => setTimeout(resolve, 500));

    if (pin === MANAGER_PIN) {
      onSuccess("manager");
    } else if (pin === ADMIN_PIN) {
      onSuccess("admin");
    } else {
      setError("Invalid PIN. Please try again.");
      setPin("");
    }
    setIsLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="w-6 h-6 text-primary" />
            </div>
          </div>
          <CardTitle>Manager/Admin Access</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter PIN to unlock edit/delete features
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="password"
                placeholder="Enter PIN"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError("");
                }}
                maxLength={4}
                className="text-center text-2xl tracking-widest font-mono"
                data-testid="input-pin"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive font-medium">{error}</p>
            )}
            <div className="space-y-2">
              <Button
                type="submit"
                className="w-full"
                disabled={pin.length !== 4 || isLoading}
                data-testid="button-unlock"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Unlock Access"
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Manager PIN: 1234 | Admin PIN: 5678 (for demo)
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
