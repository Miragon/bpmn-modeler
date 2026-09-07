# 0023 — Opt-in linting on `/design` and per-mode lint configs

- Status: accepted
- Date: 2026-09-07
- Category: bpmn-webview

Amends [ADR 0013](0013-injectable-lint-stack.md) (injectable lint stack),
[ADR 0016](0016-design-mode-subpath.md) (`/design`), and
[ADR 0018](0018-runtime-design-implement-mode.md) (runtime design/implement).

## Context

Linting was reachable only on the root `createModeler` — Implement-oriented and
engine-aware. Two gaps followed from the View / Design / Implement switch
([ADR 0021](0021-mode-session-subpath.md)):

| Surface | Linting before |
| --- | --- |
| Implement (`createModeler`) | engine-aware config, in-page or host-pushed |
| Design on a tagged model (`setMode("design")`) | **same** engine-aware config |
| Design on an untagged model (`/design`) | **none** — compile-rejected |
| View (`/viewer`) | none |

The `/design` surface rejected `linting` outright, so an untagged document under
`/design` got no structural/layout feedback at all. And a Camunda-tagged model
toggled into Design kept linting with the full engine config, surfacing
`camunda-compat` deployability findings the engine-neutral Design properties
panel cannot even act on — noise the user can neither fix nor dismiss from that
surface.

Both stem from treating linting as engine chrome. But the structural and
modeling rules (`bpmnlint:recommended`, the Miragon modeling layer) are
engine-neutral; only the Camunda deployability layer is engine-bound. Linting
belongs to the same *injection-only* seam as the root ([ADR 0013](0013-injectable-lint-stack.md)):
nothing turns it on by itself, but a surface that a host opts into should lint
with the config that matches its mode.

## Decision

Linting becomes mode-aware and available on `/design` through the existing
injection seam:

- **`/design` gains `linting`** — the same injection-only option the root has.
  Omitted or `false` pulls zero lint bytes; a `module` from
  `@miragon/bpmn-modeler/lint` opts in. The designer also gains `onLintResults`
  / `onLintingToggled` and the three lint handle methods (`applyLintResults`,
  `applyLintingDisabled`, `startInPageLinting`), keeping `BpmnDesignerHandle` a
  signature subset of `BpmnModelerHandle`.
- **Per-mode config.** `LintingOptions.config` accepts either a single
  `BpmnlintConfig` (applied verbatim in both modes) or a `{ design?, implement? }`
  map. One `createModeler` instance can lint Design and Implement differently,
  re-resolved on each `setMode`.
- **Per-mode zero-config default.** Omitted config resolves to
  `getDefaultLintConfig({ engine: mode === "implement" ? engine : undefined, preset: "modeling" })`:
  Design drops the Camunda engine (deployability) layer; Implement keeps today's
  engine-aware default.
- **Workspace config is mode-invariant.** A host-handed `.bpmnlintrc` (via
  `startInPageLinting`) applies to both modes unchanged; a `setMode` while it is
  active only stores the mode.
- **A live Design↔Implement toggle re-resolves in-page.** `applyMode` gains a
  `setLintMode` port (order: filter → attribute → lint → notify) that rebuilds
  the in-page linter for the new mode. The findings reach the host through the
  existing `UpdateLintResultsCommand` echo — no new protocol message.
- **The webview routes lint to either editable surface.** A new `isLintingHandle`
  guard (`"applyLintResults" in handle`) replaces `isModelerHandle` on the four
  lint paths; the design factory receives the same lint options as implement.
- **Viewer stays lint-free.** Out of scope.

The `LintTierInit` shape change (`engine?`, `mode`, `config` widened to the
per-mode option) is internal to the `/lint` entry. Purity is unchanged: the
config resolver lives in the `/lint` subpath, the designer references only the
lint *types*, so `check-design-pure-entry.mjs` and `check-lint-free-entry` stay
green with no allowlist edits.

## Alternatives considered

**Per-mode `.bpmnlintrc` resolved host-side.** The host would pick a different
workspace config per mode. It pushes mode awareness into every host adapter and
still cannot serve the zero-config untagged Design case (there is no file to
resolve); the package already owns the mode, so it owns the default.

**An automation preset for Implement.** Lint tagged models against
`recommended-for-automation`. Rejected: generated-id rules would error on
essentially every existing hand-authored diagram, turning linting into noise on
first open.

**Keep Design lint-free.** Simplest, but withholds structural/layout feedback
from exactly the documentation-oriented audience `/design` targets.

## Consequences

- A Design↔Implement toggle on a tagged in-page model runs one extra lint pass
  (rebuild + relint). Cheap; no DOM churn beyond the overlay diff the vendor
  already does.
- `design.css` grows by the lint chrome (the vendor `bpmn-js-bpmnlint` sheet plus
  the internal `bpmnlint.css`). Both are hide-until-configured, so a designer
  without injected linting shows nothing.
- Hosts (VS Code, IntelliJ, bridge) need no change: their lint config service is
  already engine-agnostic and answers an untagged document with the payload-free
  in-page tier, which the webview resolves to the engine-neutral Design default.
- `BpmnlintConfig` remains the wire type for a host-pushed config; the per-mode
  map is a package-side authoring convenience, never serialized to a host.
