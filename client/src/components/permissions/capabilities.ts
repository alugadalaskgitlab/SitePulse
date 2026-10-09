import { type Cell, type ProposedCapability, functionById, operationByName, isSection, canonicalCapabilityId } from "./model";
import { type Action } from "@shared/permissions";

type Definition = [string, string, string, Cell[], string, string?];
const dpr: Definition[] = [
  ["draft", "Draft & entry", "Create / save / resume draft", [["site_dprs", "create"], ["site_dprs", "edit"]], "Draft creation and editing use different existing paths.", "Draft validation remains lenient; required fields are enforced at submission."],
  ["submit", "Submission", "Preview / submit DPR", [["site_dprs", "create"]], "Submission is bundled with existing entry authority; independence is proposed.", "BOQ links, chainage, geometry, layer quantities and submission validation remain intact."],
  ["correct", "Corrections", "Version / revise / correct submitted DPR", [["site_dprs", "edit"]], "Direct edit, approved edit request and finalized-record rules remain separate."],
  ["clone", "Draft & entry", "Clone DPR", [["site_dprs", "create"]], "Cloning an entry is not a new independent backend permission."],
  ["cancel", "Record lifecycle", "Cancel eligible DPR", [["site_dprs", "delete"]], "Cancellation and deletion are commercially distinct; branch authority requires review."],
  ["delete", "Record lifecycle", "Delete eligible DPR", [["site_dprs", "delete"]], "Only implemented eligible records can be deleted; history is not rewritten."],
  ["export", "Reports & exports", "Export DPR / progress report", [["site_dprs", "export"]], "Both browser-generated and server download paths require tracing."],
];
const requirements: Definition[] = [
  ["read", "Register & entry", "View requirements and tomorrow’s plan", [["site_dprs", "view"]], "Frontend DPR entry grant; individual API branches vary.", "Site and ownership checks remain separate."],
  ["create", "Register & entry", "Raise / edit requirement", [["site_dprs", "create"], ["site_dprs", "edit"]], "Create and Edit apply to different operations, not an interchangeable OR."],
  ["approve", "Decisions", "Approve / reject requirement", [["site_dprs", "approve"]], "Site DPRs / Approve currently controls requirement decisions.", "Creator cannot decide own record; authenticated Owner exceptions and unknown-creator safeguards apply."],
  ["revision_request", "Decisions", "Request revision", [["site_dprs", "edit"]], "Permission and legacy session-role paths vary by request branch."],
  ["revision_decide", "Decisions", "Decide revision", [["site_dprs", "approve"]], "Site DPRs / Approve controls revision decisions.", "Self-approval separation and revision state remain enforced."],
  ["allocate_materials", "Allocation", "Allocate materials", [["stores_inventory", "create"]], "Stores / Create currently authorizes material allocation."],
  ["allocate_equipment", "Allocation", "Allocate equipment", [["plant_equipment", "create"]], "Equipment Usage / Create currently authorizes equipment allocation."],
  ["allocate_labour", "Allocation", "Allocate / update labour status", [["labour_management", "create"]], "Labour Management / Create means allocation status, not labour-master creation."],
  ["overall_status", "Outcomes & readiness", "Overall allocation status", [], "Legacy session-role paths remain; business-role designation alone is not authority."],
  ["readiness", "Outcomes & readiness", "Confirm readiness", [], "Authentication/legacy branch rules; no independent matrix control."],
  ["outcome", "Outcomes & readiness", "Record outcome / carry forward", [], "Legacy session-role and record-state rules remain; no inferred grant."],
];
const definitions: Record<string, Definition[]> = {
  SiteEntry: dpr, GuidedDpr: dpr, DprSections: dpr, SiteReport: dpr,
  SiteRequirementsList: requirements, SiteRequirementNew: requirements, MyPlans: requirements,
  SiteMaterialTrips: [
    ["receive", "Material entry", "Receive / repeat recent material trip", [["site_materials", "create"]], "Receipt entry uses Site Materials authority and supporting operational lookups."],
    ["arrangement", "Execution evidence", "Link / relink execution arrangement", [["site_materials", "edit"]], "Arrangement and receipt association has additional context-specific restrictions."],
    ["match", "Procurement evidence", "Match PI / finalize trip evidence", [["site_materials", "edit"]], "PI lookups and finalization are not grants to the entire master or procurement module."],
    ["correct", "Record lifecycle", "Edit / cancel / delete trip", [["site_materials", "edit"], ["site_materials", "delete"]], "Correction, cancellation and deletion use distinct existing branch rules."],
    ["attach", "Execution evidence", "Attach supplier / vehicle / delivery evidence", [], "Attachment access depends on the parent resource and object policy; authentication alone is not proof of parent authorization."],
  ],
  StoresGrn: [
    ["receive", "Receiving", "Receive stock / linked PI receipt", [["stores_inventory", "create"]], "Stores Create bundles receiving; supporting PO/PI lookup access is scoped separately."],
    ["edit", "Receiving", "Correct eligible GRN / receipt evidence", [["stores_inventory", "edit"]], "Finalized corrections retain edit-request and record-state rules."],
    ["cancel", "Receipt lifecycle", "Cancel / reverse eligible GRN", [["stores_inventory", "delete"]], "Cancellation is not deletion; implemented branch authority and stock impacts remain separate."],
  ],
  StoresIssue: [
    ["issue", "Stock issue", "Issue stock / adjustment", [["stores_inventory", "create"]], "Stores Create bundles stock issue; it is not a new independent permission.", "Stock sufficiency, voucher state and idempotency remain enforced."],
    ["cancel", "Issue lifecycle", "Reverse / cancel eligible issue", [["stores_inventory", "delete"]], "Only implemented reversal/cancel branches apply; not a blanket stock undo."],
  ],
  PlantMaterialReceipts: [
    ["receive", "Receiving", "Receive plant material / opening stock", [["plant_materials", "create"]], "Plant Materials Create bundles receipts and openings; lookup and destination rules apply."],
    ["handover", "Procurement fulfilment", "Finalize pending plant receipt / handover", [["plant_materials", "create"]], "Pending-receipt and PI guards are separate from simply opening the register."],
  ],
  PlantMaterialIssues: [
    ["issue", "Stock issue", "Issue plant materials", [["plant_materials", "create"]], "Issue is bundled with Plant Materials Create.", "Stock accounting, destination and issue evidence remain intact."],
  ],
  PlantMaterialReturns: [
    ["return", "Stock return", "Return plant material", [["plant_materials", "create"]], "Returns share broad material authority; independent return authority is proposed."],
  ],
  EquipmentPerformanceReport: [
    ["review", "Performance evidence", "Review / confirm equipment performance", [], "Admin/Owner review paths remain privileged; report View is not authority to confirm performance."],
    ["export", "Reports & exports", "Export equipment performance statement", [["equipment_performance_report", "export"]], "Statement exports remain subject to actual frontend/API export rules."],
  ],
  NormsLibrary: [
    ["browse", "SNL sources & items", "Browse / search source and items", [["norms_library", "view"]], "Norms View controls presentation; scoped API rules remain separate."],
    ["import", "Norms maintenance", "Import template / seed norms", [["norms_library", "create"]], "Imports and seeding are distinct risks; source references do not prove delegated authority."],
    ["map", "BOQ mapping", "Map / auto-map / review norms", [["qto_boq", "edit"], ["norms_library", "edit"]], "BOQ mapping authority varies by operation; these sources are not a proven unconditional OR."],
  ],
  PlanningMasters: [
    ["outputs", "Planning parameters", "Manage equipment / labour outputs", [["planning_masters", "edit"]], "Planning outputs and parameters are bundled with planning-master grants."],
    ["recipes", "Work-type recipes", "Edit components / auto-build recipes", [["planning_masters", "edit"], ["qto_boq", "edit"]], "Embedded recipe operations accept different parent planning/BOQ paths."],
  ],
  EditRequestsPage: [
    ["request", "Own record access", "Request own edit access", [], "Self-service request is separate from approval and underlying direct-edit authority."],
    ["decide", "Review queue", "Approve / reject edit request", [["edit_requests_review", "approve"]], "Record unlock flag and request-decision branches must be checked separately."],
    ["unlock", "Unlock lifecycle", "Unlock finalized record / audit history", [], "canUnlockRecords is an account privilege, not a new capability persisted by this editor."],
  ],
  ConcreteCalculator: [
    ["calculate", "Calculator", "Calculate rate / compare scenarios", [], "Optional-auth and signed estimator-session paths are separate. Matrix-only Deny cannot revoke them."],
    ["save", "Estimate register", "Save / load / rename estimate", [["concrete_estimates_manage", "create"], ["admin_settings", "create"]], "Estimate register operations differ from calculator input access and privileged deletion."],
    ["export", "Reports & exports", "Export concrete estimate", [["concrete_calculator", "export"]], "Browser export authority is separate from calculation."],
  ],
  VendorBills: [
    ["create", "Bill preparation", "Create / edit vendor bill", [["vendor_bills_raise", "create"], ["vendor_bills", "create"]], "Raise and broad Vendor Bills grants vary by operation."],
    ["preview", "Commercial evidence", "Sensitive Payables Preview", [["vendor_bills_view", "view_reports"], ["vendor_bills", "view_reports"]], "Sensitive preview is distinct from register View.", "Hidden for field users even when Admin/Owner and field flags coexist."],
    ["rates", "Commercial evidence", "Maintain rates / billing parties / GST", [["rate_cards", "edit"], ["vendor_masters_manage", "edit"], ["admin_settings", "edit"]], "Different rate endpoints accept different authority; not a single global OR."],
    ["verify", "Decisions", "Mark verified", [["vendor_bills_verify", "approve"], ["vendor_bills", "approve"]], "Verify-stage and broad legacy paths require endpoint review."],
    ["approve", "Decisions", "Final approve", [["vendor_bills_approve", "approve"], ["vendor_bills", "approve"]], "Approval is commercially distinct from preparation and verification."],
    ["payment", "Settlement", "Record payment", [["vendor_bills_approve", "approve"]], "Payment recording and final approval share current authority; independent control is proposed."],
    ["paid", "Settlement", "Mark paid", [["vendor_bills_approve", "approve"]], "Paid transition preserves evidence, immutable bill rules and workflow state."],
    ["delete", "Settlement", "Delete eligible bill", [["vendor_bills", "delete"]], "Deletion is not cancellation; actual endpoint eligibility applies."],
    ["export", "Reports & exports", "Export whole bill / source evidence", [["vendor_bills_view", "export"], ["vendor_bills", "export"]], "Browser and API export guards must both be traced; privileged exceptions are endpoint-specific."],
  ],
  PurchaseIndents: [
    ["raise", "Preparation", "Raise / edit / submit indent", [["purchase_indents_raise", "create"], ["site_procurement", "create"]], "Raise and legacy procurement paths; edit/submit have their own branch rules."],
    ["approve", "Decisions", "Approve / reject indent", [["purchase_indents_approve", "approve"], ["site_procurement", "approve"]], "Stage-specific and broad legacy grants coexist."],
    ["order", "Procurement fulfilment", "Order / split items / correct routing", [["purchase_indents_raise", "edit"], ["site_procurement", "edit"]], "Order follow-through is currently bundled; source refs are not proof of every branch."],
    ["receive", "Procurement fulfilment", "Receive / hand over GRN or plant receipt", [["stores_inventory", "create"], ["plant_materials", "create"]], "Receiving depends on destination and pending-receipt guards, not an unconditional OR."],
    ["service", "Procurement fulfilment", "Record service completion", [], "Linked service-completion operation requires caller and branch review."],
  ],
  DieselRequirements: [
    ["raise", "Request", "Raise / edit diesel requirement", [["diesel_req_raise", "create"], ["site_diesel", "create"]], "Granular request and broad diesel authority coexist."],
    ["approve", "Decisions", "Approve / reject requirement", [["diesel_req_approve", "approve"], ["site_diesel", "approve"]], "Decision rules remain separate from a preview override."],
    ["purchase", "Purchase & receipt", "Record purchase / evidence", [["diesel_req_raise", "edit"], ["site_diesel", "edit"]], "Purchase and evidence branches share existing grants."],
    ["receipt", "Purchase & receipt", "Receive diesel / update receipt progress", [["stores_inventory", "create"], ["plant_materials", "create"], ["site_diesel", "create"]], "Destination-specific receiving, quantity and stock rules apply."],
  ],
  IrnDetailPage: [
    ["approve", "Decisions", "Approve / reject IRN", [["irn_approve", "approve"], ["irn_approve", "create"]], "Approval UI references Create while enforcement separately checks approval; mismatch is unresolved."],
    ["issue", "Fulfilment", "Issue / link procurement", [["irn_approve", "create"], ["stores_inventory", "create"]], "Stock lookup, procurement queue and issue authority remain workflow-specific."],
  ],
  PlantStockReconciliation: [
    ["prepare", "Physical count", "Prepare count", [["stock_reconciliation", "view"], ["plant_stock", "view"]], "View currently authorizes count draft save; it is not purely read-only."],
    ["submit", "Physical count", "Submit count", [["stock_reconciliation", "view"], ["plant_stock", "view"]], "View also permits submitted-session save; splitting this needs backend approval."],
    ["review", "Decisions", "Review / reject count", [["stock_reconciliation", "create"]], "Create currently authorizes review/posting paths."],
    ["post", "Stock posting", "Post reconciliation", [["stock_reconciliation", "create"]], "Posting is stock-impacting; independent control is proposed.", "Stock accounting, idempotency and reconciliation state remain intact."],
  ],
  PlantEquipmentUsage: [
    ["usage", "Usage", "Record / edit equipment day", [["plant_equipment", "create"], ["plant_equipment", "edit"]], "Create and edit apply to different operations."],
    ["movement", "Movement lifecycle", "Assign / hand over / close movement", [["plant_equipment", "edit"]], "Lifecycle paths share broad equipment grants and role checks."],
    ["diesel", "Fuel evidence", "Record diesel source / receipt", [["plant_equipment", "create"]], "Fuel source and receipts retain physical-fact integrity."],
  ],
  EquipmentHireBilling: [
    ["statement", "Hire statement", "Prepare statement / rate exceptions", [["plant_equipment", "view"]], "Currently tied to equipment access and billing safeguards."],
    ["bill", "Commercial workflow", "Generate hire bill", [["plant_equipment", "create"]], "Bill preparation is not generic equipment editing; guards differ by endpoint."],
    ["export", "Reports & exports", "Export hire statement", [["plant_equipment", "export"]], "Print and statement export controls require separate tracing."],
  ],
  WorkProgramme: [
    ["bars", "Planning", "Plan bars / sides / layers", [["work_programme", "edit"]], "Programme edit bundles planning operations."],
    ["sequence", "Planning", "Auto-sequence / import structure schedule", [["work_programme", "edit"]], "Sequencing/import are not ordinary record creation."],
    ["publish", "Baseline & revisions", "Publish baseline", [["work_programme", "edit"]], "Publication is a separate proposed authority."],
    ["revise", "Baseline & revisions", "Revise / restore schedule", [["work_programme", "edit"]], "Revision history and restore rules remain untouched."],
  ],
  BoqProjectDetail: [
    ["edit", "BOQ", "Edit BOQ / quantities / classification", [["qto_boq", "edit"]], "Frontend key is not proof all BOQ APIs have local guards."],
    ["import", "BOQ", "Import / zero-quantity cleanup", [["qto_boq", "edit"]], "Imports and cleanup need operation-specific authorization approval."],
    ["activate", "Revisions", "Activate BOQ revision", [["qto_boq", "edit"]], "Revision activation is currently bundled."],
    ["mapping", "Resources", "Map resources / item components", [["qto_boq", "edit"]], "Mapping and component operations share parent grants."],
  ],
  BoqProjects: [
    ["list", "Projects", "List projects", [], "Phase 1 found no local View assertion on GET /api/boq/projects; global auth still applies."],
    ["create", "Projects", "Create project", [], "Phase 1 found no local Create assertion on POST /api/boq/projects; QTO Create alone does not enforce it."],
  ],
  ExecutionArrangements: [
    ["edit", "Arrangements", "Create / revise arrangement", [["work_programme", "edit"]], "Generic edit and legacy role names influence different branches."],
    ["approve", "Decisions", "Approve / revise arrangement", [["work_programme_review", "approve"]], "Explicit legacy role gates remain on status operations."],
    ["allocate", "Execution links", "Allocate / link programme bars", [["work_programme", "edit"]], "Allocation and linking preserve procurement/material responsibilities."],
    ["outcome", "Effective history", "Record effective status / outcome", [], "Legacy role gates and dated history remain; no inferred matrix authority."],
  ],
  ScopeSetup: [
    ["confirm", "Working reaches", "Confirm / revise / withdraw scope", [["project_scope", "approve"], ["project_scope", "edit"]], "Decision and correction grants differ; planning OR paths also exist."],
  ],
  VendorMaster: [
    ["write", "Vendor identity", "Review / link / update vendor identity", [], "Vendor mutations are Admin/Owner-only; Parties Edit does not delegate these writes."],
  ],
};

