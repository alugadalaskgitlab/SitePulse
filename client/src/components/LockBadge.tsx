import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, LockOpen, KeyRound } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useAuth } from "@/lib/auth-context";
import {
  type LockableResourceType,
  LOCKABLE_RESOURCE_SECTION,
} from "@shared/permissions";
import { UnlockDialog } from "@/components/UnlockDialog";

export type LockSnapshot = {
  lockStatus?: string | null;
  unlockedByUserId?: number | null;
  unlockedAt?: string | Date | null;
  unlockReason?: string | null;
};

type BasicUser = { id: number; fullName: string };

function useUserNameLookup() {
  const q = useQuery<BasicUser[]>({
    queryKey: ["/api/auth/users/basic"],
    queryFn: async () => {
      const r = await fetch("/api/auth/users/basic", { credentials: "include" });
      if (!r.ok) return [];
      return (await r.json()) as BasicUser[];
    },
    staleTime: 5 * 60_000,
  });
  return (id?: number | null) => {
    if (!id) return null;
    const u = (q.data ?? []).find((x) => x.id === id);
    return u?.fullName ?? `User #${id}`;
  };
}

function formatWhen(when?: string | Date | null): string {
  if (!when) return "";
  try {
    const d = typeof when === "string" ? new Date(when) : when;
    return format(d, "dd MMM yyyy, HH:mm");
  } catch {
    return String(when);
  }
}

export type LockBadgeProps = {
  record: LockSnapshot;
  resourceType: LockableResourceType;
  resourceId: number;
  /** Show only the small icon-style badge (used in dense list rows). */
  compact?: boolean;
  /** Inline test id. */
  "data-testid"?: string;
};

/**
 * Lock badge + (optional) inline Unlock button. Shows clear visual state for
 * locked vs unlocked records and exposes the unlock-with-reason flow to users
 * who hold `can_unlock_records` (admins always).
 */
export function LockBadge(props: LockBadgeProps) {
  const { record, resourceType, resourceId, compact, ...rest } = props;
  const { user, sectionCan } = useAuth();
  const lookupName = useUserNameLookup();
  const [open, setOpen] = useState(false);

  const status = (record.lockStatus ?? "locked").toLowerCase();
  const unlocked = status === "unlocked";
  const section = LOCKABLE_RESOURCE_SECTION[resourceType];
  const hasEdit = sectionCan(section, "edit");
  const canUnlock = !!user && (user.isAdmin || (user.canUnlockRecords && hasEdit));
  // Admins bypass the lock check on save, so there is no need to explicitly
  // unlock a record first. Only show the Unlock button for non-admin users
  // who hold canUnlockRecords.
  const showUnlockBtn = canUnlock && !unlocked && !user?.isAdmin;

  const unlockedBy = lookupName(record.unlockedByUserId);
  const unlockedAt = formatWhen(record.unlockedAt);
  const reason = record.unlockReason || "";

  return (
    <>
      <span
        className="inline-flex items-center gap-1 align-middle"
        data-testid={rest["data-testid"] ?? `lock-badge-${resourceType}-${resourceId}`}
      >
        {unlocked ? (
          <HoverCard openDelay={150}>
            <HoverCardTrigger asChild>
              <Badge
                variant="outline"
                className="gap-1 border-amber-500/60 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 cursor-help"
                data-testid={`lock-status-${resourceType}-${resourceId}`}
              >
                <LockOpen className="w-3 h-3" />
                {compact ? "Unlocked" : "Unlocked (1-time edit)"}
              </Badge>
            </HoverCardTrigger>
            <HoverCardContent className="w-72 text-sm space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <LockOpen className="w-3.5 h-3.5" />
                Unlocked for one save
              </div>
              {unlockedBy && (
                <div>
                  <span className="text-muted-foreground">By:</span>{" "}
                  <span className="font-medium" data-testid={`text-unlocked-by-${resourceType}-${resourceId}`}>
                    {unlockedBy}
                  </span>
                </div>
              )}
              {unlockedAt && (
                <div>
                  <span className="text-muted-foreground">When:</span>{" "}
                  <span data-testid={`text-unlocked-at-${resourceType}-${resourceId}`}>{unlockedAt}</span>
                </div>
              )}
              {reason && (
                <div>
                  <div className="text-muted-foreground">Reason:</div>
                  <div className="italic" data-testid={`text-unlock-reason-${resourceType}-${resourceId}`}>
                    "{reason}"
                  </div>
                </div>
              )}
              <div className="text-xs text-muted-foreground pt-1 border-t mt-2">
                The next save automatically re-locks this record.
              </div>
            </HoverCardContent>
          </HoverCard>
        ) : (record.unlockedByUserId || record.unlockedAt || record.unlockReason) ? (
          <HoverCard openDelay={150}>
            <HoverCardTrigger asChild>
              <Badge
                variant="outline"
                className="gap-1 border-slate-400/60 text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-900/60 cursor-help"
                data-testid={`lock-status-${resourceType}-${resourceId}`}
              >
                <Lock className="w-3 h-3" />
                Locked
              </Badge>
            </HoverCardTrigger>
            <HoverCardContent className="w-72 text-sm space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                Locked record
              </div>
              <div className="text-xs text-muted-foreground">
                Last unlock event:
              </div>
              {unlockedBy && (
                <div>
                  <span className="text-muted-foreground">By:</span>{" "}
                  <span className="font-medium" data-testid={`text-unlocked-by-${resourceType}-${resourceId}`}>
                    {unlockedBy}
                  </span>
                </div>
              )}
              {unlockedAt && (
                <div>
                  <span className="text-muted-foreground">When:</span>{" "}
                  <span data-testid={`text-unlocked-at-${resourceType}-${resourceId}`}>{unlockedAt}</span>
                </div>
              )}
              {reason && (
                <div>
                  <div className="text-muted-foreground">Reason:</div>
                  <div className="italic" data-testid={`text-unlock-reason-${resourceType}-${resourceId}`}>
                    "{reason}"
                  </div>
                </div>
              )}
              <div className="text-xs text-muted-foreground pt-1 border-t mt-2">
                The record was re-locked after the last save.
              </div>
            </HoverCardContent>
          </HoverCard>
        ) : (
          <Badge
            variant="outline"
            className="gap-1 border-slate-400/60 text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-900/60"
            data-testid={`lock-status-${resourceType}-${resourceId}`}
          >
            <Lock className="w-3 h-3" />
            Locked
          </Badge>
        )}

        {showUnlockBtn && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 gap-1 text-xs"
            onClick={() => setOpen(true)}
            data-testid={`button-unlock-${resourceType}-${resourceId}`}
          >
            <KeyRound className="w-3 h-3" />
            Unlock
          </Button>
        )}
      </span>

      <UnlockDialog
        open={open}
        onOpenChange={setOpen}
        resourceType={resourceType}
        resourceId={resourceId}
      />
    </>
  );
}

