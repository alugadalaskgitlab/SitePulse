import {
  ACTIONS, SECTION_KEYS, SECTION_LABELS, type Action, type PermissionMatrix, type SectionKey,
} from "@shared/permissions";
import permissionActions from "@shared/permission-actions.generated.json";
import projection from "./inventory.generated.json";

export type PreviewChoice = "inherit" | "allow" | "deny";
export type PreviewOverrides = Record<string, PreviewChoice>;
export type Cell = readonly [SectionKey, Action];
export type FunctionNode = {
  id: string; label: string; file: string; locations: string[][];
  sections: string[]; routes: (string | number)[][];
  controls: number[]; operations: string[]; classification: string;
};
export type ControlEvidence = [string, string, string, boolean, number];
export type OperationEvidence = [string, string, string[][], string, string[], string, number];
export type Inventory = Omit<typeof projection, "functions" | "controls" | "operations"> & {
  functions: FunctionNode[]; controls: ControlEvidence[]; operations: OperationEvidence[];
};
export const inventory = projection as unknown as Inventory;
export const functionById = new Map(inventory.functions.map(node => [node.id, node]));
export const operationByName = new Map(inventory.operations.map(operation => [operation[0], operation]));
export const availableActions = (section: SectionKey) =>
  permissionActions[section].actions as readonly Action[];
export const isSection = (key: string): key is SectionKey => (SECTION_KEYS as readonly string[]).includes(key);
export const tooltipFor = (section: SectionKey, action: Action) =>
  (permissionActions[section].tooltips as Partial<Record<Action, string>>)[action] ?? "Not implemented / not applicable";
export const cellId = ([section, action]: Cell) => `${section}.${action}`;
export const cellLabel = ([section, action]: Cell) => `${SECTION_LABELS[section]} / ${action}`;
const requirementPages = ["SiteRequirementsList", "SiteRequirementNew", "MyPlans"];
const dprPages = ["SiteEntry", "GuidedDpr", "DprSections", "SiteReport"];
export function canonicalCapabilityId(functionId: string, localId: string) {
  return localId.startsWith("operation:") ? `operation.${localId.slice(10)}` :
    `${requirementPages.includes(functionId) ? "site_requirements" : dprPages.includes(functionId) ? "site_dpr" : functionId}.${localId}`;
}
export const isRetainedUnwired = (section: SectionKey, action: Action) =>
  action === "view" && ["vendor_bill_aliases", "admin_notifications_manage", "push_notifications"].includes(section);

export function changedCells(before: PermissionMatrix, after: PermissionMatrix) {
  return SECTION_KEYS.flatMap(section => ACTIONS.flatMap(action =>
    !!before[section]?.[action] === !!after[section]?.[action] ? [] :
      [{ section, action, before: !!before[section]?.[action], after: !!after[section]?.[action] }]));
}

/** A single bit edit preserves every other row, inactive bit and unknown field. */
export function editLegacyCell(
  matrix: PermissionMatrix, section: SectionKey, action: Action, enabled: boolean,
  canGrant: (section: SectionKey, action: Action) => boolean,
): PermissionMatrix {
  if (!availableActions(section).includes(action) || isRetainedUnwired(section, action) || !canGrant(section, action)) return matrix;
  return { ...matrix, [section]: { ...matrix[section], [action]: enabled } };
}

/** Deliberately excludes ALL UI preview state from the existing save contract. */
export function legacySaveBody(matrix: PermissionMatrix, designation?: string | null) {
  return designation === undefined ? matrix : { matrix, businessRole: designation };
}

export function previewChanges(overrides: PreviewOverrides) {
  return Object.entries(overrides).filter(([, choice]) => choice !== "inherit");
}

// Exact alternative bit relationships for the named LEGACY bit, not an
// endpoint-wide inference. Other observed source references remain conditional.
export function alternativeCells(section: SectionKey, action: Action): Cell[] {
  const alternatives: Partial<Record<SectionKey, SectionKey>> = {
    purchase_indents_view: "site_procurement", purchase_indents_raise: "site_procurement",
    purchase_indents_approve: "site_procurement",
    diesel_req_view: "site_diesel", diesel_req_raise: "site_diesel", diesel_req_approve: "site_diesel",
    vendor_bills_view: "vendor_bills", vendor_bills_raise: "vendor_bills",
    vendor_bills_verify: "vendor_bills", vendor_bills_approve: "vendor_bills",
    sites_plants_manage: "admin_settings", vendor_masters_manage: "admin_settings",
    concrete_estimates_manage: "admin_settings", admin_notifications_manage: "admin_settings",
  };
  const broad = alternatives[section];
  return broad ? [[broad, action]] : [];
}

