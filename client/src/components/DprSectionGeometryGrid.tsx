import type { ReactNode } from "react";

/** Display-only wrapper; every editor field remains the original controlled input. */
export function DprSectionGeometryGrid({ condensed, index, children }: {
  condensed: boolean;
  index: number;
  children: ReactNode;
}) {
  return <div className={condensed ? "col-span-full grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8" : "contents"}
    data-testid={condensed ? `section-geometry-${index}` : undefined}>{children}</div>;
}