/**
 * Renders the standard "Edit" button, but if the record is locked and the
 * current user can't unlock it, replaces the click handler with a tooltip
 * explaining why. Pages keep their own edit handler — this only adds the
 * lock-aware presentation.
 */
export function LockAwareEditButton(props: {
  record: LockSnapshot;
  resourceType: LockableResourceType;
  resourceId: number;
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
  children: React.ReactNode;
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  "data-testid"?: string;
}) {
  const {
    record,
    resourceType,
    onClick,
    disabled,
    pending,
    children,
    variant = "secondary",
    size,
    className,
  } = props;
  const { user, sectionCan } = useAuth();
  const status = (record.lockStatus ?? "locked").toLowerCase();
  const unlocked = status === "unlocked";
  const section = LOCKABLE_RESOURCE_SECTION[resourceType];
  const hasEdit = sectionCan(section, "edit");
  const canUnlock = !!user && (user.isAdmin || (user.canUnlockRecords && hasEdit));

  // If the record is locked and the current user cannot unlock it (this
  // includes both read-only users with no section edit and edit users who
  // lack `can_unlock_records`), the Edit button is disabled and a tooltip
  // explains why. We intentionally don't gate this on `hasEdit` so that
  // read-only viewers also see the locked-state explanation.
  const lockedAndCannotUnlock = !unlocked && !canUnlock;
  const isDisabled = !!disabled || lockedAndCannotUnlock;

  const btn = (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={isDisabled || pending}
      onClick={onClick}
      data-testid={props["data-testid"]}
    >
      {lockedAndCannotUnlock ? <Lock className="w-3.5 h-3.5 mr-1" /> : null}
      {children}
    </Button>
  );

  if (!lockedAndCannotUnlock) return btn;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>{btn}</span>
        </TooltipTrigger>
        <TooltipContent side="top">
          This record is locked. Ask an approver with unlock rights to open it
          for one edit.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
