import { evaluateAccessRule, type AccessRuleId } from "@shared/accessRulesV2";
import { useAuth } from "@/lib/auth-context";

export function useAccessRule(id: AccessRuleId): boolean {
  const { user, permissions, accessRulesV2 } = useAuth();
  return evaluateAccessRule(
    id,
    accessRulesV2,
    user ? {
      ...user,
      authenticated: true,
      legacyRole: (user as typeof user & { role?: string }).role ?? (user.isAdmin ? "admin" : "manager"),
    } : null,
    permissions,
  );
}
