import type { AnchorHTMLAttributes, ReactNode } from "react";
import { isInstalledAppMode, requestInAppDocumentPreview } from "@/lib/installedApp";

export function InstalledDocumentLink({
  href,
  fileName,
  title,
  browserTarget = "_blank",
  children,
  className,
  rel = "noreferrer",
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "target" | "rel" | "onClick" | "children"> & {
  href: string;
  fileName: string;
  title?: string;
  browserTarget?: "_blank" | "_self";
  children: ReactNode;
  rel?: string;
}) {
  const installed = isInstalledAppMode();
  return (
    <a
      href={href}
      target={installed ? undefined : browserTarget}
      rel={installed || browserTarget === "_self" ? undefined : rel}
      className={className}
      onClick={installed ? (event) => {
        event.preventDefault();
        requestInAppDocumentPreview({ url: href, fileName, title: title || fileName });
      } : undefined}
      {...props}
    >
      {children}
    </a>
  );
}
