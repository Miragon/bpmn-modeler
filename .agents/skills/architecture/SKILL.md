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
| IDE protocol-to-modeler adaptation | `apps/bpmn-webview/src/composition/bootstrap.ts` and the adapters and services it wires, `apps/dmn-webview/src/composition/bootstrap.ts`. |
| Form editing and deployment UI | `apps/form-webview`; `apps/deployment-webview`, whose markup lives in `src/adapter/in/formTemplate.ts`. |
| Artifacts view (add-ons) UI | `apps/add-ons-webview`: a reducer in `src/domain/viewState.ts`, the DOM in `src/adapter/in/catalogView.ts`; the catalog, its texts and the protocol adapter (`AddOnViewMessages`) live in the core's `addOns/`. |
| Host integration and lifecycle | `apps/vscode-plugin/src/main.ts` and `src/composition/`; `apps/modeler-bridge/src/server.ts` and `src/composition/` (`bridge.ts`); Kotlin host in `apps/intellij-plugin`. |

Decisions (rules, state transitions, validations) go into the owning feature's
`domain/` as pure code, or into `libs/modeler-types` when browser code applies
the same rule, written test-first with the [tdd](../tdd/SKILL.md) skill.

A service orchestrates; a rule lives in `domain/`, named after the rule it
decides (for example `isModeAvailable(mode, engine)`, not `check` or
`validate`). A service that grows usually holds a rule in the wrong home. The
`size-and-complexity` fitness function reports each file's code lines and
highest complexity with their trend; `hotspots` ranks the files that are large
and change often. Both are leads to read, not limits: a long table of values or
a protocol type file is large and holds no rule.

A value set (auth types, theme modes, languages) has one home. Every other use
imports it. A TypeScript copy that cannot (a protocol type behind a package
boundary) is pinned to it by `expectTypeOf<Copy>().toEqualTypeOf<Home>()` in
the spec of the code that maps between them, as `DeploymentTargetService.spec.ts`
pins `AuthTypePayload` to `TargetAuthType`. A copy outside TypeScript (a
manifest, a JSON schema, Kotlin) is pinned by a spec that reads it and compares
it with the home's runtime list, as `apps/vscode-plugin/src/manifest.contract.spec.ts`
pins the languages and the default modes, and `deploymentTargetsSchema.spec.ts`
the schema's engines and auth types. A Kotlin test reads the home's file, as
`ModelerSettingsStoreTest` reads `SURFACE_MODES`:
`apps/intellij-plugin/build.gradle.kts` passes the file to `tasks.test` as a
declared input, and the `intellij-plugin` filter in
`.github/workflows/build.yml` lists it, or a PR that changes only the home
skips the Kotlin job. `tools/repo-checks/src/kotlinTestInputs.spec.ts` fails
when the filter misses an input. A home that has only a type gets that list as
a readonly tuple its type derives from (`TARGET_AUTH_TYPES`), not as a second
spelling. A type a published package re-exports from an inlined library, such
as `Engine`, cannot derive from an `as const` list: the package's declaration
roll-up (API Extractor) reads the library's source and fails on it. Its list is
typed as the home instead, and a spec checks that it names every value, as
`engine.spec.ts` checks `ENGINES` against the `Record<Engine, …>` tables. A pin
is a fix, not an exception. The `repeated-value-sets` fitness function reports
every set written in two or more files that no `expectTypeOf` pin links; a copy
a branch adds shows as new. A copy that drifts from its home shows as resolved,
not new: a resolved set is a fix only where its copies are gone, import their
home or are pinned to it.

