import type { ReactNode } from "react";
import type { SectionKey } from "@shared/permissions";
import { useAuth } from "@/lib/auth-context";

/** Delete is independent from Edit; other operational restrictions still apply. */
export function DeleteGate({ sections, children }: { sections: SectionKey[]; children: ReactNode }) {
  // Shared widgets can render before authentication is available. Missing
  // context denies the action; it must never crash or imply permission.
  const auth = useAuth({ optional: true });
  return auth && sections.some(section => auth.sectionCan(section, "delete")) ? <>{children}</> : null;
}
