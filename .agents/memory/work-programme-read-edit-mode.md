---
name: Work Programme read/edit mode (029A)
description: StretchRow read vs deliberate edit mode, one-editor guard, toolbar consolidation, return-context restore
---

# Work Programme professionalisation (Instruction 029A)

- `StretchRow` in `WorkProgramme.tsx` has two branches: read mode (compact summary, warnings only when triggered, hover actions + persistent ⋯ DropdownMenu) and edit mode (all inputs local until explicit Save; **no onBlur autosaves anywhere** — do not reintroduce them).
- AUTO/FIX duration toggle is local-only in edit mode; commits only on Save.
- Priority = Batch 029 `sequenceOrder`, editable in edit mode ("P" input), shown as P-badge in read mode; flows through the generic bar PATCH unchanged.
- Parent `InlineGanttTable` enforces one active editor: `editingBarId` + `StretchEditorApi` (save/cancel/isDirty) registered via refs (`saveRef.current = save` each render). Save/Discard/Stay dialog on row switch.
- **Save & switch pattern:** row switch happens only when the editor actually closes — `pendingSwitchRef` consumed inside `closeEdit`; `save()` returns false when blocked by validation so the dialog stays.
- Leave guards: `beforeunload` while editing+dirty; `editorGuardRef` prop lets the page confirm before tab change or toolbar Link navigation (wouter has no route-blocking API, so guards are per-exit-point).
- Toolbar layout is stable: buttons always rendered, disabled with tooltip reasons; structure actions live in a Structures ▾ menu with attention badge; Auto-build recipes under ⋯ More.
- Return context: activeTab + gantt scroll saved per-project in sessionStorage (`wp-tab-<id>`, `wp-scroll-<id>`); restore flags must reset on projectId change (component doesn't remount on param change).
- `npx tsc --noEmit` has 2 pre-existing WorkProgramme errors (EquipmentProductivity name, Set spread) — CLI-target noise, not vite failures.

**Why:** field users kept losing edits and mis-clicking permanent icon rows; the deliberate-edit model is a product decision — keep new stretch fields inside the edit branch and read-only summaries in the read branch.
