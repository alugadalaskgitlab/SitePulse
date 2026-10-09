import { useMemo, useState, type ReactNode } from "react";
import {
  ACTIONS, ACTION_LABELS, SECTION_LABELS, type PermissionMatrix, type SectionKey, type Action,
} from "@shared/permissions";
import {
  inventory, operationByName, availableActions, capabilityPreview,
  changedCells, previewChanges, editLegacyCell, isSection, legacyBitExplanation,
  nodeMatches, commonRestrictions, tooltipFor, cellLabel, isRetainedUnwired,
  type PreviewOverrides, type ExplorerFilter, type ProposedCapability, type FunctionNode,
} from "./model";
import { capabilitiesFor } from "./capabilities";
import "./permissions.css";

export type AuthorityTarget = {
  fullName?: string; businessRole?: string | null; isAdmin?: boolean; isOwner?: boolean;
  isFieldEngineer?: boolean; notificationsEnabled?: boolean; canManagePermissions?: boolean;
  permissionManagerScope?: string | null; canUnlockRecords?: boolean;
};
export type HierarchicalPermissionsEditorProps = {
  baseline: PermissionMatrix;
  value: PermissionMatrix;
  onChange?: (matrix: PermissionMatrix) => void;
  canGrant?: (section: SectionKey, action: Action) => boolean;
  target?: AuthorityTarget;
  previews?: PreviewOverrides;
  onPreviewsChange?: (overrides: PreviewOverrides) => void;
  onReviewed?: (signature: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
  siteSummary?: ReactNode;
  context?: "existing" | "creation";
  conflict?: boolean;
};

const filterLabels: [ExplorerFilter, string][] = [
  ["all", "All"], ["allowed", "Stored grants: on"], ["denied", "Stored grants: off"],
  ["changed", "Changed"], ["conflicts", "Conflicts"],
];
const sensitiveSection = (section: SectionKey) =>
  /admin|manage|data_sync|device|rate_cards|reconciliation|permission|user_management|stores_inventory|plant_materials|plant_equipment|plant_production|site_procurement|site_diesel/.test(section);

function CapabilityCard({ capability, props, previews, setPreview }: {
  capability: ProposedCapability; props: HierarchicalPermissionsEditorProps;
  previews: PreviewOverrides; setPreview: (id: string, choice: "inherit" | "allow" | "deny") => void;
}) {
  const choice = previews[capability.id] ?? "inherit";
  const result = capabilityPreview(capability, props.baseline, props.value, choice);
  return <div className="authority-action" data-testid={`capability-${capability.id}`}>
    <div className="authority-action-top">
      <div><h4>{capability.label}</h4><p className="authority-meta">{capability.id}</p></div>
      <label>
        <span className="authority-meta block">Proposed only</span>
        <select aria-label={`${capability.label} proposed override`} value={choice}
          disabled={props.disabled}
          onChange={event => setPreview(capability.id, event.target.value as "inherit" | "allow" | "deny")}>
          <option value="inherit">Inherit</option><option value="allow">Allow</option><option value="deny">Deny</option>
        </select>
      </label>
    </div>
    {capability.sensitive && <span className="authority-chip">Sensitive workflow</span>}
    <div className="authority-explanation">
      <p><strong>Current:</strong> {result.current}</p>
      <p><strong>Draft matrix:</strong> {result.draft}</p>
      <p><strong>Proposed:</strong> {result.proposed}</p>
      <p><strong>Effective preview:</strong> {result.effective}</p>
    </div>
    <p><strong>Authority:</strong> {capability.authority}</p>
    <p><strong>Current sources:</strong> {capability.sources.map(cellLabel).join("; ") || "No independent matrix source established."}</p>
    <p><strong>Enabled draft sources:</strong> {result.draftSources.map(cellLabel).join("; ") || "None of the listed sources."}</p>
    <p><strong>Restrictions:</strong> {capability.restrictions}</p>
    {(props.target?.isAdmin || props.target?.isOwner) &&
      <p className="authority-note authority-warning">Privileged bypass may apply; Admin and Owner parity differs by operation. This preview cannot restrict it.</p>}
    {choice !== "inherit" && <p role="status" className="authority-note authority-warning">
      {choice === "deny" ? "Not revoked." : "Not granted."} This override is a local simulation. Saving existing permissions will not serialize or enforce it.
    </p>}
  </div>;
}

export function HierarchicalPermissionsEditor(props: HierarchicalPermissionsEditorProps) {
  const { baseline, value, target, readOnly = false, disabled = false } = props;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ExplorerFilter>("all");
  const [selected, setSelected] = useState("SiteRequirementsList");
  const [localPreviews, setLocalPreviews] = useState<PreviewOverrides>({});
  const [review, setReview] = useState(false);
  const previews = props.previews ?? localPreviews;
  const changes = changedCells(baseline, value);
  const proposedChanges = previewChanges(previews);
  const canGrant = props.canGrant ?? (() => false);
  function setPreview(id: string, choice: "inherit" | "allow" | "deny") {
    const next = { ...previews };
    if (choice === "inherit") delete next[id]; else next[id] = choice;
    setLocalPreviews(next);
    props.onPreviewsChange?.(next);
    setReview(false);
  }
  function edit(section: SectionKey, action: Action, enabled: boolean) {
    if (readOnly || disabled) return;
    props.onChange?.(editLegacyCell(value, section, action, enabled, canGrant));
    setReview(false);
  }
  const visible = useMemo(() => inventory.functions.filter(node =>
    nodeMatches(node, search, filter, baseline, value, previews)), [search, filter, baseline, value, previews]);
  const hubs = useMemo(() => {
    const result = new Map<string, Map<string, FunctionNode[]>>();
    for (const node of visible) for (const [hub, module] of node.locations) {
      if (!result.has(hub)) result.set(hub, new Map());
      const modules = result.get(hub)!;
      if (!modules.has(module)) modules.set(module, []);
      modules.get(module)!.push(node);
    }
    return result;
  }, [visible]);
  const node = visible.find(n => n.id === selected) ?? visible[0];
  const capabilities = node ? capabilitiesFor(node.id) : [];
  const capabilityGroups = Array.from(new Set(capabilities.map(c => c.group)));
  const nodeControls = node?.controls.map(i => inventory.controls[i]) ?? [];
  const tabs = nodeControls.filter(c => c[1] === "TabsTrigger");
  const actions = nodeControls.filter(c => !["TabsTrigger", "DialogTitle", "AlertDialogTitle", "SelectItem"].includes(c[1]));
  const dialogs = nodeControls.filter(c => ["DialogTitle", "AlertDialogTitle", "SelectItem"].includes(c[1]));
  const previewLabels = useMemo(() => new Map(inventory.functions.flatMap(n =>
    capabilitiesFor(n.id).map(c => [c.id, c.label] as const))), []);

  return <section className="authority-editor" aria-label="Hierarchical permissions editor" data-testid="hierarchical-permissions-editor">
    <header className="authority-header">
      <p className="authority-kicker">Authority workbench / Phase 2B</p>
      <h3>{target?.fullName ? `${target.fullName} — functions & authority` : "Functions & authority"}</h3>
      <p>Hub → tile / module → function / subfunction → actions. Shared entries use one matrix and one preview state.</p>
      <div className="mt-2">
        <span className="authority-chip">{inventory.counts.routes} routes</span>
        <span className="authority-chip">{inventory.counts.tiles} tile declarations</span>
        <span className="authority-chip">{inventory.counts.operations} HTTP operations</span>
        <span className="authority-chip">92 sections / 736 stored cells</span>
        <span className="authority-chip">{changes.length} legacy edits</span>
        <span className="authority-chip">{proposedChanges.length} preview-only choices</span>
      </div>
      <p>Designation: <strong>{target?.businessRole || "Not designated"}</strong> · Administrator: {target?.isAdmin ? "on" : "off"} · Owner: {target?.isOwner ? "on (read-only)" : "off"} · Field user: {target?.isFieldEngineer ? "on" : "off"}</p>
      <p>Permission manager: {target?.canManagePermissions ? `on (${target.permissionManagerScope ?? "unspecified"})` : "off"} · Record unlock: {target?.canUnlockRecords === undefined ? "not reported — unchanged" : target.canUnlockRecords ? "on" : "off"}</p>
      {props.siteSummary ?? <p>Site access is managed separately using the existing Site Access workflow.</p>}
      {(target?.isAdmin || target?.isOwner) && <p className="authority-note authority-warning" role="note">
        Privileged account: ordinary permission switches cannot restrict existing Administrator/Owner bypass. A nominal Deny is never a real revocation here. Owner promotion is not available.
      </p>}
      {target?.isFieldEngineer && <p className="authority-note authority-warning">Field-user restrictions hide Payables Preview and Dispatches Today, including conflicting Admin/Owner accounts. No flags are automatically changed.</p>}
      {props.conflict && <p role="alert" className="authority-note authority-warning">The loaded server matrix differs from the initial snapshot. Save is blocked by the host; preserve your draft and reload/discard deliberately. The current API has no atomic version token.</p>}
      {readOnly && <p className="authority-note">{props.context === "creation" ? "Creation preview uses the applied template and existing setup contract. Individual persisted edits are available after creation through this same editor. Proposed choices below are never part of account setup." : "Read-only review. Persisted controls cannot be edited."}</p>}
    </header>
    <div className="authority-toolbar">
      <input type="search" aria-label="Search functions and actions" placeholder="Search function, action, route or permission…" value={search} onChange={e => setSearch(e.target.value)} />
      <select aria-label="Filter authority" value={filter} onChange={e => setFilter(e.target.value as ExplorerFilter)}>
        {filterLabels.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      <span aria-live="polite">{visible.length} canonical nodes</span>
    </div>
    <p className="px-4 py-2 authority-meta">Allowed / Denied filters inspect stored bits, not authenticated runtime access. Conflicts include inactive grants, retained OR paths and unresolved authority.</p>
    <div className="authority-layout">
      <nav className="authority-tree" aria-label="Permission hierarchy">
        {Array.from(hubs).map(([hub, modules]) => <details key={hub} open={!!search || hub === "Site Operations"}>
          <summary>{hub} <span className="authority-meta">({Array.from(modules.values()).flat().length})</span></summary>
          {Array.from(modules).map(([module, functions]) => <details key={module} className="authority-module" open={!!search || functions.some(n => n.id === node?.id)}>
            <summary>{module}</summary>
            {functions.map(fn => <button key={fn.id} type="button" aria-pressed={node?.id === fn.id} onClick={() => setSelected(fn.id)}>
              {fn.label}<span className="authority-meta block">{fn.classification === "stored-bits" ? "Persisted control" : `${fn.controls.length} controls · ${fn.operations.length} APIs`}</span>
            </button>)}
          </details>)}
        </details>)}
        {!visible.length && <div className="authority-empty"><h4>No matching functions</h4><p>Try a route, workflow or stored key.</p><button type="button" onClick={() => { setSearch(""); setFilter("all"); }}>Clear search & filters</button></div>}
      </nav>
      <div className="authority-detail">
        {node && <>
          <p className="authority-kicker">{node.locations[0]?.join(" / ")}</p>
          <h3>{node.label}</h3>
          <p className="authority-meta">{node.id} · {node.classification} · {node.file}</p>
          {node.routes.map(([route, source]) => <p key={String(route)} className="authority-meta">{String(route)} — {String(source)}</p>)}
          {node.locations.length > 1 && <p className="authority-note">Shared entry points: {node.locations.map(l => l.join(" → ")).join("; ")}. All changes use the same canonical state.</p>}
          <p className="authority-note">{commonRestrictions}</p>
          {node.classification === "legacy-unreachable" && <p className="authority-note authority-warning">Legacy source is not reachable from App’s import graph. No active capability is fabricated.</p>}
          {node.classification === "api-only" && <p className="authority-note authority-warning">API-only / no direct literal caller linked. This is inventory coverage, not a new user-facing workflow or proof of delegation.</p>}
          {tabs.length > 0 && <details className="authority-section" open>
            <summary>Tabs / nested views ({tabs.length})</summary>
            {tabs.map((control, i) => <p key={i}><span className="authority-chip">{control[0]}</span><span className="authority-meta">{control[2]}{control[3] ? " · dynamic label; source review required" : ""}</span></p>)}
            <p>Tabs are presentation evidence; not all tabs have independent authority.</p>
          </details>}
          {node.sections.filter(isSection).map(section => <details key={section} className="authority-section" open>
            <summary>Persisted controls — {SECTION_LABELS[section]}</summary>
            <p className="authority-meta">Existing storage key: {section}. Changing a shared bit can affect other functions; no dependency is silently granted.</p>
            {!readOnly && !sensitiveSection(section) && <button type="button" disabled={disabled} onClick={() => {
              let next = value;
              for (const action of availableActions(section).filter(a => ["view", "create", "edit"].includes(a))) {
                next = editLegacyCell(next, section, action, true, canGrant);
              }
              props.onChange?.(next); setReview(false);
            }}>Grant routine View / Create / Edit in this named section</button>}
            {ACTIONS.map(action => {
              const retainedUnwired = isRetainedUnwired(section, action);
              const available = availableActions(section).includes(action) && !retainedUnwired;
              const explanation = legacyBitExplanation(value, section, action);
              const active = !!value[section]?.[action];
              const isChanged = !!baseline[section]?.[action] !== active;
              const cellEvidence = inventory.cells.find(c => c[0] === section && c[1] === action);
              return <div className="authority-action" key={action}>
                <div className="authority-action-top">
                  <label>{available ? <input type="checkbox" aria-label={`${SECTION_LABELS[section]} — ${ACTION_LABELS[action]}`}
                    checked={active} disabled={readOnly || disabled || !canGrant(section, action)}
                    onChange={e => edit(section, action, e.target.checked)} /> : <span className="authority-chip">Unavailable</span>}
                    <strong>{ACTION_LABELS[action]}</strong></label>
                  <span className="authority-chip">{isChanged ? "Changed" : "Unchanged"}{!available && active ? " · retained inactive bit: on" : ""}</span>
                </div>
                <p>{retainedUnwired ? "Retained legacy/unwired control: no implemented controlled page. Existing stored value is preserved, not represented as a working grant." : tooltipFor(section, action)}</p>
                <div className="authority-explanation">
                  <p><strong>Current bit:</strong> {baseline[section]?.[action] ? "on" : "off"}</p>
                  <p><strong>Proposed persisted bit:</strong> {active ? "on" : "off"}</p>
                </div>
                <p><strong>Source:</strong> {section}.{action} · {explanation.label}</p>
                {explanation.alternatives.length > 0 && <p className="authority-note authority-warning"><strong>{explanation.stillAllowed ? "Still allowed via " : "Alternative authority: "}</strong>{explanation.alternatives.map(cellLabel).join("; ")} on compatible paths. Off does not prove revocation.</p>}
                {target?.notificationsEnabled === false && action === "notify" && active && <p className="authority-note authority-warning">Account notifications are disabled; eligibility alone does not deliver messages.</p>}
                {available && !canGrant(section, action) && !readOnly && <p>You cannot change this grant under the delegation ceiling.</p>}
                <p className="authority-meta">Evidence: permission-evidence.csv row {cellEvidence?.[4] ?? "not found"}{Array.isArray(cellEvidence?.[3]) && cellEvidence[3].length ? ` · ${(cellEvidence[3] as string[]).join("; ")}` : " · no observed enforcement reference"}</p>
              </div>;
            })}
          </details>)}
          {capabilityGroups.map(group => <details key={group} className="authority-section" open={group !== "API operation proposals"}>
            <summary>{group} — proposed independent capabilities ({capabilities.filter(c => c.group === group).length})</summary>
            {capabilities.filter(c => c.group === group).map(capability =>
              <CapabilityCard key={capability.id} capability={capability} props={props} previews={previews} setPreview={setPreview} />)}
          </details>)}
          {[[actions, "Workflow controls"], [dialogs, "Dialogs & choices"]].map(([list, title]) => {
            const controls = list as typeof nodeControls;
            return controls.length ? <details key={String(title)} className="authority-section">
              <summary>{String(title)} — source inventory ({controls.length})</summary>
              <p>These are observed UI declarations, not one permission per button. Dynamic labels are retained by provenance, not executed. Current branch visibility is not established by this editor.</p>
              {controls.map((control, i) => <p key={i} className="authority-action">
                <strong>{control[0]}</strong> <span className="authority-chip">{control[1]}</span>
                <span className="authority-meta block">{control[2]} · frontend-controls.csv row {control[4]}{control[3] ? " · dynamic / needs source resolution" : ""}</span>
              </p>)}
            </details> : null;
          })}
          {node.operations.length > 0 && <details className="authority-section">
            <summary>Operation provenance ({node.operations.length})</summary>
            {node.operations.map(name => {
              const evidence = operationByName.get(name);
              return <p className="authority-action" key={name}><strong>{name}</strong>
                <span className="authority-meta block">{evidence?.[1]} · function-action-matrix.csv row {evidence?.[6]} · {evidence?.[3]} · {evidence?.[5]}</span>
              </p>;
            })}
          </details>}
          {node.classification === "system" && <details className="authority-section" open>
            <summary>System-only evidence — no per-user execution switches</summary>
            <p>Background schema/setup, backfills, timers and notification fan-out are not user capabilities. Notification records are not broadcasts. Receive Notifications remains a separate existing bit.</p>
            {inventory.systems.filter(s => node.id === `system:${s[1]}`).map((row, i) =>
              <p className="authority-action" key={i}><strong>{row[0]}</strong><span className="authority-meta block">{row[2]} · {row[3]} row {row[4]}</span></p>)}
          </details>}
        </>}
      </div>
    </div>
    <footer className="authority-footer">
      <p>Legacy bits may be saved by the existing workflow. Inherit / Allow / Deny is <strong>never saved or enforced</strong>.</p>
      <button type="button" onClick={() => setReview(!review)} aria-expanded={review}>Review {changes.length} legacy + {proposedChanges.length} proposed-only changes</button>
    </footer>
    {review && <section className="authority-review" aria-label="Permission change review">
      <h4>Actual persisted changes</h4>
      <p>Opening, searching and previewing do not save. Account flags, sites, passwords and hidden bits outside explicit changes remain unchanged.</p>
      <ul>{changes.map(change => {
        const explanation = legacyBitExplanation(value, change.section, change.action);
        return <li key={`${change.section}.${change.action}`}><strong>{change.after ? "Grant bit" : "Remove bit"}</strong> — {SECTION_LABELS[change.section]} / {ACTION_LABELS[change.action]} ({change.before ? "on" : "off"} → {change.after ? "on" : "off"})
          {!change.after && <span className="block">{explanation.stillAllowed ? `Still allowed on compatible paths via ${explanation.alternatives.map(cellLabel).join("; ")}.` : "No listed compatibility alternative enabled; this does not prove endpoint revocation."}</span>}
        </li>;
      })}{!changes.length && <li>No persisted matrix changes.</li>}</ul>
      <h4>Proposed-only overrides — excluded from saving</h4>
      <ul>{proposedChanges.map(([id, choice]) => <li key={id}>{previewLabels.get(id) ?? id}: <strong>{choice}</strong> — simulation only, not enforced.</li>)}
        {!proposedChanges.length && <li>No proposed-only overrides.</li>}</ul>
      {props.onReviewed && <button type="button" className="authority-primary" disabled={disabled || props.conflict} onClick={() => props.onReviewed?.(JSON.stringify(value))}>Confirm legacy change review</button>}
      <details className="authority-section"><summary>Inventory coverage & provenance</summary>
        <p>{inventory.counts.pages} page files; {inventory.counts.controls} UI declarations ({inventory.counts.dynamicControls} dynamic labels); {inventory.counts.apiOnly} API-only nodes; {inventory.counts.background} background and {inventory.counts.notifications} notification call sites.</p>
        <p>{inventory.counts.navigationConfigurations} navigation configurations; {inventory.counts.navigationLinks} links; {inventory.counts.frontendApiCalls} client API call sites (provenance only, no handler bodies).</p>
        <details className="authority-section"><summary>All tile declarations and canonical targets</summary>
          {inventory.tiles.map((tile, i) => <p key={i}>{tile[0]} → {tile[1] || "dynamic destination"}<span className="authority-meta block">{tile[2]} · hub-tiles.csv row {tile[4]} · {Array.isArray(tile[3]) ? (tile[3] as string[]).join(", ") || "Unresolved destination" : ""}</span></p>)}
        </details>
        <details className="authority-section"><summary>Navigation configuration evidence</summary>
          {inventory.navigation.map((row, i) => <p key={i}>{row[0]} → {row[1] || "dynamic destination"}<span className="authority-meta block">{row[2]} · navigation-configurations.csv row {row[3]}</span></p>)}
        </details>
        <p>Dynamic labels, branch conditions, unmatched callers and authenticated effective access require further verification. Full discovery coverage does not mean full independent enforcement.</p>
        <p>Projection source hashes (SHA-256):</p>
        {Object.entries(inventory.provenance).map(([file, hash]) => <p key={file} className="authority-meta">{file}: {hash}</p>)}
      </details>
    </section>}
  </section>;
}
