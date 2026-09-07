# 0022 — Minimap, token simulation, and the canvas focus reticle are mode-invariant

- Status: accepted
- Date: 2026-09-07
- Category: bpmn-webview

Amends [ADR 0014](0014-readonly-viewer-subpath.md) (`/viewer`),
[ADR 0016](0016-design-mode-subpath.md) (`/design`), and
[ADR 0018](0018-runtime-design-implement-mode.md) (runtime design/implement).

## Context

After the hosts gained the View / Design / Implement switch
([ADR 0021](0021-mode-session-subpath.md)), the three canvas-corner controls
differed per surface:

| Surface | Token simulation | Minimap | Focus reticle |
| --- | --- | --- | --- |
| Implement (`createModeler`) | shown | shown | shown |
| Design on a tagged model (`setMode("design")`) | hidden by CSS, stopped on entry | shown | shown |
| Design on an untagged model (`/design`) | not loaded | shown | shown |
| View (`/viewer`) | not loaded | not loaded | not installed |

Two decisions produced that spread. ADR 0016 kept `bpmn-js-token-simulation`
out of `/design` as part of "the Camunda editor stack", and ADR 0014 kept the
minimap out of `/viewer` for leanness. ADR 0018 then hid the simulation toggle
in design mode as engine chrome.

Both premises are wrong for these three modules. `diagram-js-minimap` and the
focus features are pure diagram-js. `bpmn-js-token-simulation` exercises plain
BPMN control-flow semantics — gateways, events, boundaries — with no Camunda
moddle or behaviour behind it, and ships a dedicated viewer module for readonly
hosts. Its audience is the person walking through a process, which is the
Design and View audience more than the Implement one. Hiding it in Design was
classifying by *where it was registered*, not by what it depends on.

The practical effect was that a recreate switch (anything involving View, or
Design on an untagged model) made the corner controls appear and disappear,
which reads as a bug rather than a mode change.

## Decision

The minimap, token simulation, and the canvas focus reticle are **canvas chrome
every surface shares**, not editor chrome:

- **`/viewer`** registers `diagram-js-minimap` (collapsed) and the readonly
  `bpmn-js-token-simulation/lib/viewer` module, and installs the same
  `installKeyboardFocus` / `installCanvasFocusIndicator` pair the editable
  surfaces do (search-pad ports inert — the viewer has none).
- **`/design`** registers the full `bpmn-js-token-simulation` module next to the
  minimap it already had.
- **`createModeler`'s design mode** no longer hides the toggle (the
  `[data-bpmn-mode="design"] .bts-toggle-mode` rule is removed) nor stops a
  running simulation on entry (the `stopTokenSimulation` port is removed from
  `ModePorts`). Design hides only the element-template chrome.
- **Stylesheets**: `viewer.css` gains the minimap, token-simulation, and
  focus-indicator sheets plus their dark overrides; `design.css` gains the
  token-simulation sheets.
- **Gates**: `check-design-pure-entry.mjs` and the design allowlist in
  `architecture.spec.ts` drop `bpmn-js-token-simulation` from the forbidden set.
  The remaining forbidden set — camunda-bpmn-js, the C7/C8 moddles and
  behaviours, transaction boundaries, element templates, the lint stack — is
  unchanged.

## Alternatives considered

**Keep token simulation Implement-only and hide it consistently elsewhere.**
Consistent, but it withholds the one tool a documentation-oriented user has to
sanity-check a flow, and it keeps the false "Camunda stack" classification.

**Un-hide it in tagged Design only.** Leaves untagged Design and View without
it; the corner chrome would still jump on every recreate switch.

**Register it host-side through `additionalModules`.** Every consumer would have
to re-discover the viewer/modeler module split and the stylesheet pairing; the
package owns the surfaces, so it owns their shared chrome.

## Consequences

- `/viewer` and `/design` bundles grow by the token-simulation module (and
  `/viewer` by the minimap). Both were already direct dependencies of the
  package; no new dependency.
- Simulation state does not survive a recreate switch — the instance is
  destroyed — and a live Design↔Implement toggle now leaves a running simulation
  running. Nothing in the mode session needs to know about simulation.
- The jsdom viewer spec keeps running: `vitest.config.ts` aliases
  `diagram-js-minimap` to its ESM build, sidestepping the CJS interop that
  ADR 0011 recorded as the modeler's jsdom blocker.
- Acceptance criterion "no token-simulation UI visible in design mode" from
  #1442 is withdrawn.
