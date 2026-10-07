import type { ReactNode } from "react";
import type { SectionKey } from "@shared/permissions";
import { useAuth } from "@/lib/auth-context";

/** Delete is independent from Edit; other operational restrictions still apply. */
export function DeleteGate({ sections, children }: { sections: SectionKey[]; children: ReactNode }) {
  const { sectionCan } = useAuth();
  return sections.some(section => sectionCan(section, "delete")) ? <>{children}</> : null;
}
