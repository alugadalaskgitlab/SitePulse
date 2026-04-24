import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";
import type { SectionKey } from "@shared/permissions";

type Props = {
  children: ReactNode;
  // If provided, the section must be visible to the current user — otherwise
  // we redirect home with a "no access" hint.
  section?: SectionKey;
  // Public-route allowlist (Estimator portal, login). Components inside
  // these routes mount without auth.
  isPublic?: boolean;
};

const PUBLIC_PATHS = new Set<string>([
  "/login",
  "/estimator-login",
  "/estimator-hub",
]);

export function isPublicPath(path: string): boolean {
  if (PUBLIC_PATHS.has(path)) return true;
  // Estimator-only calculators stay accessible via the estimator hub.
  if (path.startsWith("/concrete-calculator")) return true;
  return false;
}

export default function RequireAuth({ children, section, isPublic }: Props) {
  const [location, navigate] = useLocation();
  const { isAuthenticated, isLoading, user, sectionVisible } = useAuth();

  const allow = isPublic || isPublicPath(location);

  useEffect(() => {
    if (allow) return;
    if (isLoading) return;
    if (!isAuthenticated) {
      navigate("/login");
    }
  }, [allow, isAuthenticated, isLoading, navigate]);

  if (allow) return <>{children}</>;

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (section && !sectionVisible(section)) {
    return (
      <div className="mx-auto max-w-md text-center py-20 space-y-3">
        <h2 className="text-xl font-semibold">No access</h2>
        <p className="text-sm text-muted-foreground">
          You don't have permission to view this section. Contact an
          administrator if you think this is wrong.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
