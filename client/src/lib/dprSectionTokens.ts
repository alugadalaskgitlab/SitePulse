import { DPR_SECTIONS, type DprSectionSnapshot } from "@shared/dprSections";

export type DprWriteTokens = Pick<DprSectionSnapshot, "headerToken" | "sectionTokens">;

export function readDprWriteTokens(value: any): DprWriteTokens | null {
  if (typeof value?.headerToken !== "string" || !DPR_SECTIONS.every(section => typeof value?.sectionTokens?.[section] === "string")) return null;
  return { headerToken: value.headerToken, sectionTokens: { ...value.sectionTokens } };
}

export function requireDprWriteTokens(tokens: DprWriteTokens | null): DprWriteTokens {
  if (!tokens) throw new Error("This draft has no saved version tokens. Reload the saved DPR and review it before saving or submitting. Your local changes have not been sent.");
  return tokens;
}