import { useAuth } from "@/lib/auth-context";
import { canAccessRule, type AccessRuleId } from "@shared/featureAccess";

export function useAccessRule(id: AccessRuleId): boolean {
  const { user, permissions, featureAccess } = useAuth();
  return canAccessRule(id, user, { ...featureAccess, legacyPermissions: permissions });
}