The core builds every user-visible text, and a host renders it: prompts, status
views, notifications and their buttons. A text a host would write goes into the
owning feature's `domain/` with a builder, as `tokenPromptFor` builds the token
prompt, so both hosts show the same words. Only two kinds of text stay in the
host: its chrome, such as VS Code's "Reload Window" button, and messages about
its own failure, such as the bridge process dying. The `host-text` fitness
function reports every literal with two words in host code: a file that imports
`vscode`, a class outside the core that implements a core interface, or a Kotlin
file in `src/main/kotlin` that imports `com.intellij`, so IntelliJ's dialogs,
actions and settings page count too. A text a branch adds shows as new. It also
lists host chrome and technical strings (HTML, CSS classes, scripts); judge
each, and leave the host's own text where it is.

A port the core reads back from has a contract suite in the core's test kit
once a second class implements it, and every adapter of the port runs it, the
in-memory fake included. A suite is a function exported from
`@miragon/bpmn-modeler-core/testing` that takes a factory of the adapter, or of
a fixture that holds it, and runs the rules the core relies on (sorting, path
spelling, the dismissal value), not one adapter's quirks;
`describeWorkspaceContract` is the model. A port whose methods only return
`void` or `Promise<void>` renders and needs none, and neither does a strategy
the core chooses between, such as the engine clients. The `contract-suites`
fitness function lists every adapter of a core port whose specs do not import
it and call a suite of that port; it sets ports with one adapter and
render-only ports aside in collapsed groups, and a new adapter of a port with a
suite shows as new until its spec runs the suite.

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
- Add host-independent logic to the core's feature-oriented `domain/` and
  `service/` folders. Reach host facilities through ports and editor handles.
  Cross-cutting host ports live in the core's `kernel/port/hostPorts.ts`; a
  port one feature owns lives in that feature's `port/`, which holds only
  interfaces, and the prompts it asks are built in its `domain/`, the
  marketplace's masked token prompt (`tokenPrompt.ts`) and its add question
  and remove choice (`marketplacePrompts.ts`) included. A host only renders a
  prompt in its own layout and returns the answer; the core reads it, takes a
  blank token for no token, and checks an entered location and asks again. A
  fact that differs per host, such as where a scope is saved, reaches the core
  as a typed value (`SettingsPlace`), never as host-built prose. Wire concrete
  adapters in the applications using constructor composition.
- Preserve factory/handle API compatibility and package exports. Supply optional
  BPMN capabilities through ports; keep linting injectable and browser themes
  container-scoped. Use feature barrels for cross-feature access.

