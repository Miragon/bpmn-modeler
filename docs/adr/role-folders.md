# Role folders

- Status: accepted
- Last reviewed: 2026-11-23

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
| `flat` | `modeler-types`, `shared`, `bpmn-diff`, `bpmn-merge`, `dmn-diff`, `bpmn-i18n-extras`, `standalone-extension`, `tools/architecture-testing`, `docs`, `apps/standalone` |

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
rules 10 and 11 the syntax of a `port/` and a `domain/` file:

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
   (`vscode`, `electron` or a Node built-in other than `path`).
8. Only `composition/` and entries import `composition/`.
9. Only `testing/` imports `testing/`, and nothing imports an entry.
10. A `port/` file declares only types: interfaces, type aliases and type-only
    exports. The value types, errors and pure functions a port names stay in
    `domain/`, so the domain never imports a port. The check reads syntax and
    resolves no re-export, so a re-exported interface says `export type`. A factory
    is a function type, so it stays a port; an interfaces-only rule would move the
    webview channel types out of `port/`. The guard keeps its own exception list,
    so a blanket role exception during a migration does not excuse a port file.
11. A `domain/` file declares no async function and uses no `await` or
    `for await`: a domain that waits, waits on something outside it, and that
    call belongs to a service. It sits beside rule 10 in the repo-level spec, not
    in ESLint, because that spec knows each workspace's kind; the adapter override
    is in ESLint only because `no-empty-function` already said it. A function that
    returns a promise without `async` is not read.

Rule 6 follows `adapters.dontDependOnEachOther` of Hombergs' buckpal at the
level of direction rather than per adapter, because one technology spans
contexts here.

### Domain imports

The core's `domain/` imports `domain/` (rule 2), a pure module and `path`, value
imports included. Purity is decided per imported module, whatever the kind of its
workspace. A module is pure when no file it reaches sits in a `port/`, `service/`,
`adapter/` or `composition/` folder, none imports a platform module (a host module
of rule 7, or `path`), and the program the native compiler builds from its
workspace's tsconfig, and from each config it references, holds no DOM lib file.
Imports are followed to the file, through relative imports and the
`tsconfig.base.json` aliases, into any workspace. The program holds every file the
module reaches, so a DOM-free module of another workspace keeps it pure, and it
shows the DOM however it came in: the `lib`, the default lib, or a
`/// <reference lib="dom" />` in a declaration it loads, as preact's JSX types do
once a `.tsx` file is in it. `readModulePurity` (`tools/architecture-testing`)
decides it from structure; no list names a package.

Pure today: the entries of `bpmn-diff`, `bpmn-merge` and `dmn-diff`. Not pure:
`shared` and `modeler-types`, which both compile with the DOM; `modeler-types`
needs it for ten canvas and chrome modules. The core's domain imports
`modeler-types` under a known exception until those modules leave it (#2776).
`path` is allowed in the core's domain but makes a module impure, because pure
libraries also run in the browser (`packages/bpmn-modeler` imports them) and the
core runs only in Node hosts. Seven domain files compute workspace paths with
`path.posix`; rewriting it would copy Node's normalisation into the domain. The
core spec fails once no domain file imports `path`, so the allowance goes with its
last use.

- **Why:** a pinned copy of a pure library's type (`StageRefusal` of the merge
  library's `MergeRefusal`) only hid that the core speaks that library's language,
  and a hand-kept package list drifts (#2049).
- **Cost:** the core's domain depends on those libraries' APIs, so a change there
  breaks the domain at compile time. The DOM half holds only while each workspace
  with a pure module runs its own no-DOM compile (`build`, its Vitest target's
  typecheck) in CI, and it reads the native compiler that compile uses:
  TypeScript 6 loads preact's JSX runtime, and with it the DOM, into every program
  under the base config's `jsx` options. Each workspace a domain import reaches
  costs one compiler run; a config the compiler refuses, or no tsconfig, reads as
  the DOM. The DOM is read per workspace, so a library whose `service/` needs the
  DOM makes its `domain/` impure too. A workspace import no alias resolves cannot
  be followed and reads as impure. An npm package is a leaf that is not followed,
  and Node globals (`process`, `Buffer`) have no import to read.
- **Kind:** not read, and that is what lets the libraries get role folders
  (decided 2026-11-23): the flat logic libraries, `bpmn-merge` first, then
  `bpmn-diff` and `modeler-types`, get feature or stage folders with `domain/`
  (rules) and `service/` (orchestration) inside, no `port/` or `adapter/`. An entry
  that re-exports only `domain/` stays pure, and so does every library that
  imports it (`bpmn-merge` and `dmn-diff` import `bpmn-diff`); an entry that
  re-exports a `service/` is not, so the core's domain then imports the `domain/`
  module by subpath, which needs a `tsconfig.base.json` alias to be followed.
- **Scope:** only the core's spec applies the rule. The other hexagonal workspaces
  have no package rule for `domain/`; there it would flag 81 imports in 65 files,
  most of them `@miragon/bpmn-modeler-shared` (34) and `@miragon/bpmn-modeler-types`
  (27). That rule is open (#2562, B10).

### Placement

- The core's session participants are in-core reactions that
  `EditorSessionLifecycle` drives, so they sit in `service/`.
- An object that holds or calls a port, such as a store or a session with
  handles, stays in `service/`; its decisions move to `domain/` as values it asks
  for. An entity that belongs in `domain/` refers to host objects by identity, a
  uri or an id, never by handle.
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
- Only type imports from pure libraries: their functions are as pure as their
  types, so the domain would reach them through a service for nothing.
- Purity per workspace kind, a `flat` precondition: a library that gets role
  folders would turn impure, with every library that imports it, and the core's
  domain imports of them would fail.
- The DOM per module, such as a DOM-free subpath of `modeler-types`: a module has
  no compiler of its own, so its DOM-freeness would rest on whichever DOM-free
  workspace happens to import it.
- The tsconfig `lib` as proof of no DOM: a `/// <reference lib="dom" />` in any
  declaration the program loads adds it back, and preact's JSX types carry one.
- A domain interface for a handle that the port re-exports: the domain would call
  a host object through it, the call out that rule 2 exists to prevent.

## Enforcement

[Repo-level architecture spec](../../tools/repo-checks/src/architecture.spec.ts)
(`RULES_BY_KIND` applied to every workspace of that kind, rules 10 and 11), the
[core spec](../../libs/modeler-core/src/architecture.spec.ts) (domain imports
through `readModulePurity`, contexts) and the ESLint override that bans an empty
function in an adapter (`**/src/**/adapter/**`, #2053).
