import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export default function AuditHistoryButton(props: ComponentProps<typeof Button>) {
  const { isAdmin, isOwner } = useAuth();
  if (!isAdmin && !isOwner) return null;
  return <Button {...props} />;
}
