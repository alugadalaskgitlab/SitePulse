// Backward-compat shim. The real auth lives in `@/lib/auth-context`. This
// file used to host the localStorage-based AccessProvider + PIN logic that
// gated edit/delete with hardcoded PINs. That entire model has been replaced
// by per-user accounts + a permission matrix; we keep this module so existing
// pages keep importing `useAccess` / `AccessProvider` without crashing.
//
// `useAccess` returns the SAME legacy shape it always did, but values are
// derived from the authenticated user (`isAdmin`) and their permission matrix
// (any `edit`/`view_reports` permission ⇒ canEdit/canViewReports).
//
// Long-term, callers should switch to `useAuth().sectionCan(section, action)`
// for fine-grained section/action checks.
import type { ReactNode } from "react";
import { useAccess as useAuthAccess } from "@/lib/auth-context";

export type AccessLevel = "engineer" | "manager" | "admin";

export const useAccess = useAuthAccess;

// AccessProvider is now a pass-through. The real provider is <AuthProvider>
// in App.tsx. Keeping this exported lets any old test wrappers still mount.
export function AccessProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
