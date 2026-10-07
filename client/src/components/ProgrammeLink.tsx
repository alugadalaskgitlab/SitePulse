import { Link } from "wouter";
import type { ComponentProps } from "react";
import type { SectionKey } from "@shared/permissions";
import { useAuth } from "@/lib/auth-context";

/** Navigation must not offer a destination denied by that destination's page gate. */
export function programmeLinkSections(href: string): SectionKey[] | null {
  const path = href.split(/[?#]/)[0];
  if (path === "/norms") return ["norms_library"];
  if (path === "/edit-requests") return ["edit_requests_review"];
  if (path === "/work-program") return ["qto_boq", "work_programme", "work_programme_review", "planning_masters"];
  if (path === "/work-program/planning-masters") return ["planning_masters"];
  if (/^\/work-program\/[^/]+\/geometry$/.test(path)) return ["planning_masters"];
  if (/^\/work-program\/[^/]+\/(settings|programme|execution-arrangements)$/.test(path)) return ["work_programme"];
  if (/^\/work-program\/[^/]+\/(demand|earthwork|resource-review|item-review)$/.test(path)) return ["work_programme_review"];
  if (/^\/work-program\/[^/]+\/scope$/.test(path)) return ["project_scope", "qto_boq", "work_programme", "work_programme_review", "planning_masters"];
  if (/^\/work-program\/[^/]+$/.test(path)) return ["qto_boq"];
  return null;
}

export function ProgrammeLink(props: ComponentProps<typeof Link>) {
  const auth = useAuth({ optional: true });
  const sections = programmeLinkSections(props.href ?? "");
  if (sections && !sections.some(section => auth?.sectionCan?.(section, "view"))) return null;
  return <Link {...props} />;
}
