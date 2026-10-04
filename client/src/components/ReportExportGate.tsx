import type { ReactNode } from "react";
import type { SectionKey } from "@shared/permissions";
import { useAuth } from "@/lib/auth-context";

/** Do not mount download/print controls without the existing report permission. */
export function ReportExportGate({ sections, children }: { sections: SectionKey[]; children: ReactNode }) {
  const { sectionCan } = useAuth();
  return sections.some(section => sectionCan(section, "view_reports")) ? <>{children}</> : null;
}