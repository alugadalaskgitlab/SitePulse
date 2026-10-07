import type { ReactNode } from "react";
import type { SectionKey } from "@shared/permissions";
import { useAuth } from "@/lib/auth-context";

/** Download/print controls require Export independently of on-screen Reports. */
export function ReportExportGate({ sections, children }: { sections: SectionKey[]; children: ReactNode }) {
  const { sectionCan } = useAuth();
  return sections.some(section => sectionCan(section, "export")) ? <>{children}</> : null;
}