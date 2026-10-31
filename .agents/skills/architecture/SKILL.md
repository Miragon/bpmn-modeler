---
name: architecture
description: Architecture and code-placement guide for the modeler packages, libraries, webviews and the VS Code, IntelliJ and Theia hosts. Use when deciding where code belongs or changing package boundaries, ports, editor sessions, host features or architecture tests.
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
| Public-facing types, browser utilities and pure rules browser code shares with the core | `libs/modeler-types`; keep the surface suitable for publication. |
| Private messages and webview chrome | `libs/shared/src/lib/`; base/sync messages in `messages.ts`, feature payloads in their corresponding files, host channel in `host.ts`. |
| Host-independent domain logic and services | Feature folders in `libs/modeler-core/src/`, with the shared vocabulary in `kernel/` and the editor-session core in `editorSession/`; consumers use its `index.ts`. |
| IDE protocol-to-modeler adaptation | `apps/bpmn-webview/src/bootstrap.ts` and its `src/session/` modules, `apps/dmn-webview/src/bootstrap.ts`. |
| Form editing and deployment UI | `apps/form-webview`; `apps/deployment-webview`, whose markup lives in `src/app/formTemplate.ts`. |
| Host integration and lifecycle | `apps/vscode-plugin/src/main.ts` and `src/composition/`; `apps/modeler-bridge/src/bridge.ts` and `src/composition/`; Kotlin host in `apps/intellij-plugin`. |

Decisions (rules, state transitions, validations) go into the owning feature's
`domain/` as pure code, or into `libs/modeler-types` when browser code applies
the same rule, written test-first with the [tdd](../tdd/SKILL.md) skill.

## Preserve the boundaries

- Let applications consume packages and libraries, and packages consume reusable
  libraries. Keep libraries independent of applications and modeler packages.
  Private browser libraries are inlined into published packages; upstream stacks
  remain npm dependencies.
- Keep `modeler-core` and `shared` out of published browser code. Put protocol
  adaptation in webview bootstraps. `modeler-types` holds publishable concepts
  and the pure rules browser code shares with the core, such as script-surface
  addressing, the XML comment and CDATA scan and process-variable extraction;
  DOM-id-coupled panel chrome and host-theme adaptation belong in `shared`.
- Add host-independent logic to the core's feature-oriented domain/service
  layers. Reach host facilities through ports and editor handles. Cross-cutting
  host ports live in the core's `kernel/domain/hostPorts.ts`; a port one
  feature owns lives in that feature's `domain/ports.ts`, and the prompts it
  asks are built in its `domain/`. Wire concrete adapters in the applications
  using constructor composition.
- Preserve factory/handle API compatibility and package exports. Supply optional
  BPMN capabilities through ports; keep linting injectable and browser themes
  container-scoped. Use feature barrels for cross-feature access.

Check `architecture.spec.ts` in both modeler packages, `libs/modeler-core/src`,
and `apps/vscode-plugin/src`, plus root `eslint.config.cjs`. Package gates protect
import direction and theme isolation. Core checks reject VS Code and transitive
host-module imports (the core is still not browser-safe), and enforce layer
direction, feature isolation through `kernel/` (which imports nothing outside
itself) and `editorSession/` (which imports only `kernel/`) and no cycles
against known exceptions that may only shrink. VS Code checks cover host
isolation, cycles, and selected feature-barrel boundaries.

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
commands. The core `EditorSessionLifecycle` runs every editor session on both
hosts (VS Code's generic `ModelerEditorController` serves all three editor
formats through it); add lifecycle concerns through participants and release
their resources on disposal. The store, router and lifecycle live in the core's
`editorSession/service/`. Diff panes have separate coordination.

## Go deeper and validate

Consult only the specialist guidance needed for the task:

- [tdd](../tdd/SKILL.md): failing spec first, rules in the domain model.
- [bpmn-js](../bpmn-js/SKILL.md): DI modules and diagram interactions.
- [vscode-webviews](../vscode-webviews/SKILL.md) and [vscode-custom-editors](../vscode-custom-editors/SKILL.md): transport, document sync, and lifecycle.
- [intellij-plugin](../intellij-plugin/SKILL.md): bridge contracts, Gradle, and JCEF.
- [i18n-translate](../i18n-translate/SKILL.md): external translations and the local overlay.
- [vscode-ux-guidelines](../vscode-ux-guidelines/SKILL.md) and [bpmn-browser-testing](../bpmn-browser-testing/SKILL.md): host feedback and interactive validation.

Use `corepack yarn` and the owning workspace's checks, including relevant
architecture tests. Consult [adr](../adr/SKILL.md) for public API, dependency,
package-boundary, or protocol changes; update the existing topic in
[docs/adr](../../../docs/adr/README.md), replacing superseded decisions.