Check `architecture.spec.ts` in both modeler packages, `libs/modeler-core/src`,
`apps/vscode-plugin/src` and `tools/repo-checks/src`, plus root
`eslint.config.cjs`. All specs read sources through the shared engine
`@miragon/architecture-testing` (`tools/architecture-testing`). Package gates
protect import direction and theme isolation. Core checks reject VS Code and
transitive host-module imports (the core is still not browser-safe), its
domain package allowlist, and context isolation through `kernel/` (which imports
nothing outside itself) and `editorSession/` (which imports only `kernel/`)
against known exceptions that may only shrink. VS Code checks that a context
reaches another only through `shared/`. The repo-level spec bans import cycles
in and between every workspace and a dependency on a less stable workspace, and
applies the role-folder rules below. A fitness function that can fire on
correct code, each dynamic one and a static one such as host text or a size
limit, plugs into `corepack yarn fitness` (`tools/repo-checks/src/fitness/`),
which reports new and existing findings and never fails a build
([ADR](../../../docs/adr/engineering-practices.md#architecture-erosion)).

A webview posts only the commands of its surface list in `libs/shared`, and
narrows its host channel to that list. A new webview surface registers in
`WEBVIEW_SURFACE_COMMAND_TYPES` (`webviewSurfaces.ts`) and gets a row in each
host's surface coverage. `tools/repo-checks/src/webviewCommands.spec.ts`
type-checks every `apps/*-webview` program and fails on a constructed command
that is on no list.

## Put each file in its role folder

Each workspace declares its kind in the `"architecture"` field of its
`package.json`: `hexagonal` (core, VS Code host, bridge, webviews, template
builder, `tools/repo-checks`), `diagram-js` (feature libraries and the modeler
packages) or `flat` (types, protocol and the rest of the tooling). A new
workspace declares one too. Only a `hexagonal` workspace has role folders; the
first one in a file's path is its role:

```
<context>/
  domain/        rules as pure functions and values
  port/          interfaces the services call
  service/       orchestration, session participants included
  adapter/in/    calls into the workspace: commands, message handlers, UI
  adapter/out/   implements a port: VS Code, Node, HTTP
  composition/   wiring (at the root in a host, per context in the core)
testing/         the test kit
index.ts         an entry: a file directly in src/
```

`tools/repo-checks/src/architecture.spec.ts` blocks on these, and reads no
file or type name:

1. Every file sits in a role folder or is an entry.
2. `domain/` imports only `domain/`.
3. `port/` imports only `domain/` and `port/`.
4. `service/` imports no `adapter/`, `composition/`, `testing/` or entry.
5. Only `adapter/in/`, `service/`, `composition/`, `testing/` and entries
   import a service.
6. `adapter/in/` and `adapter/out/` never import each other.
7. Only `adapter/`, `composition/` and entries import `vscode`, `node:*`,
   `fs` or `http`.
8. Only `composition/` and entries import `composition/`.
9. Only `testing/` imports `testing/`; nothing imports an entry.

In a webview the UI, its markup and the router for the host's queries are
`adapter/in/`, the host channel and the modeler-library wrappers
`adapter/out/`, the channel's type, the state it persists and the ports a
session calls `port/`, a session that syncs with the host through injected
handles `service/`, pure rules `domain/`, the bootstrap `composition/`, and
`main.ts` the entry.

A `diagram-js` or `flat` workspace holds no role folder (same spec). ESLint
bans `() => {}` in `adapter/` (`eslint.config.cjs`). A workspace not yet moved
has one blanket exception in the repo-level spec naming its migration issue.

A class that implements a port sits in `adapter/out/` or `testing/`. No spec
blocks this; the `convention-coverage` fitness function reports it, and runs
the rules above without exceptions, so the files of a workspace not yet
moved show as remaining work. The rules and the reasons are in the
[ADR](../../../docs/adr/architecture-and-hosts.md#workspace-kinds-and-role-folders).

## Trace host and session behavior

VS Code runs the core in-process. Standalone loads that extension through
Theia/Electron, with shell customizations in `libs/standalone-extension`.
IntelliJ renders BPMN in JCEF, relaying messages through a Bun stdio JSON-RPC
bridge running the core. Mirrors provide synchronous reads of host-owned state.
Check wiring before assuming feature parity:
VS Code registers BPMN, DMN, and Forms, while IntelliJ's visual editor is BPMN.

For new host functionality, update the core port and affected adapters, and
wire handlers in composition. Inspect the bridge protocol
in `apps/modeler-bridge/src/protocol/domain/` when the RPC surface changes;
its Host→Core handlers are the tables in `<context>/adapter/in/`.

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
- [architecture-review](../architecture-review/SKILL.md): review a branch or PR against the fitness function report.
- [bpmn-js](../bpmn-js/SKILL.md): DI modules and diagram interactions.
- [vscode-webviews](../vscode-webviews/SKILL.md) and [vscode-custom-editors](../vscode-custom-editors/SKILL.md): transport, document sync, and lifecycle.
- [intellij-plugin](../intellij-plugin/SKILL.md): bridge contracts, Gradle, and JCEF.
- [i18n-translate](../i18n-translate/SKILL.md): external translations and the local overlay.
- [vscode-ux-guidelines](../vscode-ux-guidelines/SKILL.md) and [bpmn-browser-testing](../bpmn-browser-testing/SKILL.md): host feedback and interactive validation.

Use `corepack yarn` and the owning workspace's checks, including relevant
architecture tests. Consult [adr](../adr/SKILL.md) for public API, dependency,
package-boundary, or protocol changes; update the existing topic in
[docs/adr](../../../docs/adr/README.md), replacing superseded decisions.
