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

Design choices fixed within the epic:

- **Externalize the bpmn-io stack** (bpmn-js, diagram-js, camunda-bpmn-js,
  properties-panel, preact, codemirror) as real `dependencies` rather than
  bundling — consumers writing custom bpmn-js plugins import these packages
  themselves and must share one instance. Externalizing also keeps
  bpmn.io-licensed code out of what we redistribute; the watermark
  requirement and third-party license notices still need documenting in the
  package README.
- **Split the shared types first** (#1371): `libs/modeler-types` holds the
  public, host-agnostic modeler types and browser utilities with no protocol
  dependency; `libs/shared` keeps the private webview↔host protocol. Only the
  former can ship with a published package.
- **The public API is the facade, not the protocol.** The semver commitment
  applies to the deliberately designed `createModeler` surface; the
  Query/Command message protocol stays internal and remains freely
  refactorable across all hosts in a single PR.
- **The package lives in a new root dir `packages/bpmn-modeler/`** (#1376),
  not `libs/` — preserving the invariant that everything in `libs/` is
  private and inlinable. Import direction: `packages` may import from `libs`
  only; `apps` may import from both; `libs` from neither. The future React
  adapter is the expected second resident of `packages/`.

The public API taxonomy (pure host-free / default + optional override /
capability-gated) and the opinionated-defaults corollary (e.g. linting on by
default) are deliberately **not** recorded here — they get their own ADR from
the API design pass (#1375).

## Alternatives considered

**Keep maintaining `camunda-web-modeler` as a parallel stack.** The status
quo; rejected — it froze at bpmn-js 17 because duplicating the feature set is
unaffordable.

**Publish the webview app as-is.** Rejected: its Query/Command postMessage
surface presumes a VS Code/IntelliJ-style host and is unusable as an
embeddable API.

**Publish the private `libs/*` individually.** Rejected: they are
implementation detail, not public API — publishing each one multiplies the
semver surface and forces consumers to keep a constellation of versions
aligned. They get inlined into the package's lib build instead.

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
- Version skew becomes possible between the package's externalized
  `dependencies` and the versions the monorepo hosts resolve. While both live
  in this repo the root lockfile keeps them aligned; once external consumers
  exist, keeping the ranges honest is a real coordination cost we accept.
