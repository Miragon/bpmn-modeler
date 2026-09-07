# 0020 — Untagged BPMN documents are first-class in the hosts; mode is per-editor state

- Status: accepted (#1447)
- Date: 2026-09-06
- Category: cross-cutting

## Context

Epic #1438 ("one document, three modes") landed every package step — runtime
`mode`/`setMode` on `createModeler` ([ADR 0018](0018-runtime-design-implement-mode.md)),
the readonly `/viewer` ([ADR 0014](0014-readonly-viewer-subpath.md)), the
engine-neutral `/design` ([ADR 0016](0016-design-mode-subpath.md)), and public
view-state capture/restore — but the hosts never adopted them. The VS Code and
IntelliJ webview always ran `createModeler` in implement mode, and both hosts
**force-stamped an execution platform onto every untagged `.bpmn` on open**:
`BpmnDocument.detectPlatform()` threw `ExecutionPlatformNotDetectedError`, and
`BpmnModelerService.display` caught it, prompted for c7/c8, rewrote the XML, and
saved. A user could never keep a plain, engine-neutral diagram — opening one
mutated it.

This is the last roadmap step: bring the mode story to users without rewriting
their documents.

## Decision

**Untagged documents are a valid, non-exceptional state the hosts render
directly.** Four coupled choices:

1. **The hosts never stamp an execution platform on open.** `BpmnDocument`
   gains a non-throwing `detectEngine(): DetectedEngine` (the strict
   `detectEngine(xml)` plus the existing `xmlns:camunda`/`xmlns:zeebe`
   fallback); `detectPlatform()` becomes a throwing delegate kept only for the
   consumers that legitimately require an engine (deployment, lint config,
   status bar, `changeEngineVersion`). `BpmnModelerService.display` routes on
   `detectEngine()` and its re-prompt/rewrite branch is deleted.

2. **`BpmnFileQuery.engine` becomes `DetectedEngine` (`Engine | undefined`).**
   It is the only host message guaranteed before surface construction, so it
   also carries an optional `defaultMode` seed. The published
   `BpmnModelerSetting` type stays host-free.

3. **Mode is per-editor webview state, never written into the XML.** The
   webview persists `WebviewState.mode` and resolves the initial mode as
   `saved mode → host defaultMode → defaultMode(engine)` via
   `resolveInitialMode`. A new `miragon.bpmnModeler.defaultMode`
   (`implement | design | view`, default `implement`) seeds a first-ever open;
   `implement` on an untagged model falls back to Design.

4. **The new-file picker offers an engine-neutral scaffold.** The `PickerPort`
   swaps `pickExecutionPlatform` for `pickNewModelEngine(): NewModelEngine`
   (`Engine | "neutral"`); `BpmnDocument.forNewModel(choice)` builds the
   c7/c8 scaffold or an untagged one (`emptyEngineNeutral`, `isExecutable="false"`,
   no `modeler:*`/camunda/zeebe metadata). IntelliJ reuses the core empty-file
   branch through the bridge picker — no Kotlin picker work.

## Alternatives considered

**Stamp-on-open (status quo).** Rejected: it mutates a document the user never
asked to change and makes an engine-neutral diagram impossible to keep. The
whole point of Design mode is to author without an engine.

**Mode written into the XML.** A `modeler:*` marker or comment would make mode
travel with the file. Rejected: mode is a per-editor *view* preference, not a
property of the document — two side-by-side tabs on the same file may want
different modes, and a diff/blame should not churn on a view toggle.

**Settings-only mode (no per-editor persistence).** A single global setting is
simpler but loses each editor's chosen mode across a tab-switch rebuild.
Rejected: the setting is the *seed*, per-editor state is the memory.

## Consequences

- Opening any untagged `.bpmn` lands in Design with Implement greyed out
  (tooltip), and nothing is written back. `changeEngineVersion` on an untagged
  model informs and no-ops instead of throwing.
- The mode strip + panel mount are created by the webview at runtime inside the
  host's empty `#js-properties-panel` — all three shells stay untouched. This
  builds on [ADR 0019](0019-webview-panel-chrome-in-shared.md): the mode model
  and strip live in `libs/shared` alongside the resizer.
- `pickExecutionPlatform` has no callers after this change and is removed from
  the port and every adapter (`VsCodePicker`, `RpcPicker`).
- Amends [ADR 0016](0016-design-mode-subpath.md) and
  [ADR 0018](0018-runtime-design-implement-mode.md): the design/implement
  surfaces they introduced are now user-reachable, selected per editor rather
  than only by the demo.
