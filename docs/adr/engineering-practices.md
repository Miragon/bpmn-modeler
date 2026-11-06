# Engineering practices

- Status: accepted
- Last reviewed: 2026-11-06

## Context

The modeler combines browser layout, third-party DI modules, private upstream
details and host packaging tools. Type checks and mocked unit tests alone do not
cover real SVG behavior or upstream internal changes. Dependency fixes also
need compatibility proof for the paths the build and plugin installer exercise.

## Contents

- [Test environments](#test-environments)
- [Test-first for rules](#test-first-for-rules)
- [Coverage gates](#coverage-gates)
- [Mutation testing](#mutation-testing)
- [CI test targets](#ci-test-targets)
- [Architecture erosion](#architecture-erosion)
- [Architecture tests](#architecture-tests)
- [Fitness function report](#fitness-function-report)
- [Change coupling](#change-coupling)
- [Convention coverage](#convention-coverage)
- [Repeated value sets](#repeated-value-sets)
- [Size and complexity](#size-and-complexity)
- [Hotspots](#hotspots)
- [Missed partner](#missed-partner)
- [Host text](#host-text)
- [Contract suites](#contract-suites)
- [Architecture review](#architecture-review)
- [Private upstream APIs](#private-upstream-apis)
- [Dependency compatibility and security](#dependency-compatibility-and-security)
- [Consequences](#consequences)

## Decision

### Test environments

Use Vitest's existing unit projects for pure logic and jsdom-compatible behavior,
plus a second BPMN package project with the Playwright provider and headless
Chromium for `*.browser.spec.ts`. Every workspace config resolves `@miragon/*`
through the aliases [`vitest.shared.ts`](../../vitest.shared.ts) generates from
`tsconfig.base.json` paths, so test resolution cannot drift from the build's.
The aliases are anchored regexes under `resolve.alias`: `@miragon/bpmn-modeler`
cannot capture its `/diff` subpath, and `x/*` keys keep deep imports working.
`vite-tsconfig-paths` is not declared by the libs and would break focused
installs. Exclude browser files from jsdom. Package `test` runs both projects;
the root test configuration includes the browser project, and CI installs
Chromium.

Test library behaviour in the library that owns it. Clipboard modules and the
static moddle-extension check have their specs in `libs/bpmn-clipboard` and
`libs/modeler-types`; the package keeps only the Chromium round trips and
installed-shape pins that need a real modeler.

Specs reach the core's host ports through the in-memory adapters in
`@miragon/bpmn-modeler-core/testing` (`createTestHost`, `FakeEditorHandle` and
one fake per port), not through hand-rolled partial mocks cast to the port.
The fakes keep state, so specs assert what the host shows or holds rather than
which methods were called. They follow each port's documented conventions, so a
port change breaks every spec that relies on it. Each fake is a third adapter
beside VS Code and the bridge. One contract suite holds the workspace fake to a
real adapter: `describeWorkspaceContract` runs the same scenarios against
`InMemoryWorkspace` and the bridge's `NodeWorkspace` on a temporary directory,
so within those scenarios a spec that passes on the fake cannot rely on a rule
the bridge breaks. Where the hosts differ, VS Code is the reference; its adapter
needs a running VS Code and stays outside the suite, so the suite does not
prove VS Code keeps the same rules. The entry is test-only: production code
does not import it, and specs that test a host adapter itself keep mocking the
host API underneath. A spec spies on a fake only to inject a failure or hang,
or when the call itself is the behaviour under test.

Real browser tests are necessary for SVG geometry, viewbox transforms and
ResizeObserver delivery. Mocks can test viewport-latch decisions but cannot
prove that a delayed initial fit leaves a restored view state intact.
Browser tests now cover modeler, designer, viewer and diff-viewer lifecycle,
new-diagram round trips, readonly/designer contracts and bridged clipboard.
The mode-session recreate transaction itself remains tested with jsdom doubles;
real-viewer restore tests cover the post-import viewport behavior it relies on.

The package `vitest.config.ts` runs both projects in one invocation so their V8
coverage merges into a single report; measured separately, code that only the
browser specs exercise (modeler composition, engine stacks, linting) reads as
uncovered. The browser project incurs a Chromium installation and startup cost;
a separate Playwright test runner would duplicate the Vite module graph, aliases
and test conventions. Manual checks in the webview previews remain useful but do
not replace automated timing-sensitive cases.

Two layers run the VS Code extension in a real VS Code. The Extension-Host test
(`test:e2e`, `@vscode/test-cli`) activates the built extension on the
`engines.vscode` floor and the newest stable release and stays at the VS Code
API boundary: commands, custom-editor resolution and diff routing. It cannot see
inside a webview. The [VS Code smoke test](../../apps/vscode-plugin/test/smoke/vscode-smoke.test.ts)
(`test:vscode`) covers the seam that neither it nor the browser tests reach: the
packaged VSIX, the webview bundles loaded under the host's CSP, the host ↔
webview protocol and the `TextDocument` behind the custom editor. It packs the
extension with `vsce`, unpacks it outside the repository and drives desktop
VS Code through `playwright-core`'s Electron driver. One canvas edit, save, undo
and VS Code's theme switch are checked in the webview, and the DMN and form
editors are opened. Playwright cannot drive VS Code before 1.78, whose Chromium
lacks APIs its injected script uses, so the `engines.vscode` floor stays with
the Extension-Host test. The smoke test keeps Vitest as its runner with its own
config, `vitest.smoke.config.ts`, so `yarn test` and the coverage gates exclude
it; the Playwright test runner is not used, for the same reasons as above. The
pattern follows Miragon's other modelers, but the driver is ported rather than
imported from `@miragon/modeler-shell`: that driver's checks expect the shell's
chrome and theme attributes, and its container command assumes npm. Locally the
test runs in a Linux container
([`run-in-container.mjs`](../../apps/vscode-plugin/test/smoke/run-in-container.mjs),
Podman or Docker), because a native run on macOS opens a window that takes the
focus. In CI it has a [workflow of its own](../../.github/workflows/vscode-smoke.yml)
with plain path filters, a weekly run against the newest stable VS Code and a
manual version input. It is not part of the required `ci` check: it needs a full
install and build, and it drives workbench DOM that VS Code does not keep
stable between releases.

The vendored properties panel requires production Preact JSX transforms in both
test pipelines. Check [browser configuration](../../packages/bpmn-modeler/vitest.browser.config.ts),
[unit configuration](../../packages/bpmn-modeler/vitest.unit.config.ts),
[shared aliases](../../packages/bpmn-modeler/vitest.aliases.ts) and
[lifecycle contracts](../../packages/bpmn-modeler/src/lifecycleContract.browser.spec.ts)
when upstream bundler/runtime behavior changes.

### Test-first for rules

A new or changed decision (a business rule, state transition, validation or
classification) starts as a failing pure spec in the owning feature's
`domain/` folder of `libs/modeler-core`, or in `libs/modeler-types` when
browser code applies the same rule. Every bug fix starts with a spec that
reproduces it. Services keep one orchestration spec per use case through
`createTestHost`. bpmn-js wiring, DOM chrome and host-API glue are exempt:
writing those specs first against real SVG and host APIs costs much and gains
little, and the browser, bridge and smoke specs cover them afterwards.

The rule targets the main source of defects here: a rule written in more than
one place (two services, VS Code and the bridge, TypeScript and Kotlin, the
core and the webview) drifts, and the drift becomes a bug. Writing the spec
first gives the rule one home before code depends on it. Most changes are
written by coding agents, so the workflow ships as the
[`tdd` skill](../../.agents/skills/tdd/SKILL.md), which agents load when they
start a feature or fix. CI cannot prove that a spec came first; the
[mutation score](#mutation-testing) of `domain/` is the measurable proxy, and
the PR description carries the failing output.

A rule the Kotlin host must apply too keeps its rows in a JSON file beside its
TypeScript home, and the TypeScript specs and the Kotlin test run the same
file. Gradle hands the Kotlin test its path as a system property and declares
it a test input, so a changed row reruns the test, and the `intellij-plugin`
CI filter lists the file, or a PR that changes only the rows skips the Kotlin
job; `tools/repo-checks/src/kotlinTestInputs.spec.ts` fails when the filter
misses a test input. A mirrored Kotlin table would drift like the rule it
copies. The settings rows in `settingsNormalization.cases.json` are the first
such file (see [host-replicated state](architecture-and-hosts.md#host-replicated-state)).
Rows whose shapes the typed Kotlin side cannot hold, such as a value of the
wrong type, live in the core's testing kit (`TYPESCRIPT_ONLY_SETTINGS_CASES`),
and every TypeScript host runs them beside the JSON rows. A value set the
Kotlin host copies is pinned the same way, to the TypeScript source file itself:
`StatusSlotPlacementTest` reads the unions in `statusView.ts`,
`ModelerSettingsStoreTest` the `SURFACE_MODES` array in `surfaceMode.ts` and
`ModelerSettingsConfigurableTest` the `MODE_LABEL` table in the modeler's
`modeStrip.ts`, and each fails when the Kotlin copy differs. No generated file
sits in between that could go stale. Two Kotlin copies do not follow this yet.
`ModelerLocalesTest` pins the languages to the VS Code manifest, which
`manifest.contract.spec.ts` pins to the shipped catalogue, so the Kotlin list
holds only through that chain. `ModelerSettingsStore.COLOR_THEMES` is not
pinned yet; only the settings rows that name a theme check it. The Kotlin test
could read the core's `COLOR_THEMES` in `modelerSettings.ts` as it reads
`SURFACE_MODES`; a manifest pin needs that set exported first.

### Coverage gates

Each Vitest workspace owns its coverage target as literal `coverage.thresholds`
in its `vitest.config.ts`, set about three points below the measured baseline.
Its `test` script runs `vitest run --coverage`, so its CI leg fails below the
target and the required `ci` check enforces it without a separate coverage job.
The coverage report in each leg's job summary reads the same numbers; it parses
the thresholds from the config text, which is why they are not computed in the
shared preset. It posts no PR comment: one comment per leg buried the
conversation, and the comment never gated anything.
`coveragePreset` in `vitest.shared.ts` measures all `src/**/*.{ts,tsx}` files
rather than only those a test imports, otherwise a new untested module does not
lower the percentage. Workspaces exclude only code with no testable logic and
name the reason: wiring covered by the Extension-Host smoke test, re-export
barrels, stdio entry points and generated icon components.

`@miragon/bpmn-modeler`'s coverage counts its own `src` only, not the libraries
it inlines. Crediting their code to the package run would let the package
threshold mask a library regression, and a library-only PR would still not see
the credit in its own leg. Libraries reach their numbers through their own
specs instead.

The IntelliJ plugin follows the same rule with JaCoCo: literal `LINE` and
`BRANCH` minimums in its
[`build.gradle.kts`](../../apps/intellij-plugin/build.gradle.kts), checked by
`jacocoTestCoverageVerification` (part of `check`) and its own step in the
`test-intellij-plugin` job. Every Kotlin source counts, including the JCEF and
IDE UI glue that only the sandbox IDE exercises, so new untested code lowers the
number. The platform's test class loader defines plugin classes without a code
source, so the JaCoCo agent runs with `includeNoLocationClasses`; without it
the report records nothing and the floor fails.

Coverage options are root-only in a Vitest multi-project run, so the root
`yarn test` skips coverage; `yarn test:coverage` runs each workspace's `test`
as CI does.

### Mutation testing

Coverage shows which lines a spec executed, not whether a spec would notice
them changing. [Stryker](https://stryker-mutator.io/) mutates the pure domain
rules of `libs/modeler-core` (`src/**/domain/**`) and reports which mutants
the specs fail to kill. Services are left out on purpose: they orchestrate
ports over in-memory fakes, mutate slowly and mostly yield equivalent mutants.
The domain is where rules belong, so its score is the measurable proxy for
"every rule has a spec that bites". Rules browser code applies too live in
`libs/modeler-types`, which Stryker does not mutate; their specs are checked
by breaking the rule by hand.

`@stryker-mutator/core` and `@stryker-mutator/vitest-runner` are declared in
`libs/modeler-core`, the workspace that runs them, so its focused install and
knip's Stryker plugin find them. The
[config](../../libs/modeler-core/stryker.config.mjs) runs the workspace's own
Vitest config, never the root one, whose browser project the runner does not
support. It mutates in place because the workspace config imports
`../../vitest.shared`, which a sandbox copy cannot reach; a local run
therefore rewrites `src/` until it finishes and restores it from
`.stryker-tmp/` if interrupted. Static mutants are ignored because module-level
tables such as `scriptApi.ts` would rerun every spec per mutant. Stryker runs
Vitest without `--coverage`, so the coverage gates are unaffected. The
TypeScript checker stays off: its TypeScript 6 compatibility with this
workspace's `tsconfig.lib.json` is unproven, and the runner works without it.

`corepack yarn test:mutation` runs it; pass `--mutate <file>` to check the
rules a change touched. The [mutation workflow](../../.github/workflows/mutation.yml)
is report-only, like the VS Code smoke test, and not part of the required
`ci` check: it runs every mutant weekly and on demand on `main`, caches
Stryker's incremental file, and on pull requests and merges to `main` that
touch a `domain/` folder re-tests only the mutants affected by the change.
Each merge's run refreshes the cached baseline, so a pull request is compared
against the `main` it branched from rather than last week's. Its step summary
lists the score per context and every undetected mutant
(`corepack yarn fitness mutation summary --report <json>`). The first full run
(2026-10-26, run 40365142588) scored 85.7 % over 2,918 mutants in 48 files
(2,500 detected, 418 not); the first weekly run (2026-11-02, run 41384596015)
94.3 % over 4,502 in 87 files (4,247 and 255), template-marketplace lowest at
85.3 %.

There are no floors. A floor would be a number picked from a few runs, and
Stryker has only one global break threshold. Instead the score per context is
a trend, reported by the `mutation-score` fitness function (#2057): atomic,
triggered, dynamic. The score is Stryker's: detected (Killed, Timeout) ÷
(detected + undetected (Survived, NoCoverage)); other statuses do not count,
and a context with no mutants has no score. A mutated file outside
`src/<context>/domain/` is broken input. Each finding names one domain folder
or the total, with the latest score, its tallies and the last 8 runs.

**Hand-over.** Only full runs on `main` are stored: the `store-score` job of
the mutation workflow runs after a `schedule` or `workflow_dispatch` run on
`main`, downloads the run's report artifact, writes
`mutation/<run id>.json` (`{ schemaVersion, runId, commit, contexts }`, the
tallies per domain folder) with `fitness mutation record`, and commits it to
`fitness-history` through the `store-fitness-history` composite action. Keyed
by run id, two runs on one commit both count, and a re-run of the job
overwrites only its own file. Incremental pull-request and merge runs re-test a
subset and are not stored. The workflow's concurrency group includes the event,
so a push to `main` no longer cancels a running weekly run. A failed store is
recovered by re-running the job while the 14-day artifact exists.

**Series.** The function reads every stored run offline from
`origin/fitness-history` and the full `git rev-list --first-parent` of the
measured commit; the series holds the runs on that chain, oldest commit first,
then by run id. That is exact per run, not per snapshot. Nothing is
recomputed from git: before the first stored run the function throws
`InsufficientHistory`, so its series starts there. At the commit a run
measured, the stored snapshot predates the run, so the next report shows that
run's score as a change; the function names this as a false report.

Alternatives considered:

- **Writing the score into the snapshot of the measured commit** would rewrite
  a stored snapshot after the fact, and the run would vanish from the series
  when the function's version changes. A file per run keeps snapshots
  write-once.
- **Seeding the series from earlier artifacts** would mix the incremental runs
  of pull requests into it; the series starts at the first stored run.

### CI test targets

[`.github/vitest-targets.json`](../../.github/vitest-targets.json) lists every
Vitest workspace with its focused install and the paths that should re-run it:
its own directory, every workspace its code imports, and files its specs import
by relative path. Specs that read files instead of importing them list those
paths by hand; the packages' architecture tests scan every `libs/*/src`, so
both packages trigger on it. The [build workflow](../../.github/workflows/build.yml)
turns each entry into an `<id>` path filter, plus the shared `global` paths
(registry, workflow, preset, root manifest), and an `<id>-src` filter of its
own code files. One `test` matrix job runs every affected target: tests with
coverage, its typecheck script and the job-summary coverage report. Vitest
strips types without checking them, so the typecheck is the only gate on spec
types: it covers the app or library sources and the specs, through the
workspace's `tsconfig.spec.json` where one exists. Configs that reach another
workspace's sources through a path alias include that workspace's ambient
`.d.ts` files, since `tsc` only sees declarations its own project includes.
The app and package build jobs and the Extension-Host smoke test are gated on
the same target ids.

[`check-vitest-targets.mjs`](../../.github/scripts/check-vitest-targets.mjs)
runs in the lint job and pre-push. It fails when a workspace with a Vitest
config is not a target, when a target does not declare the Vitest packages its
focused install needs (including Vitest's `vite` peer), when its trigger
paths miss a workspace or file its tests import, or when its specs escape the
typecheck: the target names no `typecheck`, the script skips an existing
`tsconfig.spec.json`, or the tsconfig it checks excludes `*.spec.*`. Before
the registry, each workspace needed a hand-written job, filter and `ci.needs`
entry, and twelve workspaces' specs never ran in CI.

Only a leg whose `<id>-src` filter matches reports coverage, so the
release-please PR (changelogs, manifests) gets none. A manual
`workflow_dispatch` run executes all targets. CI uploads nothing to Codecov:
from March 2026 it processed none of the uploads, and nobody noticed, because
the thresholds are the gate and nothing read its numbers.

### Architecture erosion

The goal: the architecture and the software design do not erode over time.
Erosion is the gap between the intended architecture and the code. #1799
restored the intended design: one rule in one place, decisions in the domain
model, hosts that only render, no message left unhandled. No single strategy
controls erosion. A survey groups the approaches into minimising, preventing
and repairing it, and concludes that they have to be combined (de Silva and
Balasubramaniam, "Controlling software architecture erosion: A survey", JSS
85(1), 2012). Three parts are combined here, named in the terms of Böckeler
("Harness engineering for coding agent users", martinfowler.com, 2026),
because coding agents write most changes:

1. **Rules for agents**, a guide: where code goes and how a rule is named,
   read before the change. They live in the skills in `.agents/skills/`,
   which Codex and Claude Code both load when a task needs them. Agents do not
   always follow them; they are what the fitness functions rely on.
2. **Fitness functions**, computational sensors: deterministic checks of the
   result (Ford, Parsons, Kua, Building Evolutionary Architectures, 2017),
   the blocking [architecture tests](#architecture-tests) and the reported
   ones of the [fitness function report](#fitness-function-report).
3. **The [architecture review](#architecture-review)**, an inferential
   sensor: a model's judgement of the result, which reads the report and
   reviews what no fitness function sees.

**When a fitness function blocks.** Only when it is static and never fires on
correct code: the architecture specs (import direction, role folders, cycles,
stability, the webview command scan), the ESLint rules for an empty function
in an adapter and a guarded value compared outside its home, the command
coverage tables and the type check. A blocking function misses code outside
its scope; a miss is a reason to report that code, not to stop blocking what
it catches. Every other fitness function, each dynamic one and each static one
that can fire on correct code (a size limit, host text), is reported and never
fails a build. A gate on a heuristic needs an exception list, and that list is
work in every PR: #2094 measured 50 of 200 PRs editing one.

### Architecture tests

Every `architecture.spec.ts` reads its sources through one engine,
[`tools/architecture-testing`](../../tools/architecture-testing/src/index.ts)
(`@miragon/architecture-testing`). It reads imports from the TypeScript syntax
tree, so comments, JSDoc `import()` and strings never count, and marks an
import type-only where TypeScript would elide it. It resolves a relative import
through a fixed suffix list (`.ts`, `.tsx`, `/index.ts`, `/index.tsx`, then the
exact path) and maps a package import to a workspace by its package name, and
keeps the line each import starts on. It also finds import cycles, host reach
and comments. `findImplementations` lists each class with an `implements`
clause and the files that declare its interfaces: it follows the file's import
bindings (named, renamed, `ns.X`) and then the declaration graph through barrels
and aliases; a local interface resolves to the file itself, a global or
package one to none. It reads syntax only, so a checkout without
`node_modules` gives the same result. A
rule that needs types, not syntax, gets a type-checked `ts.Program`:
`readTypeProgram` builds one from a tsconfig, and `findSubclassConstructions`
finds every `new` of a subclass of a named base class, through intermediate and
generic bases, with the literal type of a discriminant property. It throws when
the base class is not declared in the named file, so a moved base cannot match
nothing and pass. Given a file list, `readTypeProgram` uses it in place of the
config's own, so `tsconfig.base.json`, which has no `include`, globs nothing,
and `types: []` loads no `@types` package. `findContractSuites` reads from such
a program the interfaces of the port files a caller names, the named classes
whose `implements` clause reaches one through extended interfaces or an
intersection, the functions a helper module exports with a parameter that
produces a port (a type parameter stands for its constraint), and the specs
that import such a class as a value, with the helpers they call. It
throws when the helper module is not in the program, so a moved kit cannot
leave every adapter without a suite. Only `sourceTree.ts` and `typeProgram.ts` touch the file
system; the rest are pure functions over source text or a program. The engine
also holds one rule set per workspace kind (`HEXAGONAL_RULES`, `FLAT_RULES`)
over role folders that `roleOf` reads from the path, so no rule reads a file or
type name (see
[Workspace kinds and role folders](architecture-and-hosts.md#workspace-kinds-and-role-folders)).
`readValueSets` reads the value sets a file writes out, from syntax only: an
array of string literals, a union of string literal types and a maximal `||`
chain of `===` comparisons of one subject with string literals.
`findTypeEqualityPins` lists each `expectTypeOf<A>().toEqualTypeOf<B>()`, or
its value form, never one behind `.not`, with the files that declare the
imported names on either side, resolved like `findImplementations`; a local
or unresolved name resolves to none.
A workspace's own spec keeps only the rules specific to it, such as the core's
domain package allowlist.

The import graph links a file to the file it names. `buildDeclarationGraph`
links it to the file that declares each imported name instead: it resolves
`@miragon/*` specifiers through the `tsconfig.base.json` paths (exact and `/*`
entries, the same suffix list), then follows named, default, local and
namespace re-exports and `export *` through any chain, with a cycle guard. A
direct import of a module that declares something also links to that module;
a barrel, a file with nothing but imports and re-exports (`readModuleSymbols`),
gets no edge of its own. A namespace or dynamic import of a barrel links to
every file it reaches, a name no file declares falls back to the module, and a
JSON import links to the JSON file. The blocking specs keep the plain import
graph; the declaration graph serves the change-coupling report and
`findImplementations`.

The type-checked rule does not need a full install. Workspace imports resolve
through the `tsconfig.base.json` paths to sources, so with every third-party
package hidden, as in the focused CI install, the webview command scan finds
the same 112 constructions it finds with them. A missing third-party type only
turns a value into `any`, which no `Command` construction depends on, so the
rule does not demand zero diagnostics. Building and scanning the four webview
programs takes 2 to 4 s.

[`tools/repo-checks`](../../tools/repo-checks/src/architecture.spec.ts) holds
the rules over every root workspace with a `src/`: no import cycle inside a
workspace (type-only imports count), every relative import resolves (assets
aside, so no edge drops silently out of the cycle rule), no cycle between
workspaces, and no workspace depends on a less stable one. Instability is
I = Ce / (Ca + Ce) over workspace dependencies, compared on integers. It also
applies the rule set of each workspace's kind, which the workspace declares in
the `"architecture"` field of its `package.json`; a missing or unknown kind
fails. The role rules read the default source tree, so `__fixtures__` stay out:
they are test inputs, not code with a role. A workspace not yet moved into its
role folders has one blanket `KnownException` (`from: <dir>, to: "*"`) naming
the issue that moves it.

ESLint bans an empty function (`() => {}`) in an adapter, outside specs: a
port adapter stubbed that way passes every spec that never calls it, so an
intended no-op says why in a comment instead (#2053). The override covers
`**/src/**/adapter/**/*.ts` and the core's `testing/`.

Two exception regimes apply. Cycles take no exceptions; a cycle is fixed. Role,
layer and stability rules take `KnownException` entries that name the issue removing
them, and a stale or unnamed entry fails the gate, so the lists only shrink. A
rule scoped to a folder or file set fails when the scope matches nothing
(`requireMatches`), so a renamed folder cannot make it pass vacuously.

The engine lives under `tools/`, not `libs/`: it is dev-only tooling that no
host or webview ships.

A domain value that describes the world keeps its rules in one home module.
The typed ESLint rule `miragon/no-guarded-value-comparison`
([`tools/repo-checks/eslint`](../../tools/repo-checks/eslint/noGuardedValueComparison.cjs))
reports `===`, `!==`, `==`, `!=` and each `case` that compares such a value
with a string literal outside its home, in every folder. Each registry entry in
`eslint.config.cjs` names the type, its module, its homes and an error message
that names the fix. Three types are registered, and code elsewhere asks their
home:

- **`Engine`:** a capability in the `Record<Engine, …>` table of
  `libs/modeler-types/src/engine.ts` (`engineSupports`), a method named after
  the rule (`DeploymentTarget.verifiesDeployments()`), or a `Record<Engine, …>`
  lookup.
- **`SurfaceMode`:** a capability in the table of
  `libs/modeler-types/src/surfaceMode.ts` (`surfaceModeSupports`), or a
  `Record<SurfaceMode, …>` lookup.
- **`ReferenceKind`:** a capability in the `Record<ReferenceKind, …>` table of
  `libs/modeler-types/src/referenceKind.ts` (`referenceKindSupports`: only a
  form reference has an availability status and a preview), or a
  `Record<ReferenceKind, …>` lookup where the knowledge lives: where an element
  writes each kind and whether it is a QName
  (`libs/model-navigation/src/extractReference.ts`), and which file declares
  each kind, its extension and what in its content declares it (the core's
  `navigation/domain/modelDeclaration.ts`: `declaringFileExtension`,
  `declaresReferencedModel`). Only the capabilities live in `modeler-types`:
  two packages read them, the webview's navigation port (`apps/bpmn-webview`)
  and the context pad (`libs/model-navigation`), and `modeler-types`, which
  holds the type, is their common dependency. The source table is read only in
  `model-navigation`, the declarations only in the core.

A lookup keyed by the union makes the compiler report a missing member, so a
new engine, surface mode or reference kind is decided in every table before it
builds.

- **Typed, not name-based.** The rule reads the type checker through the parser
  services typescript-eslint already provides, so it sees the value under any
  name: a local, a parameter, a type parameter (resolved to its constraint),
  with `null` and `undefined` removed. A union whose literals all belong to a
  registered type counts as that type, so `ModelerMode` and
  `PropertiesPanelMode` (`"design" | "implement"`) are guarded as `SurfaceMode`.
  It reads the type a local or property (`change.kind`, `change["kind"]`) was
  declared with, not the narrowed one: after `tab === "diff"` fails, an
  unrelated `"view" | "diff"` narrows to `"view"`, which would match
  `SurfaceMode`. The narrowed type counts where the declared type is no
  string-literal union, or holds every value of a registered type
  (`MigrationScope`, which is `Engine | "both"`). A value of raw `string` or
  `unknown` is invisible until a guard such as `isEngine` or `isReferenceKind`
  or a parse such as `parseEditableMode` turns it into the type (parse, don't
  validate).
- **Opt-in.** Discriminated unions a domain function returns (`kind`, `status`,
  `AuthConfig`) are narrowed by design and stay unregistered. A type joins the
  registry when review or the change-coupling report shows a decision on it in
  two places. `SurfaceMode` joined when its decisions were spread over the
  webview, the properties panel and the modeler package. `ReferenceKind` joined
  because the form-only availability rule was written in both the context pad
  and the webview's navigation port, and a core service chose the files to
  search by comparing it.
- **Never vacuous.** The registry is resolved against the program on every run:
  a missing module, a missing export or a type that is no string-literal union
  throws, and so does a file without type information.
- **Exceptions.** An exception is an `eslint-disable-next-line` directive whose
  description reads `-- #<issue>: <reason>`;
  [`guardedValueComparison.spec.ts`](../../tools/repo-checks/src/guardedValueComparison.spec.ts)
  fails on one without, and `reportUnusedDisableDirectives: "error"` fails a
  directive that silences nothing. None exists today.
- **Cost.** `eslint .` took 10.1 s before and 9.2 to 10.4 s after, within
  run-to-run noise: the type program was built anyway for
  `parserOptions.project`. `tsconfigRootDir` pins that program to the repo
  root, so a run from a workspace directory gets type information too. The
  rule's own time (`TIMING=all`) is 0.52 to 0.57 s of an 11 to 12 s
  `eslint .` in five runs on a loaded machine; neither the second entry nor
  the declared and narrowed reading changed it beyond run-to-run noise.
- **Known misses.** `["c7"].includes(engine)`, `Set.has`, a comparison on a
  value typed `string`, a value used as data instead of compared (such as a
  kind spelled into a regex as an XML element name), a wider union compared
  before it is narrowed (`scope === "c7"` on a `MigrationScope`), a union
  holding only part of a registered type plus other values, narrowed into that
  part (`ModelerMode | "diff"`), which the rule cannot tell from the unrelated
  `"view" | "diff"`, and Kotlin.
- **False alarms.** Matching by value set reports an unrelated type whose
  literals all belong to a registered one (`type Tab = "view"`), or hold all
  of one and are narrowed into it. A local inferred from a narrowed value
  keeps the narrowed type, so the `"view" | "diff"` case above fires there
  too. Such a site takes the exception form above. None fires on the tree
  today: `corepack yarn lint` reports no error without a directive. The rule
  blocks anyway, because matching by value set is what found the
  `ModelerMode` and `PropertiesPanelMode` sites, 4 of the 11 `SurfaceMode`
  decisions, and a false alarm costs one issue-named directive.

Alternatives considered:

- **archunit** ran the VS Code spec before. It needed a Vitest matcher shim, a
  warm-up for its graph build, a cwd-independent re-read of each file and
  regexes for the specifiers it did not expose, and it carried 17 lockfile
  entries. It is removed.
- **dependency-cruiser** would catch nothing the engine misses here. A trial
  run on `main` found 1,600 of 1,619 relative imports extensionless TypeScript
  and the rest assets, and all 388 cross-workspace imports under `@miragon/*`
  names equal to their package names, so resolution is a suffix list plus a
  name lookup. Its TypeScript extractor reads the same forms; its baseline does
  not fail on stale entries and cannot name an issue; it would add 12 packages
  new to the lockfile; and it shares the engine's TypeScript `<7` API limit.
  Revisit it when a rule needs reach through npm packages or `exports` maps,
  which the built-graph checks (`check-design-pure-entry.mjs` and its
  siblings) cover today.
- **Sheriff** adds editor feedback through ESLint, but its tag and barrel rules
  would either repeat the spec rules or move them out of Vitest, losing the
  issue-named exceptions and the stale check.
- **A name-based `no-restricted-syntax` selector** on `engine` and `platform`
  instead of the typed guarded-value rule misses every alias, such as
  `const e = target.engine`.

### Fitness function report

A reported fitness function ([which ones block](#architecture-erosion)) plugs
into
[`tools/repo-checks/src/fitness`](../../tools/repo-checks/src/fitness/composition/fitnessFunctions.ts)
and never fails a build. `corepack yarn fitness` prints the report of the
current checkout against `git merge-base HEAD origin/main` as Markdown, or as
JSON with `--format json` for the [architecture review](#architecture-review).
It exits non-zero only on broken input: a base that names no commit (no
`origin/main` before a fetch), no merge base (a shallow clone), a `--repo`
that is no checkout root, a corrupt snapshot, or a fitness function that
throws or returns a malformed finding.

**Another base or tree.** `--base <rev>` compares with
`git merge-base HEAD <rev>`; `<rev>` need not be an ancestor of HEAD, so a
PR's head with its `baseRefOid` compares with the commit the PR branched from.
A squash commit on main compares with its first parent (its PR's `baseRefOid`
would add every PR merged in between), and a whole tree with itself, so every
finding is existing. `--repo <dir>` measures another checkout of this
repository, such as a worktree of an old commit: today's code of every fitness
function reads that tree, so it needs no install, and HEAD, the refs, the
snapshot branch and the base worktree are that checkout's. A relative `<dir>`
is read from the repository root. The review's measurement on known cases
needs both. A function that cannot measure an old tree throws
`InsufficientHistory` and is reported as not measurable there, and the others
report as usual. At `3d1b19b3` (#2047) with `--base 452b6440` the merge base
is `fb89b28e`; 6 of 9 functions measured against the stored snapshot of the
merge base. `convention-coverage` and `contract-suites` (no workspace declared
a kind yet) and `mutation-score` (no stored run on that chain) did not, and a
run took about 3 to 6 s on a laptop.

**Contract.** A fitness function declares `id`, `version`, its categories
(scope atomic or holistic, cadence triggered, result static or dynamic), what
it measures, the skill and rule it relies on, what it misses, what it reports
wrongly, its evidence (published work or a trial on this repository) and
`findFindings`. `defineFitnessFunction` makes a missing field, an empty list
or a `""` literal a type error and throws on whatever the types let through.
The report prints every one of those fields, so the limits travel with the
findings instead of living in a document that drifts. A function may declare
finding groups (`id`, `title`, `collapsed`); then every finding names one of
them, a finding naming an undeclared group is broken input, and the Markdown
prints one table per non-empty group in the declared order, a collapsed one
inside `<details>`. Within a table the rows are sorted by path, or by `rank`
(a positive integer a finding may carry) and then path when any row has one.
The delta stays key-based, so a pair that moves between groups stays existing.
A function may declare values (`id`, `title`); then a finding may carry a
finite number per declared id and leave out one that does not apply, such as
the complexity of a file without a function. An undeclared id, or a value from
a function that declares none, is broken input. Both fields are stored in the
snapshot; old snapshots without them still parse, so `schemaVersion` stays 1.
`findFindings` gets the tree, its commit and a `changeBase`: the merge base when
it measures HEAD, the commit itself for the base and every snapshot, so a
function that measures the branch's change finds nothing there by construction.
The rule it relies on
lands in a skill in the same PR and names the function's id; a static spec over
the registry checks both, and that ids are unique.

**Identity and delta.** A finding has a `path:line`, a message and a `key` the
fitness function builds from what the finding is about (paths, a symbol, a
value), never the line, like SARIF `partialFingerprints`. The delta matches
`key`s as a multiset: per key, as many head findings are existing as the base
held, the rest are new, and the base's leftovers are resolved. An old finding
stays visible as existing, so no fitness function keeps an allowlist. A finding
in a renamed file shows as new.

**Base findings.** Per fitness function, the stored snapshot of the merge base
when it holds the same `id` and `version`; otherwise today's code of the
function runs on a temporary `git worktree --detach` of the merge base, one
worktree for all such functions. Deterministic functions give the same result
either way, and running today's code keeps a version bump consistent. The tree
is 1,825 files and 17 MB; adding and removing the worktree took 0.4 s on a
laptop. No install is needed: the code runs from the checkout and only reads
the worktree.

**Trend.** For a function that declares values the report reads the stored
snapshots of the merge base's first-parent chain, 500 commits deep, and gives
each finding a trend: its values per point, oldest first, HEAD's last.
Equal consecutive values collapse into one point naming the oldest commit that
holds them, the PR that made the change. A commit without a usable entry (no
snapshot, another version, unmeasurable) is skipped, so a change behind a gap
is dated to the oldest stored commit that shows it. A commit that lacks the key,
or holds it twice, ends the series. A key that repeats at HEAD gets no trend,
and neither does one whose series ends before its first stored commit, such as
a file the PR adds: HEAD's values alone show no change, and the Markdown
prints `no trend` rather than `unchanged`. The trend keeps the newest five changes and the point before them. The Markdown
adds a Trend column that lists only the values that changed
(`code lines 300 → 330 → 348`); the JSON carries every point with its commit.
The trend is built from snapshots only, never recomputed on a worktree, so
nothing is measured that the push job has not stored.

**Snapshot store.** The orphan branch `fitness-history` holds one
`snapshots/<sha>.json` per first-parent `main` commit and one
`mutation/<run id>.json` per stored mutation run. `fitness-history.yml`
writes the snapshots on every push to `main`, the mutation workflow the runs,
both through the `store-fitness-history` composite action, which commits every
JSON file of a directory through the Git Data API with `GITHUB_TOKEN`, so
GitHub signs the commits and the ref moves by fast-forward only. A writer that
loses the race rebuilds its tree on the new head, up to 3 times; the files are
keyed by commit or run id, so a rebuild overwrites no other writer's file. The `main` ruleset targets only the default branch. The report reads the
branch from `origin/fitness-history` as last fetched, offline, with one
`git cat-file --batch` for all the commits it needs instead of a `git show`
per commit: the 100 stored snapshots of 2026-11-05 read in 64 ms.
Alternatives considered:

- **Workflow artifacts** expire after at most 90 days and need the network and
  a token to read.
- **Recomputing on demand** only is deterministic too, but a trend over a long
  history would cost one worktree and one run per commit, and a series git
  cannot recompute, such as a mutation score, would have no history at all.

**Versions and backfill.** A snapshot entry is `{ version, findings }` or
`{ version, unmeasurable }` per id. An entry of another version is not used for
the delta or a series. The push job measures HEAD on its checkout, then fills
missing `id@version` entries newest first over the last 500 first-parent
commits (back to 2026-09-04 at the time of writing), at most 100 commits per
run, so a version bump refills its series within a few pushes. A function that
throws `InsufficientHistory` is stored as unmeasurable at that commit and its
series ends there; older commits are not measured for it.

**Runner.** `tools/repo-checks/bin/fitness.mjs` loads the TypeScript entry with
Vite's `runnerImport` and the workspace's `vitest.config.ts` aliases; Vite is
already a dev dependency of the workspace, so no dependency is added. Node's
type stripping cannot resolve the engine's extensionless imports or the
alias-only `@miragon/architecture-testing`. `runnerImport` is marked
experimental, so a spec boots the bin; the fallback is a `vite build --ssr`
into a cache directory. Startup takes about 0.6 s.

### Change coupling

`change-coupling` (#2094) is the first registered fitness function: holistic,
triggered, dynamic, reported. It lists pairs of files that keep changing in
the same PRs without an import between them, the Common Closure Principle's
signal for a rule kept in two places (Gall 1998, Zimmermann 2004, code-maat).
The pure measure lives in `tools/repo-checks/src/changeCoupling/domain`, the
history reader and the window in `tools/repo-checks/src/history`, which
`hotspots` and #2095 reuse.

- **Window.** The 924 most recent first-parent commits, one squash-merged PR
  each. A commit count, not a date: the dates of the older history were
  rewritten on 2026-03-09. The function reads one commit more, which proves
  the oldest has a parent; fewer in a full clone throw `InsufficientHistory`
  and end the series there (378 commits are measurable today). A shallow clone
  with too few commits is broken input: it fails with `git fetch --unshallow`
  instead of printing an empty report.
- **Renames.** `git log --first-parent --diff-merges=first-parent -M -l0 -z
  --no-ext-diff --no-show-signature`, pinned so `diff.renames`,
  `diff.renameLimit` or `log.showSignature` in the user's config cannot change
  the result. Each historical path maps to today's path, newest commit first,
  through every commit, the uncounted ones included: the 12 commits with more
  than 30 read files carry 285 renames. Files that no longer exist drop out.
- **Read files.** Non-spec `.ts`/`.tsx` under a workspace's `src/`, Kotlin
  under `src/main/`, `.mjs` anywhere in a workspace except build configs
  (`*.config.*`) and test folders, `*.schema.json`, `*.cases.json` and a
  manifest that declares `contributes` (today `apps/vscode-plugin/package.json`).
  Specs, `__fixtures__`, `test/`, `languages/` and barrels are not read.
  Workspaces are the dirs the root `workspaces` entries match, with or without
  a `package.json`, so the Gradle-built IntelliJ plugin is read. Read literally,
  the issue's "outside `src/`" exclusion would have read no `.mjs` file at
  all, such as the `check-*.mjs` scripts or
  `libs/bpmn-i18n-extras/tools/build-overlay.mjs`.
- **Counted commits.** `chore(deps)`, `chore(main)`, `chore(format)` and
  `style` commits and commits with more than 30 read files are not counted.
  The size counts read files, as code-maat counts the entities of its log;
  counting every file instead drops the known lint-config copy and leaves 14
  hidden pairs.
- **Thresholds.** code-maat's defaults: at least 5 shared changes and a degree
  (shared ÷ mean revisions × 100) of at least 30 %, compared in integers
  (`shared × 200 ≥ 30 × (rₐ + r_b)`). Each file then has at least 5 revisions,
  so min-revs needs no check of its own. In the recount, 6 shared changes or a
  degree of 35 % lose the lint-config copy, 4 or 25 % raise the hidden pairs
  from 33 to 58 and 61, and a changeset limit of 8 leaves 2 hidden pairs
  without the copy.
- **Classification.** Linked: one file imports the other in the declaration
  graph; not reported. Explained: a file both import changed in at least half
  of their shared changes, the one with most co-changes winning, ties by path;
  listed in a collapsed group, because such a pair can still hide a copy.
  Hidden: grouped as Kotlin only, across languages (Kotlin, JSON,
  TypeScript/JavaScript as one), across workspaces, within a workspace.
- **Composition roots.** A file in a `composition/` role folder, an entry a
  workspace's `package.json` or a build config at its root names (any string
  literal that resolves to a file of the workspace), or a contributing
  manifest. A pair with one is marked in its message, never dropped.

Recount at `7d0ba862`: 129 coupled pairs, 64 linked, 32 explained, 33 hidden
(6 across languages, 14 across workspaces, 9 within a workspace, 4 Kotlin only;
11 with a composition root), against 127, 63, 36 and 28 in the trial of
2026-10-31. `BpmnLintConfigService.ts` ↔ `LintConfigService.ts` is listed, and
no port and adapter linked through `hostPorts.ts` is hidden. Counting each
skipped commit type changes no pair in this window; the types stay skipped
because a release or formatting commit under 30 read files would otherwise add
pairs for no shared reason. A run on this checkout, HEAD and the merge-base
worktree, takes 2.3 s; one backfill step takes about 1 s.

Alternatives considered:

- **A failing gate with an exception list.** A replay of 200 PRs had 50 edit
  the list and 9 fail on files they did not touch, because the window slid.
- **code-maat itself** needs a JVM and reads no imports, so it cannot tell a
  linked pair from a hidden one.

### Convention coverage

`convention-coverage` (#2127) reports the code the role-folder convention does
not cover: atomic, triggered, dynamic, reported. Every other fitness function
reads the role folders, so a file outside one, or in one its imports
contradict, escapes all of them. In reflexion-model terms (Murphy, Notkin,
Sullivan 1995) the folders are the mapping and the rules the high-level model;
the function reports the files the mapping misses and the divergences. The pure
measure lives in `tools/repo-checks/src/conventionCoverage/domain`.

- **Read files.** Tracked `.ts` and `.tsx` under the `src/` of every workspace
  whose manifest declares `"architecture": "hexagonal"`, without specs,
  declaration files and `__fixtures__`, as the blocking spec reads them. No
  such workspace, as before #2138, throws `InsufficientHistory`.
- **Rules.** Every rule of `HEXAGONAL_RULES` runs without the blanket
  exceptions of the blocking spec: the files those excuse are the remaining migration work,
  and a migrated workspace shows none. One finding per file and rule, at the
  first offending import; the placement rule points at line 1. The type rule
  no spec blocks: a class whose `implements` clause names an interface declared
  in a `port/` of any hexagonal workspace, outside `adapter/out/` and
  `testing/`, one finding per file at its first such class. `testing/` may
  implement a port: its fakes do.
- **Groups.** Outside every role folder (`unmapped`), imports that contradict
  the folder (`divergent-import`), a port implemented outside `adapter/out/`
  (`misplaced-port-implementation`).

First run at `03b31896`: 62 findings. Unmapped: 42 (`apps/bpmn-webview` 22,
`libs/element-template-builder` 12, `apps/form-webview` 4,
`apps/deployment-webview` 4). Divergent imports: 19, of which 12 are
“nothing imports an entry” in the flat `src/` roots of the four webviews and 7
are template-builder `domain/` files importing its `catalog/`. Misplaced port
implementations: 1, `EditorSessionDocuments` in `editorSession/service`
implementing `DocumentPort`. Of 87 implementing classes, 46 sit in
`adapter/out/` and 14 in the core's `testing/`; 4 implement only `vscode`
interfaces. The migrated workspaces show none. Reading and measuring 451 files
in 9 workspaces takes about 0.5 s per tree.

Alternatives considered:

- **A blocking rule for port implementations.** Detecting a role by type is
  what the role folders were chosen over (see
  [Workspace kinds and role folders](architecture-and-hosts.md#workspace-kinds-and-role-folders));
  reported, the rule informs without overriding the folder.
- **A second, report-only rule list.** One rule set, run with the exceptions in
  the blocking spec and without them here, cannot drift between the two.

### Repeated value sets

`repeated-value-sets` (#2050) reports a set of allowed values written in two
or more files: atomic, triggered, static, reported. Copies of a set drift
(#1983: the VS Code setting offered 9 of the 12 languages), but they are
identical when they are born, so a report of the sets a branch adds catches a
copy before it drifts. Unintended inconsistent changes to clones are
frequently faults (Juergens, Deissenboeck, Hummel, Wagner, ICSE 2009). The
rule it relies on is in the `architecture` skill: a value set has one home;
every other use imports it, a TypeScript copy that cannot is pinned to it by
`expectTypeOf<Copy>().toEqualTypeOf<Home>()` in a spec, and a copy outside
TypeScript by a spec. The pure measure lives in
`tools/repo-checks/src/repeatedValueSets/domain`.

- **Read files.** Every tracked `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`,
  `.mjs` and `.cjs` file, without specs, tests and `__fixtures__/` folders
  (inputs of tests, as convention coverage leaves them out), declaration files
  (third-party typings repeated per workspace) and build configs
  (`*.config.*`). No home is declared. Kotlin and JSON are not read, and
  neither are dependencies: a set whose home is a package, such as the 12
  locales of `@miragon/bpmn-modeler-i18n`, has one occurrence where a single
  tracked file copies it. At `cd48f2cd` the `LOCALES` array of
  `libs/bpmn-i18n-extras/tools/build-overlay.mjs` was such a copy and gave no
  finding.
- **Sets.** `readValueSets` of the engine: an array literal whose elements are
  all string or plain template literals, a union type whose members are all
  string literal types, a maximal `||` chain whose operands all compare one
  subject with `===` to a string literal. A set has at least 2 distinct values,
  so the 2-value placeholder types of #2047 count; order and repeats do not
  matter. Comments and string contents never yield a set.
- **Pins.** `findTypeEqualityPins` of the engine over every tracked script
  file, specs included, through barrels and the `tsconfig.base.json` paths.
  Files a pin links count as one place for every set they hold, so a pinned
  copy and its home give no finding, and a third, unpinned copy brings all
  three back. A pin links only files that both hold the set, and it links
  files, not declarations: it also clears any other set the two files share.
  A runtime spec pin, such as `expect(copy).toEqual(home)`, is not read; the
  skill asks for it only where TypeScript cannot reach the copy, and Kotlin
  and JSON are not read either.
- **Identity and delta.** One finding per occurrence of a set that spans two
  files, keyed by its path and its sorted values, not its line, and naming
  every other occurrence. A copy a branch adds is new, and so is the home of
  a set that was in one file only at the base; removing one of three copies
  resolves it and leaves the other two existing. Two occurrences in one file
  are the same key twice. A copy that drifts, a value added to or removed from
  one copy only, shows as resolved, not new: the head no longer holds the set
  in two files, and nothing at the head relates the two now different sets.
  The report reads the drift, #1983's failure, as a fix. The function's
  `reportsWrongly` and the `architecture` skill say so: a resolved set is a
  fix only where its copies are gone, import their home or are pinned to it.

Measured at `bed5599f`: 573 sets in 822 files, 36 written in two or more
files, 13 of them with 3 or more values, 106 findings. Among them the auth types
(`deploymentTarget.ts`, `modeler.ts`), the theme modes (4 files), the bpmn-js
popup ids, `clean|flushed|host-updated|unavailable` (`messages.ts`,
`modeler-flush-reply.ts`), `added|deleted|modified` and `directory|file` (14
occurrences in 9 files); the noise is git arguments, `typeof` chains and
`name|value`. Reading `__fixtures__/` as well added 31 files and 8 findings,
all of them noise or test parameters: the log levels of two test fakes,
`left|right`, `ignore|pipe` and a harness's `c7|c8`. A shared `trackedFiles` replaced the `git ls-files -z` arguments two
adapters had repeated, and the new adapter reads through it too. A scratch
spec pinning `AuthTypePayload` (`@miragon/bpmn-modeler-shared`, through its
barrel) to `TargetAuthType` cleared the auth types' 2 findings. On `3d1b19b3`
(#2047) it lists 3 of the 5 rule sets the review named as duplicated: the FEEL
types, the placeholder types and the condition operators. Reading and
measuring takes about 0.5 s per tree; resolving a pin builds the declaration
graph of every script file and adds about 0.5 s, so a tree without
`toEqualTypeOf` skips it.

Alternatives considered:

- **A failing gate over home folders.** Measured at `265f3472`: 41 home sets,
  three repeats, all known. Exact equality misses partial copies, the
  languages' home lies outside both home globs, so #1983 would have passed,
  and every coincidence would need an allowlist entry.
- **One finding per set**, keyed by its file list: removing one of three
  copies would show the remaining two as new.
- **Comparing the base and the head tree** to report a drift as new. A fitness
  function measures one tree; the base is often a stored snapshot of findings,
  not a tree, so a cross-tree measure has nothing to read there.
- **A comment marker on a pinned copy** instead of reading the pin. It is a
  hand-kept exception the assertion does not check, and it outlives a deleted
  pin.

### Size and complexity

`size-and-complexity` (#2057) reports per file its code lines and the highest
cyclomatic complexity of a function in it: atomic, triggered, dynamic,
reported, with the trend of both values. A service that grows stops being
orchestration and starts holding rules; #1799 named `BpmnLintConfigService`
(635 lines then, 348 after the epic) as the example, and nothing showed when a
file grew back. Line count is a weak sign of a rule, and a limit would fire on
a long table of values, so this is a report, not an ESLint `max-lines` or
`complexity` rule.

- **Read files.** Tracked `.ts`, `.tsx`, `.mts` and `.cts` in every root
  workspace dir (`docs` and `tools/*` included), without specs, declaration
  files and test folders (`__fixtures__`, `__tests__`, `test`, `tests`). The
  test-folder set and the spec pattern have one home,
  `tools/repo-checks/src/sourceFiles/domain/sourceFiles.ts`, which change
  coupling imports too.
- **Code lines.** cloc's definition: a line with at least one token that is
  not trivia. A multi-line template counts every line it spans; whitespace-only
  JSX text counts none.
- **Complexity.** `readFunctionComplexities` in `@miragon/architecture-testing`
  mirrors ESLint 10.13's `complexity` rule, classic variant: a unit per
  function, method, constructor and accessor with a body, class field
  initializer and class static block starts at 1 and adds 1 per `if`, `?:`,
  `&&`, `||`, `??`, logical assignment, loop, `catch`, `case` with a test,
  default value (parameter, binding element, destructuring assignment) and
  `?.` access or call. A nested unit counts on its own, top-level code and
  types not at all. A finding points at the most complex unit, the first of a
  tie. A parity run of ESLint with `complexity: 0` over the 827 measured files
  it lints at `e8c92425` (it ignores `docs/.vitepress`) reported 6,627 units;
  none differed in complexity or line. 74 are over 10, 8 of them in
  `libs/modeler-core` services: `verifyActive` 23, `flushIntoDocument` 22,
  `HostTokenSession.run` 18, `requestFlush` 15, `handleReply` 13,
  `FormPreviewService.read` 13, `carryOut` 12 and `setElementTemplates` 11.
- **Values and trend.** `codeLines` and `complexity` (left out for a file
  without a function) are declared values, so the report's trend shows a file
  that grew in each of its last PRs. The table folds into one collapsed group:
  835 rows unfolded bury the new ones, which the counts above it name.

Snapshots grow with it: a backfill of 100 commits at `e8c92425` wrote
snapshots of 351 KB on average and 436 KB at most, against 85 KB before, so
the `store-fitness-history` action commits 5 files per tree request instead
of 20 to keep a request at about 2 MB. A backfill step that measures this function and
`hotspots` on a worktree took 0.8 s. A report over those 100 snapshots took
4.3 s, 221 of 835 files showing a change, in 196 KB of Markdown.

### Hotspots

`hotspots` (#2057) ranks the files that are both large and changed often:
holistic, triggered, dynamic, reported. A hotspot is a place to look for a rule
in the wrong home (Tornhill, Your Code as a Crime Scene, 2015, 2nd ed. 2024).

- **Revisions.** The counted first-parent commits among the 924 of the history
  window (`HISTORY_WINDOW` in `history/domain`, the one home for both this and
  change coupling) that changed the file, renames followed through every
  commit. Mechanical commits (`isMechanicalCommit`) are not counted. There is
  no changeset-size cut: code-maat applies `max-changeset-size` to coupling
  only, so a file's revisions here can exceed its count in `change-coupling`.
  Fewer than 925 commits reaching back throw `InsufficientHistory`.
- **Score.** Revisions × code lines, descending; ties by revisions, then code
  lines, then path; the top 20 are reported with their `rank`. Tornhill's
  `merge_comp_freqs.py` (maat-scripts) sorts by revisions only and takes cloc's
  `code` column as complexity; his `crime-scene-hotspots.html` draws circle
  area = code lines and fill opacity = revisions ÷ max revisions. The score is
  the product of those two dimensions; normalising does not change the order.
  The product is ours, not his script's, and the output says so.
- **No trend of its own.** Findings carry no values; the per-file trend is
  `size-and-complexity`'s, joined by path.

Trial at `e8c92425`, 924 commits, 835 measured files: the product's top 20
holds 5 of the 8 `libs/modeler-core` services over 300 lines that #2057 names
(`DeploymentMessageDispatcher` 11th, `DeploymentTargetService` 14th,
`CodeLinkMapService` 17th, `BpmnLintConfigService` 18th, `DeploymentService`
19th; `TemplateMarketplaceService` 23rd, `EditorSessionStore` 24th,
`SourceIndex` 62nd). Ranking by revisions alone holds none of them and puts
three barrels, `apps/bpmn-webview/vitest.config.ts` and the 60-line
`apps/vscode-plugin/src/main.ts` in its top 20. The first places go to
`libs/shared/src/lib/modeler.ts` (46 × 794), a type-only protocol file that
holds no rules, which the function names as a false report.

### Missed partner

`missed-partner` (#2095) warns when the branch changes a file without the
partner it usually changes with: atomic, triggered, dynamic, reported. It
catches drift in the PR where it happens, which `change-coupling` cannot: a
drifted copy is one that changed without the other, so its co-change stays
low (1 of 9 known copies listed). It mines association rules F → P from the
history (Zimmermann et al., ROSE, ICSE 2004 / TSE 2005) and lives in the
`changeCoupling` context, reusing its read files, counted commits and history
reader.

- **The change.** `git diff --name-status -M -l0 -z --no-ext-diff
  --no-relative <changeBase>`: the working tree against the merge base,
  uncommitted edits included, untracked files not. The change goes in front
  of the history window as its newest record, so its renames are followed into
  the history, and a deleted file or partner drops out. An added file has no
  history. An empty change returns no finding before any history is read, so
  the base run and every snapshot are empty and cheap, and every warning in
  the report is new.
- **History.** The 924 first-parent commits up to the merge base, counted as
  in change coupling (no mechanical commits, none with more than 30 read
  files), and none without a read file, so the lift's denominator counts only
  commits that could have held a partner.
- **Rule.** F is a read file the change holds, P a read file it does not. A
  warning needs at least 5 shared changes, a confidence (shared ÷ r(F)) of at
  least 60 % and a lift (shared × N ÷ (r(F) × r(P))) of at least 4, compared in
  integers. The lift floor is there because confidence ignores how often P
  changes anyway; Moonen et al. (ASE 2016) do not rank lift among the best
  measures, so the floor rests on the replay, not on the literature. Findings
  are keyed `F → P`, sit on F's line 1 and are ranked by confidence, then lift.
- **Replay.** `corepack yarn fitness missed-partner replay` replays the 200
  first-parent commits before the newest 10, skipping mechanical ones, and
  computes each commit's warnings from the 924 commits before it. A warning
  hits when P changed in one of the next 10 first-parent commits. Its chance
  rate is the share of 10-commit windows in those 924 commits in which P
  changed, averaged over the warnings. "Changed" means any first-parent
  commit for both. It prints precision, chance rate and margin for confidence
  30, 40, 50 and 60 % × lift 1, 2, 4 and 8.

Replay at `f9560b0a`, 194 commits replayed:

| Confidence | Lift | Warnings | Precision | Chance | Margin |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 30 % | 1 | 814 | 25.3 % | 25.6 % | −0.3 |
| 30 % | 4 | 631 | 26.9 % | 19.9 % | 7.0 |
| 40 % | 1 | 498 | 25.5 % | 23.9 % | 1.6 |
| 40 % | 4 | 426 | 27.2 % | 19.7 % | 7.5 |
| 50 % | 1 | 314 | 26.8 % | 22.2 % | 4.6 |
| 50 % | 4 | 292 | 27.1 % | 19.9 % | 7.1 |
| 60 % | 1 | 157 | 31.2 % | 20.2 % | 11.0 |
| 60 % | 4 | 155 | 31.6 % | 19.8 % | 11.8 |
| 60 % | 8 | 131 | 31.3 % | 15.6 % | 15.7 |

Up to 50 %, confidence alone stays near chance (−0.3 to 4.6 points) and the
lift floor of 4 raises the margin to 7.0–7.5. At 60 %, confidence alone reaches
11.0 points; the floor drops 2 of its 157 warnings, both misses, for 11.8
points at 0.8 warnings per replayed commit. It stays as the guard against a
partner that changes in most commits, which confidence does not see. A probe
at 70 % and 80 % kept the margin (11.5, 11.7) at 94 and 46 warnings, so 60 % is
chosen.
Lift 8 at 60 % widens the margin only by lowering the chance rate: the 24
warnings it drops hit as often (8 of 24) as the ones it keeps, so the floor
stays at 4. The price is the known lint-config copy:
`LintConfigService.ts` changed in 5 of 15 changes to
`BpmnLintConfigService.ts` (33 %, lift 9.7) and is warned only at 30 %. The
10-commit proxy is weak, as drift is rarely fixed that fast; read the
precision as a rough guide. The report with this function takes 3.8 s on this
checkout; the replay 2.1 s.

Alternatives considered:

- **A failing gate.** #2049 blocks only static fitness functions; co-change
  is a habit, not a rule, so a gate would fail correct PRs.
- **Confidence alone.** Near chance up to 50 % in the replay above and at
  30 % in the throwaway replay at `773f8014`, where frequently changed
  partners hit 35 % against 34 %. At 60 % it nearly matches the floor (11.0
  against 11.8 points), but nothing then keeps out a partner that changes in
  most commits, as in the 2 warnings the floor drops.
- **Added value** (confidence minus P's change rate, in Moonen et al.'s top
  group). In the throwaway replay it widened the margin to 8 points against 13
  for lift 4.

### Host text

`host-text` (#2052, #2167) reports user-visible text written in host code:
atomic, triggered, static, reported. When a host words a text of its own, the
hosts drift apart: VS Code and IntelliJ built the engine-version label
separately and the labels differed (#2000), both hosts built the token
prompt's title until #2046 moved it into the core, and the add-marketplace
dialog is "Add Marketplace" in VS Code and "Add Template Marketplace" in
IntelliJ. The rule it relies on is in the `architecture` skill: the core builds
every user-visible text, and a host renders it. Host chrome and messages about
the host's own failure belong to the host
([Host integrations](architecture-and-hosts.md#host-integrations)), and a rule
over host text would fire on them, so the function reports and never blocks.
The pure measure lives in `tools/repo-checks/src/hostText/domain`. Version 2
reads Kotlin; a new version restarts the series, which the engine recomputes
from git.

- **Host code.** Every tracked `.ts`, `.tsx`, `.mts` and `.cts` file, without
  specs, tests, `__fixtures__/` folders and declaration files, that imports
  `vscode`, or that sits outside `libs/modeler-core` and holds a class whose
  `implements` clause names an interface declared there, through barrels and
  the `tsconfig.base.json` paths (`findImplementations` of the engine). The
  second form reaches the bridge's RPC adapters, which do not import
  `vscode`. Every tracked `.kt` file in a `src/main/kotlin` folder, Gradle's
  main source set, that imports a `com.intellij` package, the IntelliJ
  Platform API, as a TypeScript file imports `vscode`. `apps/intellij-plugin`
  is no Yarn workspace, so the folder is matched wherever it sits. The function
  reads imports, types, one workspace folder, `libs/modeler-core`, and the
  source set folder; no file name and no folder below the source set.
- **Texts.** `readTextLiterals` of the engine reads TypeScript: every string
  literal, plain template literal and template expression, with its line, its
  literal stretches and the calls whose arguments hold it. A literal in a type
  or a module specifier is not read. `readKotlinTextLiterals` reads Kotlin
  through a small lexer in `tools/architecture-testing` (`kotlinLexer.ts`), no
  new dependency: strings, raw strings (`"""`, no escapes, the last three
  quotes of a run close it), multi-dollar strings, nested block comments,
  character literals and `${…}` with braces, strings and comments inside, so a
  quote inside a placeholder never ends the string around it. A call's callee
  is the name before its `(`, its receiver the name before the `.` or, on a
  call's result, that call's callee (`thisLogger` in `thisLogger().warn(…)`);
  a `(` after `fun`, `class` or a keyword such as `if` opens no call, past
  type parameters whatever their bounds hold (`fun <T : Any> List<T>.f(…)`).
  `readKotlinImports` reads the imports with the same lexer; a line break, a
  `;` or `as` ends one. Neither reads types. In both languages the calls
  around a literal end at the nearest function or lambda (in Kotlin, the
  nearest brace): code a callee runs is no argument it is handed.
- **A text** is a literal one of whose stretches holds two words: two
  whitespace-separated tokens that each hold a letter or a digit. A placeholder
  is no word, so formats such as `${a}: ${b}` and `$(${icon}) ${label}` hold no
  text; at `8d75923b` judging the joined template instead added 9 findings,
  all such formats, and no text. Punctuation around whitespace is no text
  either: at `cd48f2cd` requiring a letter or a digit on both sides dropped 9
  findings, 3 CSS selector lines such as `:root {`, 4 scripts
  `window.postMessage(${…}, '*');` and 2 Markdown formats, and no text.
- **Not read.** A literal inside the arguments of `new Error(…)`, of a call a
  Kotlin `throw` raises (Kotlin constructs without `new`), of `log` or a
  `log` + capital function (`logError`, not `login`), or of a call on `log`,
  `LOG`, `logger`, `thisLogger` or `console`, up to the nearest function or
  lambda. `thisLogger()` is the logger IntelliJ recommends, so new Kotlin
  host code logs through `thisLogger().warn(…)`; the tree holds none yet.
  Version 1 read through functions, so it skipped every text inside
  `logAndRethrow(async () => …)`: 5 texts of `CommandController.ts` at
  `cd48f2cd`. Kotlin's `error(…)`, `require(…)` and `check(…)` throw, but the
  UI DSL's validation `error(…)` shows its text, and a callee name cannot tell
  them apart, so they are read. An exception Kotlin constructs without
  throwing it, as in `completeExceptionally(IllegalStateException(…))` or
  `Result.failure(IOException(…))`, is read too: without `new` a constructor
  cannot be told from a call. A Kotlin log message built in a lambda or in a
  braced `if`, `when` or `try` block, such as `log.debug { … }` or
  `log.warn(if (a) { … } else { … })`, is read as well, because the calls
  around a literal end at any brace. At `cd48f2cd` the tree holds neither.
- **Identity and delta.** One finding per literal, keyed by its path and its
  whitespace-collapsed text, not its line; the message is the text, cut at
  100 characters. Moved code stays existing, the same text twice in a file
  counts twice, and a changed text shows as new and its old wording as
  resolved. No allowlist: host chrome stays visible as existing.

First run of version 2 at `cd48f2cd`: 956 files read, 89 of them Kotlin. 137
host files: 48 import `vscode`, 17 only implement a core interface (14 of them
the bridge's RPC adapters, which hold no text), and 72 Kotlin files import
`com.intellij`. The other 17 Kotlin files are not host code; they hold 27
two-word texts, 2 of them user text (the locale names of `ModelerLocales.kt`)
and 25 technical (the CSP and bridge script of
`WebviewContentSecurityPolicy.kt`, MIME types, two developer errors). 197
findings in 43 files:

- TypeScript, 52 in 12 files, all in the VS Code host: 35 texts the host
  builds (18 in `TemplateMarketplaceController.ts`, the add and remove
  marketplace flow; 5 each in `BpmnCompareController.ts` and
  `CommandController.ts`, the language picker and the new-file dialogs; 3
  completion labels; 2 each in `ElementTemplateEditorController.ts` and
  `releaseNotes.ts`), 3 correct host texts ("Reload Window", the compare
  view's failure, the `write to` fragment of a write error) and 14 technical
  strings or log text (the HTML shells and CSS class lists of the webview
  HTML, Markdown formats, an error text a host matches, two ready messages
  passed to a logger as a parameter).
- Kotlin, 145 in 31 files: 25 texts the IntelliJ host builds (8 in
  `AddMarketplaceAction.kt` and 7 in `RemoveMarketplaceAction.kt`, among them
  "No marketplaces registered.", which `TemplateMarketplaceController.ts`
  words as well; the new-file dialogs, the language picker, the SVG copy and
  save texts, and the completion type text "process variable"), 33 on the
  settings page (`ModelerSettingsConfigurable.kt`), 13 host chrome (editor,
  file type, diff tool, tool window and status widget names, notification
  group ids), 24 messages about the host's own failure (JCEF unavailable, the
  bridge crash balloons of `ProcessSupervisor.kt`, the out-of-process JCEF
  notice, RPC error replies, the missing-bridge `error(…)`) and 50 technical
  strings (39 HTML, MIME and 404 strings in `WebviewServer.kt`, the JavaScript
  the JCEF editors run, the DMN template, two credential service names, a log
  redaction marker). Not read: 35 two-word texts in Kotlin log calls and 1 in
  a thrown constructor.

Both hosts word the same dialogs: "New BPMN Model", "New DMN Model" and
"process variable" are written in each, and the language picker already
differs ("Select the modeler language" against "Select the modeler UI
language"). The naive quote-pairing count of #2167 expected most Kotlin
findings to be CSS (41 in `IdeThemeSignal.kt`); the placeholder and word rules
leave 2 there, both JavaScript. The settings page describes the settings that
VS Code's `package.json` describes, which no fitness function reads; whether
the two are pinned to each other is a separate decision. The name scope
`infrastructure/VsCode*.ts` the first issue proposed matched 27 files at
`3d1b19b3` and matches none since the role-folder move. At `3d1b19b3` (#2047)
the report lists the 7 texts of `ElementTemplateEditorController.ts`, which sat
in `controller/` outside that scope, among them `${…} already exists in ${…}.`
and the folder-pick placeholder; version 2 finds 205 findings there, 58
TypeScript and 147 Kotlin. Reading and measuring takes 0.46 to 0.70 s per
tree on a loaded machine; version 1 took 0.40 to 0.68 s in the same runs, so
Kotlin adds less than 0.1 s.

Alternatives considered:

- **An ESLint rule with an allowlist.** Host chrome is correct, so the rule
  fires on correct code and its allowlist is work in every PR that adds a
  button; the delta shows what is new without one.
- **A name scope** (`infrastructure/VsCode*.ts`). It saw 12 of 44 files that
  import `vscode` at `773f8014`, missed the controller of #2047, and the move
  to role folders emptied it.
- **Every literal of a template joined with its placeholders.** It reports
  format strings that hold no word, as measured above.
- **A regex that pairs quotes in Kotlin.** It splits a raw string with quotes
  inside and a template whose placeholder holds a quote, such as
  `"Saved ${names.joinToString(", ")} files"`, into wrong literals.
- **A Kotlin parser.** It is a new dependency (#2049), and the measure needs
  only strings, comments, placeholders and the name before a `(`.
- **A second function for Kotlin.** Same rule, same skill and one report
  section; a version bump restarts the series instead.
- **Kotlin trailing lambdas as arguments of their call.** It keeps lazy log
  messages unread, but hides the UI a wrapper runs, as `logAndRethrow` did in
  TypeScript, and needs class-body tracking to keep `class A : B(x) { … }` out
  of `B`'s arguments.
- **Excluding `error(…)`, `require(…)` and `check(…)` by name.** It hides the
  validation text of `AddMarketplaceAction.kt` to drop one developer error.
- **Excluding markup or arguments of `executeJavaScript`.** Markup also wraps
  user text (`<code>`, `<b>` on the settings page), and a callee name is not
  call shape; the technical strings stay reported.

### Contract suites

`contract-suites` (#2054) reports each adapter of a core port whose specs run
no contract suite of that port: atomic, triggered, static, reported. When two
hosts implement a port, each decides its rules again, and the in-memory fakes
of the test kit can disagree with both: the script folder policy differed
between VS Code and the bridge (#1830), and file lists came in a different
order per host (#2034, #2040). A contract suite runs the same scenarios
against every adapter, so a rule one adapter breaks fails a spec: every
implementation has to keep the specification of the type it implements
(Liskov and Wing, A Behavioral Notion of Subtyping, 1994). The rule it relies
on is in the `architecture` skill: a port the core reads back from has a
contract suite in the core's test kit once a second class implements it, and
every adapter of the port runs it, the in-memory fake included. A port that
only renders and a strategy the core chooses between are correct without one,
so a rule over every port would fire on correct code; the function reports and
never blocks. The pure measure
lives in `tools/repo-checks/src/contractSuites/domain`.

- **Ports.** An interface declared in a `port/` folder of the hexagonal
  workspace that holds `@miragon/bpmn-modeler-core/testing`, resolved through
  the `tsconfig.base.json` paths: the core. The rule is about ports the core
  reads back from, and only a helper of the core's kit can cover them, so the
  `port/` folders of the hosts and the tooling are not read. At `cd48f2cd`
  they would add 18 pairs no helper can cover, all set aside: 12 with one
  adapter each (11 adapters of `tools/repo-checks` ports and `RpcEditorHandle`
  as the bridge's `HostEditorHandle`) and 6 render-only pairs of bridge and
  tooling ports. The 42 pairs without a suite would stay the same.
- **Adapters.** A named class outside specs, declaration files and test
  folders (`__fixtures__`, `__tests__`, `test`, `tests`, the patterns of
  [Size and complexity](#size-and-complexity)) of any hexagonal workspace
  whose `implements` clause reaches the port, also through an interface that
  extends it or an intersection that holds it: `RpcEditorHandle` implements
  the bridge's `HostEditorHandle`, which extends `EditorHandle`, and every
  `NotifierPort` adapter is a `LoggerPort` adapter. Host adapters and the
  in-memory kit count alike.
- **Helpers.** A function the kit exports with a parameter that produces the
  port: a factory whose awaited return is the port or an object one of whose
  properties holds it, as `WorkspaceContractFixture.workspace` holds
  `WorkspacePort`. A type parameter stands for its constraint, so a generic
  fixture `{ workspace: W }` with `W extends WorkspacePort` holds the port,
  and an intersection for each of its parts; an unconstrained one holds none.
  A helper the kit re-exports by name or by `export *` counts like one it
  declares. A parameter typed as the port itself does not count. At
  `cd48f2cd` it would add `readSettingsSnapshot(settings: SettingsPort)`, which
  the VS Code and bridge settings specs call over the shared normalization
  cases, and it would make any kit function that reads a port a suite. A
  helper whose fixture holds several ports counts as a suite of each.
- **Coverage.** A spec covers a pair when it imports the adapter class as a
  value and calls a helper of the port. The label argument is free, the call
  need not pass the class, and a type-only import does not count. Coverage is
  decided per spec, not per call: a spec that imports two adapters of a port
  and runs the suite against one clears both pairs. No spec does that at
  `cd48f2cd`.
- **Render-only.** A port whose members all return `void` or `Promise<void>`,
  `void | Promise<void>` and `PromiseLike<void>` included, is render-only: its
  pairs are marked in a collapsed group, not listed as missing a suite. A
  property that is no function, an overload that returns a value and a generic
  `Promise<T>` are reads. A port that has a suite lists every adapter that
  skips it, render-only or not. On the ports the issue names, `StatusBarPort`
  (`show`, `hide`) and `DiagnosticsPort` (`publish`, `clear`) are render-only.
  `NotifierPort` is not: `withProgress<T>` returns the task's `Promise<T>`, and
  its three adapters hand that result back in three ways (VS Code's progress
  API, `try`/`finally` around the bridge's progress notifications, a direct
  call in the fake), so they are listed as true findings, while its base
  `LoggerPort` is render-only.
  `LintingPreferencePort.setLintingEnabled` returns `void | Promise<void>`, so
  that port is marked render-only although the core reads the value back
  through `SettingsPort.getLintingEnabled`.
- **One adapter.** A port the core reads back from with one adapter and no
  suite has nothing to drift from yet: the kit has no fake of it, and a fake
  written inside a spec is no adapter. Its pair is set aside in a collapsed
  group, derived from the adapter count as render-only is from the types, and
  moves up to the ports without a suite when a second class implements the
  port.
- **Types, not names.** The type checker resolves every implemented
  interface, helper parameter, member and import over one program: the
  tracked sources of every hexagonal workspace, specs included, with the
  compiler options of `tsconfig.base.json` and no `@types` package. Every path
  is taken under the real repository root: the compiler resolves an import
  through `node_modules` to its real path, so under a symlinked root a spec
  that imports a workspace package by name would get a second copy of the
  adapter class and lose its pair. Only specs that import an adapter have
  their calls resolved; resolving the calls of every spec took the spec pass
  two to four times as long in three trials.
- **Identity and delta.** One finding per pair without a suite, at the
  adapter's class, keyed by the adapter's and the port's path and name, not
  the line. The groups are adapters that skip their port's suite, ports the
  core reads back from without a suite, ports with one adapter and render-only
  ports, the last two collapsed. Within a group the rows are ranked by the
  port's number of adapters, so the ports whose adapters can drift apart come
  first. A new adapter of a port with a suite
  shows as new until its spec runs the suite; a spec that starts running it
  resolves the pair.
- **History.** The function says why it cannot measure a commit instead of
  reading an empty tree as clean. Before the workspaces declared their kinds,
  the kit's workspace declares no hexagonal architecture (`bb6ae7ae`); until
  #2139 moved the core into role folders, the core declares no interface in a
  `port/` folder (`12ff0d9d`). The domain decides the core from the kit's file
  and the hexagonal workspaces, and words both reasons.

First run at `cd48f2cd`: 23 ports in the core's `port/` folders, each with an
adapter; 55 adapters; one helper, `describeWorkspaceContract`; 73 specs that
import an adapter. Of 59 pairs, 2 run the suite (`InMemoryWorkspace`,
`NodeWorkspace`), and 57 are findings. `VsCodeWorkspace` is the only adapter
that skips an existing suite, and the report names it first. 42 pairs of 15
ports have no suite: 12 ports with three adapters (36 pairs), and
`DiffPaneHandle`, `DocumentPort` and `PropertiesPanelStatePort` with two.
3 pairs are set aside because their port has one adapter:
`EngineInspectionPort`, `HttpClient` and `LintRunnerPort`. 11 pairs are
render-only: `StatusBarPort`, `DiagnosticsPort` and `LoggerPort` with three
adapters each and `LintingPreferencePort` with two. Against the issue's survey
by name, the types add `DiffPaneHandle` (no `Port` in its name),
`RepositorySource` (the GitHub, GitLab and local template sources),
`LoggerPort` and the three ports with one adapter, and today
`RpcLintingPreference`, not `BridgeSettings`, implements
`LintingPreferencePort`. 11 pairs are none of the issue's backfill ports,
render-only ports or engine strategies: the 3 with one adapter, `NotifierPort`
(3, whose `withProgress` the core reads back), `RepositorySource` (3,
strategies of their own) and `DiffPaneHandle` (2).
Building the program and reading took 1.3 to 1.8 s on the working tree and
0.9 to 1.9 s on checkouts of the branch and of `cd48f2cd` without
`node_modules` (six runs each, load average 2 to 4), with the same 57
findings. `corepack yarn fitness` took 6.4 to 6.6 s in nine runs instead of
3.0 to 3.8 s in three on the merge base, at a load average of 2 to 3, while it
measures the base on a checkout; once the push job stores this function in the
base snapshot, only the working tree is read.

Alternatives considered:

- **A gate with an exception list**, every port needing a suite. It fires on
  render-only ports and strategies, so the list is work in every PR that adds
  a port, the cost #2049 rejects.
- **Names** (`*Port`, `describe*Contract`). They miss `EditorHandle`,
  `DiffPaneHandle`, `HttpClient` and `RepositorySource`, and a helper renamed
  for readability would drop out.
- **The `port/` folders of every hexagonal workspace.** 18 more pairs at
  `cd48f2cd`, none of which a helper of the core's kit can cover, all set
  aside: 12 with one adapter each and 6 render-only.
- **Ports with one adapter listed with the others.** At `cd48f2cd` they add
  3 pairs whose adapter has no second class to disagree with, so the list
  would ask for suites that guard nothing until one appears.
- **A parameter typed as the port counts as a helper.** It would clear the two
  settings pairs above, and it would count any kit function that reads a port.
- **Syntax only, as `findImplementations`.** It resolves the file of an
  implemented interface, but not a helper's parameter type or a member's
  return type through generics, unions and promises, which the factory rule
  and the render-only derivation need.

### Architecture review

The [`architecture-review` skill](../../.agents/skills/architecture-review/SKILL.md)
(#2058) is the inferential sensor of
[architecture erosion](#architecture-erosion). It runs
`corepack yarn fitness --format json` on a branch, a PR (`--repo` on a
worktree of its head, `--base` its base), a commit on main (`--base` its
first parent) or a whole tree (`--base` the commit itself), and reads per
fitness function the findings with their status (new, existing, resolved),
the trend of the declared values and the limits a review needs (misses and
false reports) from the same output, so no second document drifts from the
code. It searches for copies of a rule with one `git grep` over the tracked
TypeScript, Kotlin, build scripts, CI workflows, docs and JSON, looks for an
existing home by concept, compares the other callers of each function the
change calls, and takes the `change-coupling` and `missed-partner` findings
of the touched files as the search for copies whose spelling is unknown. It
reviews what no fitness function sees: a rule in another spelling, copies
that already disagree, adapters of one port that disagree, two derivations of
one state, logic in the wrong layer, wiring per host, a workspace without its
siblings' guards, catch-all modules and silently ignored commands. On a whole
tree it names what it did not cover. It proposes measures from trends. Each
finding names `path:line`, its evidence and the fitness function or limit
that applies; a report row it drops goes under "Marked, no action". "Already
duplicated before this PR" is never a reason to keep a copy: the PR fixes it,
or an issue names `path:line` of each copy.

It is not a fitness function: a model's judgement is not deterministic, and
two runs on one tree differ. It comments and never blocks.

**Measurement (#2058).** Three cases, each scored against a reference list
compiled from its sources before the runs:

- #2040 at its squash commit `16225419` against its first parent: 4 items,
  the verify rule written in two spellings (#2051) and three defects that
  later issues documented and later PRs fixed.
- #2047 at its unsquashed head `3d1b19b3` against `452b6440`: the 15 items of
  sections 1 and 3 of
  [its review](https://github.com/Miragon/bpmn-modeler/pull/2047#pullrequestreview-5734313138),
  9 of them architectural.
- #1799's tree `4d58fabd` as a whole tree: 20 items, the issue's four
  structural causes (S1 to S4) and 16 defects from its lists that fit none of
  them (D1 to D16).

Each run was a separate agent session that followed the skill without the
reference, and one judge per run scored each reference item exact, partial or
missed and each further finding true, plausible or false. Round 1 ran the
skill as first written, three times per case. Round 2 ran it twice per case
after the 15 changes round 1 proposed (two of them in part), as this section
describes it.

| Case (items) | Round | Matched per run (exact) | Added: true / plausible / false | Mean run time |
| --- | --- | --- | --- | --- |
| #2040 (4) | 1 | 3 (1), 3 (3), 1 (1) | 3 / 10 / 2 | 401 s |
| #2040 (4) | 2 | 4 (4), 4 (4) | 2 / 8 / 0 | 624 s |
| #2047 (15) | 1 | 8 (3), 8 (0), 8 (1) | 8 / 10 / 0 | 705 s |
| #2047 (15) | 2 | 10 (2), 9 (2) | 5 / 7 / 0 | 796 s |
| #1799 (20) | 1 | 4 (0) in each run | 15 / 3 / 1 | 565 s |
| #1799 (20) | 2 | 4 (0) in each run | 12 / 3 / 0 | 674 s |

Two of #2047's round-2 plausible findings are trend notes, which one judge
counted and the other did not.

- **Stability.** Coverage is stable within a round: #2047 1.5 and 1.8 were
  half found in all five runs, #1799 matched S1 to S4 partly in all five.
  Depth and the added findings vary: #2047 1.2 and 1.6 and most added
  findings came and went between runs, and the exact/partial split moves by
  about one item per run between judges, who scored one observation as a
  match in one run and as an addition in the other.
- **What it finds**, in at least 4 of 5 runs: a rule written twice in
  different spellings near the diff (#2040's verify rule, #2047 1.1, the
  deployable-file rule as a glob and as an extension list), text built per
  host (#2047 3.4), the CI path filter that misses the Kotlin test inputs
  (5 of 5, not in the reference) and #1799's structural causes, partly. Its
  triage of report rows against `reportsWrongly` was right in every run.
  Round 2's checks matched exactly, in both runs, the home that moved code
  bypasses, the host that cuts a list before the core sorts it, the two
  derivations of one state and the two type declarations that disagree;
  round 1 matched each exactly in at most one of three runs.
- **What it misses:** a second copy it must discover rather than follow from
  the diff, with another name and other members (#2047 3.5 and #1799 D10 and
  D15 in 0 of 5 runs, the key lists of #2047 1.4 in 1); the guards a new
  workspace lacks (#2047 1.7, 0 of 5); wiring compared with the sibling
  feature's (the VS Code half of #2047 1.2, 0 of 5); the second halves of
  bundled items (#2047 1.5 and 1.8); and most of a whole tree: both round-2
  runs compared 4 or 5 of about 15 ports and listed the rest as not covered,
  and D1 to D16 were missed in all 80 run-items. Defects inside one copy
  (#2047 3.1, 3.3 and 3.6, most D items) belong to code review, not to this
  skill.
- **False findings:** 3 of 89 added findings (3.4 %), 0 of 37 in round 2,
  which still allows up to about 8 % at 95 % confidence. 41 of the 89 are
  only plausible, real but arguable or minor, and about five round-2 findings
  carry one wrong sub-claim, so about half the added findings are worth
  acting on.
- **Cost:** 9.8 to 14.5 min per round-2 run (mean 11.6 min, 25 % more than
  round 1's 9.3 min), plus 5 to 13 s for the report; tokens were not
  recorded. The PR's author then triages 9 to 15 numbered findings and 6 to
  16 marked rows.
- **What round 2 shows.** Most of its checks were written from round 1's
  misses on the same cases, so it shows that they fire, not that they
  generalize. Matched items per run rose (#2040 from 2.3 to 4.0, #2047 from
  8.0 to 9.5), all on items a change aimed at; the seven #2047 items no
  change aimed at went from 12 of 21 run-items to 7 of 14, and #1799's score
  did not move. Two runs per case cannot tell a one-item difference from
  judge noise. False findings fell from 3 to 0 once dropped report rows had
  their own section.
- **Contamination.** The tree states some answers: the `architecture` and
  `tdd` skills name `verifiesDeployments`, #2040's fix, and the limits of
  `change-coupling` and `repeated-value-sets` name a structural cause and a
  defect of #1799 and parts of #2047; round-2 runs quoted them. This section
  now names the answers of all three cases, so a further measurement needs
  held-out PRs.

**No CI job yet.** A job that runs the review on every PR is not worth it
now. The evidence is three calibration cases, the second round was tuned on
them, and the tree states their answers. Runs differ, so the comment would
change from push to push. At about 12 minutes per run, most PRs would get a
long review that mixes their own findings with older debt in the files they
touch. Stacked PRs (54 merge-tree conflicts in both round-2 runs on #2047)
and the blocks' shell assumptions (5 of 6 round-2 runs hit zsh hazards)
would break it in CI, and a job needs a workflow, an API secret and possibly
a dependency. The review runs by hand, on PRs that move rules between
layers, add a host feature or add a workspace: the shape of #2040 and #2047,
where it scored best.

_Proposed, not decided:_ make the blocks shell-safe, take a stacked PR's own
change from the last merge of its base, shard a whole tree by port family or
give it a port budget, and find second copies by their values; then measure
on 3 to 5 held-out merged PRs whose erosion a later issue documented, with
one judge per case and architecture items scored apart from correctness
bugs. If that run matches most architectural items at a false rate under
10 %, a non-blocking, path-triggered job that posts only the top findings a
PR introduced is worth a pilot. The 10 % bar is a judgement, not a
measurement.

Alternatives considered:

- **A search script**, grouped by area: it needs a spec and a `knip` entry
  for what one `git grep` does; it can follow if the command proves too
  coarse.
- **Review steps in the `architecture` and `tdd` skills**: a skill of its
  own loads only on a review and costs no context elsewhere.

### Private upstream APIs

Confine access to undocumented upstream members behind small typed adapters,
each in an `upstreamInternals/` folder of its library (the package's lint
adapter in `src/bpmnlint/upstreamInternals/`). Validate runtime shape and report a descriptive error naming the dependency and
pinned expectation. Callers use narrow public concepts rather than spreading
private member names through feature code.

| Adapter | Assumption and enforcement |
| --- | --- |
| Clipboard `directEditingInternals` | `_textbox.content`; installed upstream shape tested in Chromium |
| Diff `differResult` | Private differ category keys; real differ-result test |
| Append-menu `popupMenuInternals` | `_getContext`; installed upstream shape tested in Chromium |
| Properties-panel `engineGroupData` | Copied engine group/entry IDs; real providers in Chromium and template-prefix test in the library |

The [package architecture tests](../../packages/bpmn-modeler/src/architecture.spec.ts)
scan the package and inlined libraries to reject new private-member reaches
outside an `upstreamInternals/` folder, excluding the vendored panel fork. They
read the folder, not the adapters' file names, as do the package's rules on
`mode/` and `reporting/`. Installed-package
tests make a dependency bump fail where its shape changed:
[upstream shapes](../../packages/bpmn-modeler/src/upstreamShape.browser.spec.ts),
[engine groups](../../packages/bpmn-modeler/src/engineGroupData.upstream.browser.spec.ts),
[differ results](../../libs/bpmn-diff/src/upstreamInternals/differResult.spec.ts), and
[template prefixes](../../libs/properties-panel/src/modeFilter/engineGroupData.upstream.spec.ts).
The `bpmn-diff` and `properties-panel` targets list `yarn.lock` among their
trigger paths so a lockfile-only bump re-runs those pins.
Clipboard catches a shape failure, logs it and disables that clipboard path;
the CI test is the standing failure signal.

Type core DI lookups with the public core-service map and internal
`CoreServiceAccessor`; use minimal structural interfaces for non-core seams.
Global didi service-map augmentation would expose too much and still would not
type undocumented private members. An existing architecture scan avoids adding
a custom lint plugin or dependency-analysis tool for this rule.

`no-explicit-any` is an error on the cleaned package/library paths, configured
in [ESLint](../../eslint.config.cjs). The vendored panel outside its mode filter
and remaining core migration code retain warnings. There is no global warning
ratchet that makes unrelated warnings fatal. Preserve the distinction between
maintained adapter code and the upstream fork when updating dependencies.

### Dependency compatibility and security

All standalone Theia extensions must resolve the same core widget runtime;
duplicate core instances apply Inversify decorators to the shared Lumino Widget
twice and prevent frontend startup. The [runtime compatibility check](../../apps/standalone/scripts/theia-runtime.test.mjs)
uses Theia's extension discovery to verify installed module resolution in CI.
Use `@theia/scm` and the Timeline integration for Git history. The
[deprecated `@theia/scm-extra`](https://github.com/eclipse-theia/theia/blob/v1.75.0/packages/scm-extra/README.md)
stopped publishing in 1.75; keeping its last release introduces an older core.
Pin the standalone app's Electron runtime to an exact version in
`@theia/electron`'s peer major, at or above that peer, and do not override it
independently in electron-builder
([runtime compatibility check](../../apps/standalone/scripts/theia-runtime.test.mjs)).
Patch releases within a major keep the native-module ABI, so moving ahead of
Theia's exact peer is allowed when a security advisory needs a newer patch
before Theia ships one. Return to Theia's peer once it reaches the fixed
version. The app currently runs Electron 42.11.8 because Theia 1.76 still pins
42.8.1, which is affected by
[GHSA-gr2m-v5gq-v685](https://github.com/advisories/GHSA-gr2m-v5gq-v685),
[GHSA-j84w-jfhq-vhvj](https://github.com/advisories/GHSA-j84w-jfhq-vhvj),
[GHSA-9qh4-3jw8-366w](https://github.com/advisories/GHSA-9qh4-3jw8-366w) and
[GHSA-qmv3-fv6v-rmhq](https://github.com/advisories/GHSA-qmv3-fv6v-rmhq).

Keep the app in ASAR, but unpack only the generated `lib/backend/native/rg*`  
binary for file search. A native subprocess cannot execute from inside ASAR.  Since 1.76 Theia resolves the unpacked sidecar path. Limit the exception to that binary  
rather than unpacking all app code  
([packaged binary check](../../apps/standalone/scripts/packaged-runtime.test.mjs),
[Quick Open check](../../apps/standalone/scripts/packaged-search.test.mjs)).

Use TypeScript 7.0.2 for the `tsc` CLI through the exact alias
`@typescript/native: npm:typescript@7.0.2`. Keep the JavaScript compiler API
available through `typescript: npm:@typescript/typescript6@6.0.2` for ESLint,
`ts-loader`, declaration generation and package verification scripts. TypeScript
7 cannot replace that API yet; use Microsoft's
[side-by-side setup](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0)
instead of rewriting those tools. Declare both aliases in every workspace that
uses TypeScript so focused installations retain the CLI and API independently
of the root workspace. Keep the isolated packed-consumer check on TypeScript
6.0.3 to verify compatibility with existing consumers.
Point API Extractor at the compiler directory reported by
`ts.getDefaultLibFilePath`, since the compatibility wrapper does not contain the
standard-library declarations.

The root `lint` and `build` commands and the BPMN package's
[packed-consumer smoke check](../../packages/bpmn-modeler/scripts/smoke-packed-consumer.mjs)
exercise these compiler paths. Remove the compatibility alias only when all API
consumers support the native compiler.

The dependency changes address the
[shell-quote](https://github.com/advisories/GHSA-w7jw-789q-3m8p),
[tar](https://github.com/advisories/GHSA-23hp-3jrh-7fpw) and
[decompress](https://github.com/advisories/GHSA-mp2f-45pm-3cg9) advisories.
Root Yarn resolutions pin `shell-quote` 1.9.0 and `tar` 7.5.22. Replace the
unmaintained `decompress` dependency with `@xhmikosr/decompress` 11.1.4, using a
Yarn patch that exposes a CommonJS wrapper through conditional exports. The
wrapper dynamically imports the maintained implementation and preserves the
asynchronous call contract required by Theia's CommonJS callers.

This keeps Theia and node-gyp usable without maintaining a security-sensitive
archive extractor fork. The tar override crosses node-gyp's declared major
range, so test file/stream extraction options and electron-builder's extraction
path. The Node 22 build environment meets the replacement dependencies' runtime
requirements.

Run [standalone dependency security tests](../../apps/standalone/scripts/dependency-security.test.mjs)
in CI for shell-operator rejection, tar decompression limits, VSIX extraction,
extension identity and rejection of archive links outside the destination.
CI audits direct dependencies at high severity and transitive dependencies at
critical severity. These are checks of exercised interfaces and the resolved
dependency graph, not a proof of every host package or upstream's trustworthiness.

Review the overrides and compatibility patch when Theia or node-gyp changes;
remove them once callers declare compatible fixed dependencies. Updating Theia
alone does not necessarily remove the abandoned extractor. Suppressing the
advisory or maintaining extraction-security backports would leave the underlying
maintenance problem unresolved.

## Consequences

Coverage targets are floors that only rise when someone raises them.
A new workspace falls under the repo-level cycle and stability rules without
registration. The engine depends on the TypeScript 6 JS API, so moving to
TypeScript 7 alone needs another parser for it. Adding a
Vitest workspace means adding a registry entry; the guard makes forgetting it
a lint failure rather than a silently untested workspace.
Tests run in the environment capable of exposing the failure: browser layout in
Chromium, pure logic in unit tests, private shapes against installed dependencies,
archive compatibility through real extraction, and the packaged extension in a
real VS Code. This adds browser/runtime maintenance and explicit upstream pin
reviews, but catches failures that compile checks or import mocks would miss.
A red VS Code smoke run blocks no merge, so reviewers have to check it, and its
workbench selectors need updating when VS Code changes its DOM. Security
overrides add a new dependency tree and do not imply that all lower-severity findings have been remediated.
The compiler transition temporarily retains two TypeScript implementations and
requires checking both CLI compilation and API-based tooling when upgrading.
The mutation run is one more workflow to keep green, and its score says
little until rules move from services into `domain/`.
Reported fitness functions never block a merge, so reviewers and the review
agent read their new findings; the report is as complete as the functions
plugged into it. The review's findings vary between runs and about half its
additions are arguable, so the PR's author triages them, and it runs by hand
until a held-out measurement shows more. The data branch is one
more ref to keep: deleting it costs a backfill, and nothing but convention
keeps people from pushing to it.
Rules move into `domain/` before or together with the feature that needs
them, so services shrink to orchestration. No gate enforces test-first;
reviewers check the failing output in the PR description.