const sensitiveWords = /approve|verify|payment|paid|post|import|delete|export|publish|restore|receive|issue|allocate|rebuild/i;
export function capabilitiesFor(functionId: string): ProposedCapability[] {
  const explicit = (definitions[functionId] ?? []).map(([id, group, label, sources, authority, restrictions]) => ({
    id: canonicalCapabilityId(functionId, id), group, label, sources,
    // Conservative on purpose: exact endpoint/branch acceptance is not proven.
    semantics: "conditional" as const, authority,
    restrictions: restrictions ?? "Assigned-site, ownership, lifecycle and existing business constraints apply.",
    sensitive: sensitiveWords.test(label),
  }));
  const node = functionById.get(functionId);
  if (!node || node.classification === "system" || node.classification === "legacy-unreachable") return explicit;
  // The complete endpoint ledger remains available, including API-only functions.
  // These are operation-scoped PROPOSALS, not inferred standard CRUD permissions.
  const operations = node.operations.map(name => {
    const evidence = operationByName.get(name);
    const sources: Cell[] = (evidence?.[2] ?? []).flatMap(([section, action]) =>
      isSection(section) ? [[section, action as Action] as Cell] : []);
    return {
      id: canonicalCapabilityId(functionId, `operation:${evidence?.[6] ?? name}`), group: "API operation proposals",
      label: name, sources, semantics: "conditional" as const,
      authority: evidence?.[3] === "privileged/conditional"
        ? "Observed privileged/conditional checks; do not infer OR/AND from the reference union. A matrix grant cannot delegate an Admin/Owner-only branch."
        : sources.length ? "Observed permission references only; do not infer OR/AND or full enforcement from this union."
          : "Authentication, legacy, self-service or unresolved authority. No independently configurable permission is proven.",
      restrictions: "Candidate caller matching is not a call-graph proof. Inspect the operation’s existing branch, scope, role and record rules.",
      sensitive: sensitiveWords.test(name) || !name.startsWith("GET "),
    };
  });
  return [...explicit, ...operations];
}