export function legacyBitExplanation(matrix: PermissionMatrix, section: SectionKey, action: Action) {
  const activeAlternatives = alternativeCells(section, action).filter(([s, a]) => matrix[s]?.[a]);
  return {
    requested: !!matrix[section]?.[action],
    alternatives: activeAlternatives,
    stillAllowed: !matrix[section]?.[action] && activeAlternatives.length > 0,
    // Not an enforcement resolver: no guarantee for branches/ANDs or auth-only APIs.
    label: matrix[section]?.[action] ? "Stored grant enabled" :
      activeAlternatives.length ? "Still allowed on compatible OR paths" : "Stored grant off; endpoint rules still apply",
  };
}

export type ProposedCapability = {
  id: string; group: string; label: string; sources: Cell[];
  semantics: "any" | "conditional";
  authority: string; restrictions: string; sensitive?: boolean;
};

/** This is a display projection, never used by auth, navigation or APIs. */
export function capabilityPreview(
  capability: ProposedCapability, before: PermissionMatrix, draft: PermissionMatrix, choice: PreviewChoice,
) {
  const enabled = (matrix: PermissionMatrix) => capability.sources.filter(([s, a]) => matrix[s]?.[a]);
  const currentSources = enabled(before);
  const draftSources = enabled(draft);
  const describe = (sources: Cell[]) => capability.semantics === "conditional"
    ? "Conditional / inspect operation rules"
    : sources.length ? "Allowed by listed matrix source; business rules apply" : "No listed matrix source; other account rules may apply";
  return {
    current: describe(currentSources), draft: describe(draftSources),
    currentSources, draftSources,
    proposed: choice === "inherit" ? "Inherited preview" : choice === "allow" ? "Explicitly allowed — proposed only" : "Explicitly denied — proposed only",
    effective: choice === "inherit" ? describe(draftSources) : `${choice === "allow" ? "Allow" : "Deny"} simulation only; backend unchanged`,
  };
}

export type ExplorerFilter = "all" | "allowed" | "denied" | "changed" | "conflicts";
export function nodeMatches(
  node: FunctionNode, search: string, filter: ExplorerFilter,
  before: PermissionMatrix, draft: PermissionMatrix, previews: PreviewOverrides,
) {
  const sections = node.sections.filter(isSection);
  const text = [
    node.label, node.id, node.file, ...node.locations.flat(), ...node.sections,
    ...sections.map(s => SECTION_LABELS[s]), ...node.routes.flat().map(String),
    ...node.operations, ...node.controls.map(i => inventory.controls[i][0]),
  ].join(" ").toLowerCase();
  if (!text.includes(search.trim().toLowerCase())) return false;
  if (filter === "all") return true;
  const cells = sections.flatMap(s => availableActions(s).map(a => [s, a] as Cell));
  if (filter === "allowed") return cells.some(([s, a]) => draft[s]?.[a]);
  if (filter === "denied") return cells.some(([s, a]) => !draft[s]?.[a]);
  if (filter === "changed") return changedCells(before, draft).some(c => sections.includes(c.section)) ||
    previewChanges(previews).some(([id]) => id.startsWith(`${node.id}.`) ||
      (requirementPages.includes(node.id) && id.startsWith("site_requirements.")) ||
      (dprPages.includes(node.id) && id.startsWith("site_dpr.")) ||
      node.operations.some(name => id === `operation.${operationByName.get(name)?.[6]}`));
  return cells.some(([s, a]) => legacyBitExplanation(draft, s, a).stillAllowed) ||
    sections.some(s => ACTIONS.some(a => draft[s]?.[a] && !availableActions(s).includes(a))) ||
    node.classification === "api-only" ||
    node.operations.some(name => operationByName.get(name)?.[3] !== "observed-permission");
}

/** An absent server version token cannot be invented. Detect only observed changes. */
export function hasObservedConflict(baseline: PermissionMatrix, latest: PermissionMatrix | undefined) {
  return !!latest && changedCells(baseline, latest).length > 0;
}

export const commonRestrictions =
  "Authentication/device approval, assigned sites, ownership, creator separation, record state and accounting invariants remain enforced by existing code. Availability/licensing is separate. This preview is not a security resolver.";
