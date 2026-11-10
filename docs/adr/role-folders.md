# Role folders

- Status: accepted
- Last reviewed: 2026-11-13

## Context

A fitness function reads folders, imports and types, never a file or type name.
A folder therefore has to state the role a file is meant to have, and its
imports show the role it has. The convention is hexagonal (ports and adapters),
applied to every workspace that declares it.

## Decision

### Workspace kinds

Each workspace declares its kind once in the `"architecture"` field of its
`package.json`; `readWorkspaces` reads it and the repo-level spec fails on a
missing or unknown kind.

| Kind | Workspaces |
| --- | --- |
| `hexagonal` | `libs/modeler-core`, `apps/vscode-plugin`, `apps/modeler-bridge`, the five webviews, the template builder, `apps/orca-plugin`, `tools/repo-checks` |
| `diagram-js` | the diagram-js feature libraries in `libs/`, `packages/bpmn-modeler`, `packages/dmn-modeler` (bpmn-js module layout) |
| `flat` | `modeler-types`, `shared`, `bpmn-diff`, `dmn-diff`, `bpmn-i18n-extras`, `standalone-extension`, `tools/architecture-testing`, `docs`, `apps/standalone` |

A `diagram-js` or `flat` workspace holds no role folder, so no folder there
reads as a role nothing checks.

### Roles and rules

In a `hexagonal` workspace the first role folder in a file's path is its role
and the path before it is its context (`modeler/bpmn/service/x.ts` is the
`service/` of context `modeler/bpmn`). The layout below a role folder is free.
A file directly in `src/` is an entry (`index.ts`, `main.ts`). Technology gets
no role folder; it shows in the imports.

| Folder | Holds |
| --- | --- |
| `domain/` | rules as pure functions and values |
| `port/` | types only: interfaces that services and inbound adapters call and outbound adapters implement |
| `service/` | orchestration, including the core's editor-session participants |
| `adapter/in/` | calls into the workspace: commands, webview and RPC message handlers, UI |
| `adapter/out/` | implementations of a port: VS Code, Node, HTTP clients |
| `composition/` | wiring: at the workspace root in a host, `<context>/composition/` in the core |
| `testing/` | the test kit |

Every rule blocks, because each is static: rules 1 to 9 read only folders and imports,
rule 10 the top-level statements of a `port/` file:

1. Every file sits in a role folder or is an entry.
2. `domain/` imports only `domain/`, so the domain decides and does not call
   out through a port.
3. `port/` imports only `domain/` and `port/`.
4. `service/` imports no `adapter/`, `composition/`, `testing/` or entry.
5. Only `adapter/in/`, `service/`, `composition/`, `testing/` and entries import
   a service; an entry may re-export one (the core's barrel is how hosts reach
   its services).
6. `adapter/in/` and `adapter/out/` never import each other, in any context.
7. Only `adapter/`, `composition/` and entries import a host module
   (`vscode`, `node:*`, `fs`, `http`).
8. Only `composition/` and entries import `composition/`.
9. Only `testing/` imports `testing/`, and nothing imports an entry.
10. A `port/` file declares only types: interfaces, type aliases and type-only
    exports. The value types, errors and pure functions a port names stay in
    `domain/`, so the domain never imports a port. The check reads syntax and
    resolves no re-export, so a re-exported interface says `export type`. A factory
    is a function type, so it stays a port; an interfaces-only rule would move the
    webview channel types out of `port/`. The guard keeps its own exception list,
    so a blanket role exception during a migration does not excuse a port file.

Package imports stay out of the shared set: the core's domain allowlist
(`@miragon/bpmn-modeler-types`, `path`) and its rules between contexts remain
rules of the core's own spec ([package boundaries](architecture-and-hosts.md#package-boundaries)).
Rule 6 follows `adapters.dontDependOnEachOther` of Hombergs' buckpal at the
level of direction rather than per adapter, because one technology spans
contexts here.

### Placement

- The core's session participants are in-core reactions that
  `EditorSessionLifecycle` drives, so they sit in `service/`.
- Webviews: UI, markup and the router for the host's queries are `adapter/in/`;
  the host channel and the modeler-library wrappers `adapter/out/`; reducers and
  pure rules `domain/`; the bootstrap `composition/`. The host channel's type
  and the persisted state are `port/`, so UI and host adapter share them without
  importing each other. A document session that syncs the modeler with the host
  through injected handles is `service/`.
- The bridge serves host RPC through handler tables in
  `<context>/adapter/in/`, plain maps from method to handler bound to the `Rpc`
  peer by `composition/bindHandlers`, so no handler imports the transport. Out
  adapters that mirror host state implement a port the handlers take, so a
  handler keeps its order against the core (settings applied before a session's
  participants run).
- The template builder library keeps the engines' data in `domain/catalog/` and
  the rules over it in the rest of `domain/`; its own spec adds what the shared
  rules do not read (the catalog imports no rule, the domain names no DOM
  global, only `adapter/in/` imports Preact or a stylesheet).

### Migration

A `hexagonal` workspace not yet moved into role folders carries one blanket
`KnownException` (`from: <dir>, to: "*"`) that names the issue moving it; the
stale-exception check removes it once the workspace passes. The
`convention-coverage` fitness function runs the same rules without exceptions
and so reports what the list excuses as remaining work
([architecture enforcement](architecture-enforcement.md#fitness-functions)).

## Alternatives rejected

- Hombergs nests `port/` and `service/` under `application/`; the flat variant
  keeps the roles with one folder less and no rule needs the grouping.
- Evans keeps repository interfaces in the domain; a role folder inside another
  makes the role ambiguous by path and rule 2 needs `domain/` and `port/` apart.
- `session/` as a role would split one application layer in two without a rule
  that tells them apart.
- The test kit in `adapter/out/`: `createTestHost` wires services, which rule 5
  forbids there, so `testing/` is a role.
- A central table of kinds in the repo-level spec would sit apart from the
  workspace it describes and pass until someone listed a new one.
- Detecting a port by type would flag a correct helper that implements none; the
  folder states the role and `convention-coverage` reports a port implemented
  outside `adapter/out/` and `testing/`.

## Enforcement

[Repo-level architecture spec](../../tools/repo-checks/src/architecture.spec.ts)
(`RULES_BY_KIND` applied to every workspace of that kind), the
[core spec](../../libs/modeler-core/src/architecture.spec.ts) and the ESLint
override that bans an empty function in an adapter (`**/src/**/adapter/**`, #2053).
