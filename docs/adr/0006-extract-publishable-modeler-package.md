# 0006 — Extract the host-free modeler composition into a publishable npm package

- Status: accepted
- Date: 2026-08-27 (epic #1293, in progress; decision retrospectively recorded at ADR bootstrap)
- Category: bpmn-webview

## Context

`apps/bpmn-webview` has grown into the single source of truth for the BPMN
modeling features (bpmnlint, token simulation, append menu, code-link, script
editors, diff viewer, theming), but it is a `private` app whose only
interface is the Query/Command postMessage protocol — too host-specific to
publish. Meanwhile the published embeddable modeler
([`Miragon/camunda-web-modeler`](https://github.com/Miragon/camunda-web-modeler))
went stale precisely because it duplicates this stack instead of sharing it.

The cut line already exists: the modeler facade and feature modules have zero
host references; host coupling is concentrated in the bootstrap/message
dispatch layer, and `apps/demo-webapp` proves the injected-host consumption
pattern.

## Decision

Invert the layering (epic #1293): extract the host-free modeler composition —
facade, feature modules, inlined private libs, themes — into a publishable
npm package (working name `@miragon/bpmn-modeler`), and turn
`apps/bpmn-webview` into a thin host adapter that adds only the VS Code /
IntelliJ-specific parts (Query/Command dispatch, `HostApi`, webview state
persistence, HTML shell).

Two design choices within the epic:

- **Externalize the bpmn-io stack** (bpmn-js, diagram-js, camunda-bpmn-js,
  properties-panel, preact, codemirror) as real `dependencies` rather than
  bundling — consumers writing custom bpmn-js plugins import these packages
  themselves and must share one instance.
- **Split the shared types first** (#1371): `libs/modeler-types` holds the
  public, host-agnostic modeler types and browser utilities with no protocol
  dependency; `libs/shared` keeps the private webview↔host protocol. Only the
  former can ship with a published package.

## Alternatives considered

**Keep maintaining `camunda-web-modeler` as a parallel stack.** The status
quo; rejected — it froze at bpmn-js 17 because duplicating the feature set is
unaffordable.

**Publish the webview app as-is.** Rejected: its Query/Command postMessage
surface presumes a VS Code/IntelliJ-style host and is unusable as an
embeddable API.

## Consequences

- External consumers (including a future thin React adapter in
  `camunda-web-modeler`) get the actively maintained feature stack; features
  land once.
- The package's public surface becomes a compatibility contract we must
  version — the private "change anything anytime" freedom shrinks to the
  bpmn-webview adapter.
- Private libs that get inlined lose their independent workspace identity.
- Moving Vite-app modules into tsc-checked libraries surfaces latent type
  errors even on pure renames; each extracted lib's own `tsc` build must pass
  before a move counts as clean.
