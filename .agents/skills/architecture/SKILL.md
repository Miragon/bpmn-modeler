---
name: architecture
description: High-level architecture and code-placement guide for the publishable BPMN/DMN modeler packages, reusable libraries, webview adapters, and VS Code, IntelliJ, and Theia/Electron hosts. Use when implementing, debugging, reviewing, or refactoring package boundaries, public APIs, host/core features, capability ports, feature wiring, editor sessions, deployment, webview protocols, or architecture tests.
---

# Modeler architecture

Locate the owning layer before changing code. The
[architecture overview](../../../docs/vscode/contributing/architecture-overview.md)
provides platform and editor-flow diagrams. Paths below are repository-relative;
verify details against source because older guides and ADRs may be outdated.

## Place the change

| Concern | Owner and starting point |
| --- | --- |
| Embeddable BPMN behavior and public API | `packages/bpmn-modeler/src/`; start with `index.ts` and `publicApi.ts`. Viewer, designer, mode-session, diff, and lint have separate subpaths. |
| Embeddable DMN behavior and public API | `packages/dmn-modeler/src/`; start with `index.ts` and `publicApi.ts`. |
| Reusable browser features | Feature libraries under `libs/`, composed by the modeler packages. |
| Public-facing types and browser utilities | `libs/modeler-types`; keep the surface suitable for publication. |
| Private messages and webview chrome | `libs/shared/src/lib/`; base/sync messages in `messages.ts`, feature payloads in their corresponding files, host channel in `host.ts`. |
| Host-independent domain logic and services | Feature folders in `libs/modeler-core/src/`; consumers use its `index.ts`. |
| IDE protocol-to-modeler adaptation | `apps/bpmn-webview/src/bootstrap.ts`, `apps/dmn-webview/src/bootstrap.ts`; direct embedding examples in `apps/demo-webapp`. |
| Form editing and deployment UI | `apps/form-webview`; `apps/deployment-webview`, whose markup lives in `src/app/formTemplate.ts`. |
| Host integration and lifecycle | `apps/vscode-plugin/src/main.ts` and `src/composition/`; `apps/modeler-bridge/src/bridge.ts` and `src/composition/`; Kotlin host in `apps/intellij-plugin`. |

## Preserve the boundaries

- Let applications consume packages and libraries, and packages consume reusable
  libraries. Keep libraries independent of applications and modeler packages.
  Private browser libraries are inlined into published packages; upstream stacks
  remain npm dependencies.
- Keep `modeler-core` and `shared` out of published browser code. Put protocol
  adaptation in webview bootstraps. `modeler-types` holds publishable concepts;
  DOM-id-coupled panel chrome and host-theme adaptation belong in `shared`.
- Add host-independent logic to the core's feature-oriented domain/service
  layers. Reach host facilities through the core's `shared/domain/hostPorts.ts` and editor
  handles; deployment engine ports are separate. Wire concrete adapters in the
  applications using constructor composition.
- Preserve factory/handle API compatibility and package exports. Supply optional
  BPMN capabilities through ports; keep linting injectable and browser themes
  container-scoped. Use feature barrels for cross-feature access.

Check `architecture.spec.ts` in both modeler packages, `libs/modeler-core/src`,
and `apps/vscode-plugin/src`, plus root `eslint.config.cjs`. Package gates protect
import direction and theme isolation. Core checks reject VS Code and transitive
host-module imports; this does not make the core browser-safe. VS Code checks
cover host isolation, cycles, and selected feature-barrel boundaries.

## Trace host and session behavior

VS Code runs the core in-process. Standalone loads that extension through
Theia/Electron, with shell customizations in `libs/standalone-extension`.
IntelliJ renders BPMN in JCEF, relaying messages through a Bun stdio JSON-RPC
bridge running the core. Mirrors provide synchronous reads of host-owned state.
Check wiring before assuming feature parity:
VS Code registers BPMN, DMN, and Forms, while IntelliJ's visual editor is BPMN.

For new host functionality, update the core port and affected adapters, and
wire handlers in composition. Inspect the bridge protocol
in `apps/modeler-bridge/src/protocol/` when the RPC surface changes.

Commands travel webview → host; Queries travel host → webview. For synchronization
changes, trace the webview bootstrap, core modeling service, host document
adapter, and shared flush protocol together. Preserve document authority,
revision checks, own-write echo suppression, and save/close flushing.
`EditorSessionStore` owns editor registration; `WebviewMessageRouter` dispatches
commands. VS Code's generic `ModelerEditorController` serves all three editor
formats; add lifecycle concerns through participants and release their resources
on disposal. Diff panes have separate coordination.

## Go deeper and validate

Consult only the specialist guidance needed for the task:

- [bpmn-js](../bpmn-js/SKILL.md): DI modules and diagram interactions.
- [vscode-webviews](../vscode-webviews/SKILL.md) and [vscode-custom-editors](../vscode-custom-editors/SKILL.md): transport, document sync, and lifecycle.
- [intellij-plugin](../intellij-plugin/SKILL.md): bridge contracts, Gradle, and JCEF.
- [i18n-translate](../i18n-translate/SKILL.md): external translations and the local overlay.
- [vscode-ux-guidelines](../vscode-ux-guidelines/SKILL.md) and [bpmn-browser-testing](../bpmn-browser-testing/SKILL.md): host feedback and interactive validation.

Use `corepack yarn` and the owning workspace's checks, including relevant
architecture tests. Consult [adr](../adr/SKILL.md) for public API, dependency,
package-boundary, or protocol changes; record new decisions in
[docs/adr](../../../docs/adr/README.md).
