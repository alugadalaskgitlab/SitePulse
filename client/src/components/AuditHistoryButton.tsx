import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export default function AuditHistoryButton(props: ComponentProps<typeof Button>) {
  const { user } = useAuth();
  if (!user?.isOwner) return null;
  return <Button {...props} />;
}
