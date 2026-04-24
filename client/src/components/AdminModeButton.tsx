import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export function AdminModeButton() {
  const { user, logout, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) return null;

  return (
    <div className="flex items-center gap-2">
      {user.isAdmin ? (
        <Badge variant="default" className="gap-1 bg-green-600">
          <ShieldCheck className="w-3 h-3" />
          Admin
        </Badge>
      ) : (
        <Badge variant="secondary" className="gap-1">
          <UserIcon className="w-3 h-3" />
          {user.fullName}
        </Badge>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => logout()}
        data-testid="button-logout"
        title="Sign out"
      >
        <LogOut className="w-4 h-4" />
      </Button>
    </div>
  );
}
