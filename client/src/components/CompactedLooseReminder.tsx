import {
  hasCompleteCompactedLooseProfile,
  type CompactedLooseProfile,
} from "@shared/compactedLoose";

export function CompactedLooseReminder({
  thicknessMm,
  profile,
  className = "",
}: {
  thicknessMm: number | null | undefined;
  profile: CompactedLooseProfile | null | undefined;
  className?: string;
}) {
  if (thicknessMm == null || !Number.isFinite(thicknessMm) || thicknessMm <= 0 || !profile) return null;
  const thickness = Number.isInteger(thicknessMm) ? String(thicknessMm) : thicknessMm.toFixed(1);
  const message = hasCompleteCompactedLooseProfile(profile)
    ? `${thickness} mm compacted → lay ${(thicknessMm * profile.looseFactor).toFixed(1)} mm loose`
    : `${thickness} mm compacted → loose value not set`;
  return (
    <p className={`text-[11px] text-teal-700 ${className}`} data-testid="compacted-loose-thickness-reminder">
      {message}
    </p>
  );
}
