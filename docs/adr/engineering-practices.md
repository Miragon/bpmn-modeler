# Engineering practices

- Status: accepted
- Last reviewed: 2026-10-31

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
- [Architecture tests](#architecture-tests)
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
CI filter lists the file. A mirrored Kotlin table would drift like the rule it
copies. The settings rows in `settingsNormalization.cases.json` are the first
such file (see [host-replicated state](architecture-and-hosts.md#host-replicated-state)).
Rows whose shapes the typed Kotlin side cannot hold, such as a value of the
wrong type, live in the core's testing kit (`TYPESCRIPT_ONLY_SETTINGS_CASES`),
and every TypeScript host runs them beside the JSON rows.

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
lists the score per context. Per-context floors follow once two or three
weekly runs agree, enforced by the summary script because Stryker has only
one global break threshold. The first baseline (2026-10-26) was 84.5 % over
2,750 mutants in 46 files.

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

### Architecture tests

Every `architecture.spec.ts` reads its sources through one engine,
[`tools/architecture-testing`](../../tools/architecture-testing/src/index.ts)
(`@miragon/architecture-testing`). It reads imports from the TypeScript syntax
tree, so comments, JSDoc `import()` and strings never count, and marks an
import type-only where TypeScript would elide it. It resolves a relative import
through a fixed suffix list (`.ts`, `.tsx`, `/index.ts`, `/index.tsx`, then the
exact path) and maps a package import to a workspace by its package name. It
also finds import cycles, host reach, implemented interfaces, port adapters
outside their homes or imported from outside them, and comments. Only
`sourceTree.ts` touches the file system; the rest are pure functions over
source text. Each spec keeps its own classifier, since feature and layer layout
differ per workspace.

[`tools/repo-checks`](../../tools/repo-checks/src/architecture.spec.ts) holds
the rules over every root workspace with a `src/`: no import cycle inside a
workspace (type-only imports count), every relative import resolves (assets
aside, so no edge drops silently out of the cycle rule), no cycle between
workspaces, and no workspace depends on a less stable one. Instability is
I = Ce / (Ca + Ce) over workspace dependencies, compared on integers.

Two exception regimes apply. Cycles take no exceptions; a cycle is fixed. Layer
and stability rules take `KnownException` entries that name the issue removing
them, and a stale or unnamed entry fails the gate, so the lists only shrink. A
rule scoped to a folder or file set fails when the scope matches nothing
(`requireMatches`), so a renamed folder cannot make it pass vacuously; the VS
Code host-isolation rule is exempt because its empty scope is the goal.

The engine lives under `tools/`, not `libs/`: it is dev-only tooling that no
host or webview ships.

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

### Private upstream APIs

Confine access to undocumented upstream members behind small typed adapters.
Validate runtime shape and report a descriptive error naming the dependency and
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
outside approved adapters, excluding the vendored panel fork. Installed-package
tests make a dependency bump fail where its shape changed:
[upstream shapes](../../packages/bpmn-modeler/src/upstreamShape.browser.spec.ts),
[engine groups](../../packages/bpmn-modeler/src/engineGroupData.upstream.browser.spec.ts),
[differ results](../../libs/bpmn-diff/src/differResult.spec.ts), and
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
Rules move into `domain/` before or together with the feature that needs
them, so services shrink to orchestration. No gate enforces test-first;
reviewers check the failing output in the PR description.
