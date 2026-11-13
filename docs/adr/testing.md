# Testing

- Status: accepted
- Last reviewed: 2026-11-13

## Context

The modeler combines browser layout, third-party DI modules, private upstream
details and host packaging. Type checks and mocked unit tests alone do not cover
real SVG behavior, the host/webview seam or upstream internal changes. Most
changes are written by coding agents, so the rules here have to be checkable or
loadable as a skill, not tribal.

## Contents

- [Test environments](#test-environments)
- [Test-first for rules](#test-first-for-rules)
- [Coverage gates](#coverage-gates)
- [Mutation testing](#mutation-testing)
- [CI test targets](#ci-test-targets)

## Decision

### Test environments

Tests run in the environment that can expose the failure: pure logic in unit
tests, browser layout in Chromium, private upstream shapes against installed
dependencies, and the packaged extension in a real VS Code.

**Vitest.** Unit projects cover pure logic and jsdom-compatible behavior. The BPMN
package adds a second project on the Playwright provider with headless Chromium
for `*.browser.spec.ts`, because SVG geometry, viewbox transforms and
ResizeObserver delivery need a real browser (mocks can test viewport-latch
decisions but not that a delayed initial fit leaves a restored view state
intact). The package's `test` runs both projects in one invocation so their V8
coverage merges; measured separately, code only the browser specs exercise
(modeler composition, engine stacks, linting) reads as uncovered. A separate
Playwright test runner would duplicate the Vite module graph, aliases and
conventions. The mode-session recreate transaction is still tested with jsdom
doubles, with real-viewer tests covering the post-import viewport behavior it
relies on.

- Every workspace config resolves `@miragon/*` through the aliases
  [`vitest.shared.ts`](../../vitest.shared.ts) generates from `tsconfig.base.json`
  paths, so test resolution cannot drift from the build's. They are anchored
  regexes (`@miragon/bpmn-modeler` must not capture its `/diff` subpath);
  `vite-tsconfig-paths` is not declared by the libs and would break focused
  installs.
- Test library behavior in the library that owns it; the package keeps only the
  Chromium round trips and installed-shape pins that need a real modeler.
- The vendored properties panel requires production Preact JSX transforms in both
  pipelines; recheck the unit and browser configs when upstream bundler behavior
  changes.

**Fakes, not mocks.** Specs reach the core's host ports through the in-memory
adapters in `@miragon/bpmn-modeler-core/testing` (`createTestHost`,
`FakeEditorHandle` and one fake per port), not hand-rolled partial mocks cast to
the port. The fakes keep state, so specs assert what the host shows or holds, not
which methods were called, and they follow each port's documented conventions, so
a port change breaks every spec that relies on it. The entry is test-only. A spec
spies on a fake only to inject a failure or hang, or when the call itself is the
behavior.

**Contract suites hold the fakes to the hosts.** A suite runs the same scenarios
against every adapter of one port, so a spec that passes on a fake cannot rely on
a rule a host breaks (the script-folder policy and file-list order once differed
between VS Code and the bridge). Where hosts differ VS Code is the reference. A VS
Code adapter runs over a fake of the `vscode` API that behaves as VS Code does,
and a bridge adapter that calls IntelliJ runs over an RPC loopback that answers as
the Kotlin side does. A run therefore pins each adapter's own mapping, not the
host: where a fake and its host part, the suite cannot tell. A rule of the Kotlin
side that a loopback answers by is therefore held to Kotlin by shared rows (#2223):
a file in `apps/modeler-bridge/src/__fixtures__/` that the bridge's spec runs against
the loopback and a Kotlin test against the router behind it. Where a hand-written
Kotlin test holds the rule instead, nothing fails when the loopback and that test
drift apart. No Kotlin test holds the clipboard loopback, a single-item pick, the
confirm dialog, the diff pane URIs or the path of a file on a network share. A port
whose methods return `void` but whose value the core reads back through another
port does not only render: it needs a suite whose fixture pairs it with that reader
(`describeLintingPreferenceContract`). The suites are the `describe*Contract` helpers in the core's `testing/`
folder; the `contract-suites` fitness function lists adapters whose specs run
none ([enforcement](architecture-enforcement.md#fitness-functions)).

**Real host layers.** Two layers run the VS Code extension in a real VS Code.

- The Extension-Host test (`test:e2e`, `@vscode/test-cli`) activates the built
  extension on the `engines.vscode` floor and the newest stable release and stays
  at the VS Code API boundary (commands, custom-editor resolution, diff routing).
  It cannot see inside a webview.
- The [VS Code smoke test](../../apps/vscode-plugin/test/smoke/vscode-smoke.test.ts)
  covers what neither it nor the browser tests reach: the packaged VSIX, webview
  bundles under the host's CSP, the host/webview protocol and the `TextDocument`
  behind the custom editor. It packs with `vsce`, unpacks outside the repository
  and drives desktop VS Code through `playwright-core`'s Electron driver (not
  possible before VS Code 1.78, so the floor stays with the Extension-Host test).
  It keeps Vitest as runner with its own config so `yarn test` and the coverage
  gates exclude it. The driver is ported, not imported from
  `@miragon/modeler-shell`, because that driver expects the shell's chrome and
  assumes npm. Locally it runs in a Linux container (a native macOS run steals
  focus). CI has a workflow of its own with path filters, a weekly run against the
  newest stable VS Code and a manual version input; it is **not** part of the
  required `ci` check because it needs a full install and drives workbench DOM
  VS Code does not keep stable. A red run blocks no merge, so reviewers must look.

The Orca plugin has the same two layers. Its
[e2e suite](../../apps/orca-plugin/test/e2e) (in the `ci` check) opens each editor
in Chromium under Orca's frame CSP with the Orca stub of `@miragon/modeler-shell`.
The [Orca smoke test](../../apps/orca-plugin/test/smoke/orcaSmoke.test.ts) runs the
shell's imported `runOrcaSmoke` in a real Orca (it drives Orca through its CLI by
click coordinates, never the shell's chrome) in a workflow of its own on the
newest Orca and the `engines.orca` floor, retrying each document up to twice
because Orca's click lands before the BPMN modeler has rendered. Orca's
`plugin check` warns on any `eval`/`Function(` call, which the smoke test treats
as a failure; the build patches the known calls out of upstream modules and its
assemble step fails on a new one or on a plugin over Orca's size limits.

### Test-first for rules

A new or changed decision (business rule, state transition, validation or
classification) starts as a failing pure spec in the owning feature's `domain/`
folder of `libs/modeler-core`, or in `libs/modeler-types` when browser code applies
the same rule. Every bug fix starts with a spec that reproduces it. Services keep
one orchestration spec per use case through `createTestHost`. bpmn-js wiring, DOM
chrome and host-API glue are exempt: writing those first against real SVG and
host APIs costs much and gains little, and the browser, bridge and smoke specs
cover them afterwards.

The target is the main source of defects here: a rule written in more than one
place (two services, VS Code and the bridge, TypeScript and Kotlin, core and
webview) drifts, and the drift becomes a bug. Writing the spec first gives the rule
one home before code depends on it. The workflow ships as the
[`tdd` skill](../../.agents/skills/tdd/SKILL.md). CI cannot prove a spec came
first; the [mutation score](#mutation-testing) of `domain/` is the measurable
proxy and the PR description carries the failing output. No gate enforces
test-first.

**A rule the Kotlin host must apply keeps its rows in a JSON file** beside its
TypeScript home, and the TypeScript specs and the Kotlin test run the same file.
Gradle hands the Kotlin test the path as a system property and declares it a test
input, so a changed row reruns the test; the `intellij-plugin` CI filter lists the
file (`tools/repo-checks/src/kotlinTestInputs.spec.ts` fails when the filter
misses one). A mirrored Kotlin table would drift like the rule it copies. Rows the
typed Kotlin side cannot hold (a wrong-typed value) live in the core's testing kit
and run against every TypeScript adapter. Existing files: settings normalization,
code approval changes, template preference changes, element-template file cases,
template preview messages, plugin asset URLs, the add-ons brand mode, flush replies.

A value set or text the Kotlin host copies is pinned the same way, to the
TypeScript source file itself (`StatusSlotPlacementTest` reads `statusView.ts`,
`ModelerSettingsStoreTest` the mode and theme arrays, `EmptyDmnDiagramTest` the DMN
scaffold byte for byte, `NewModelFileDialogTest` the new-file dialog texts), so no
generated file sits in between that could go stale.
One Kotlin copy does not follow this: the languages list is pinned to the VS Code
manifest (`ModelerLocalesTest`), which `manifest.contract.spec.ts` pins to the
shipped catalogue, so it holds only through that chain.

**Two state machines for one protocol get one agreement spec.** When the core and
the webview each keep a state machine for one protocol on purpose, because each side
holds state the other does not need, one spec in the core drives both through the
wire. The BPMN lint tier is the case
([`lintTierAgreement.spec.ts`](../../libs/modeler-core/src/modeler/bpmn/domain/lintTierAgreement.spec.ts)):
it feeds both reducers the same sequences and fails when the two sides, with no
message in flight, disagree. Case rows each side runs alone would have to restate the
other side's answers, so they could not catch the two drifting apart. It imports the
package reducer by relative path, and the core's CI target lists that folder; a
test-only workspace would need its own manifest, CI target and install for one spec.
While a request is in flight the sides may differ by design, and the spec does not
check those windows.

### Coverage gates

Each Vitest workspace owns its coverage target as literal `coverage.thresholds` in
its `vitest.config.ts`, about three points below the measured baseline. Its `test`
script runs `vitest run --coverage`, so its CI leg fails below target and the
required `ci` check needs no separate coverage job. The job summary parses the
thresholds from the config text, which is why they are not computed in the shared
preset; no PR comment, because one comment per leg buried the conversation and
never gated anything. `coveragePreset` measures all `src/**/*.{ts,tsx}` rather
than only imported files, otherwise an untested new module does not lower the
percentage. Workspaces exclude only code with no testable logic and name the
reason (wiring covered by the smoke test, re-export barrels, stdio entries,
generated icons). Targets are floors that only rise when someone raises them.

`@miragon/bpmn-modeler` counts its own `src` only, not the libraries it inlines;
crediting their code to the package would let its threshold mask a library
regression. The IntelliJ plugin follows the same rule with JaCoCo (literal `LINE`
and `BRANCH` minimums, every Kotlin source counted, `includeNoLocationClasses`
because the platform's test class loader defines plugin classes without a code
source). Coverage options are root-only in a Vitest multi-project run, so root
`yarn test` skips coverage and `yarn test:coverage` runs each workspace's `test`
as CI does.

### Mutation testing

Coverage shows which lines a spec executed, not whether it would notice them
change. [Stryker](https://stryker-mutator.io/) mutates the pure domain rules of
`libs/modeler-core` (`src/**/domain/**`). Services are left out on purpose: they
orchestrate ports over fakes, mutate slowly and mostly yield equivalent mutants.
Rules browser code shares live in `modeler-types`, which Stryker does not mutate;
break those by hand.

- It runs the workspace's own Vitest config (the root one has a browser project
  the runner does not support) and mutates in place, because a sandbox copy cannot
  reach `../../vitest.shared`; a local run rewrites `src/` until it finishes and
  restores it from `.stryker-tmp/` if interrupted. Static mutants are ignored; the
  TypeScript checker stays off (TypeScript 6 compatibility with the workspace
  tsconfig is unproven). `corepack yarn test:mutation [--mutate <file>]`.
- The [workflow](../../.github/workflows/mutation.yml) is report-only, not part of
  `ci`: a full run weekly and on demand on `main`, incremental runs on PRs and
  merges that touch a `domain/` folder. Each `main` run uploads Stryker's incremental
  file as an artifact and the next run restores the newest one, so a pull request is
  compared against the `main` it branched from. A cache entry held the baseline first;
  the repository's caches exceed the 10 GB limit, eviction removed it within hours,
  and every run fell back to all mutants and hit the timeout. Runs on `main` are not
  cancelled by the next merge, which would lose the baseline again.
- There are no floors (a number picked from a few runs, and Stryker has one global
  break threshold). The score per domain folder is a trend reported by the
  `mutation-score` fitness function: detected (Killed, Timeout) over detected plus
  undetected (Survived, NoCoverage). Only full runs on `main` are stored (the
  `store-score` job writes `mutation/<run id>.json` to the `fitness-history`
  branch), keyed by run id so two runs on one commit both count; incremental runs
  re-test a subset and are not stored.

### CI test targets

[`.github/vitest-targets.json`](../../.github/vitest-targets.json) lists every
Vitest workspace with its focused install and the paths that should re-run it: its
own directory, every workspace its code imports, and files its specs import by
relative path or read. The
[build workflow](../../.github/workflows/build.yml) turns each entry into path
filters and one `test` matrix job per affected target: tests with coverage, the
typecheck script and the coverage summary. Vitest strips types without checking
them, so the typecheck is the only gate on spec types; configs that reach another
workspace's sources through a path alias include its ambient `.d.ts` files.

[`check-vitest-targets.mjs`](../../.github/scripts/check-vitest-targets.mjs) runs
in the lint job and pre-push and fails when a workspace with a Vitest config is not
a target, when a target does not declare the Vitest packages its focused install
needs (including Vitest's `vite` peer), when its trigger paths miss a workspace or
file its tests import or read, or when its specs escape the typecheck. Before the registry
each workspace needed a hand-written job, filter and `ci.needs` entry, and twelve
workspaces' specs never ran in CI. A manual `workflow_dispatch` runs all targets.

The read pass ([`vitest-target-reads.mjs`](../../.github/scripts/vitest-target-reads.mjs))
resolves the repository paths a spec or the code it imports reads from disk, so a spec
that reads a file reruns when that file changes. It is a gate, not a fitness row,
because coverage is a yes/no property; runtime tracing of `node:fs` would see more but
needs a full test run and misses browser specs that read through Vite. It cannot see a
path computed from a parameter or from data, `git ls-files` sweeps, config files a tool
loads on its own, or a read helper imported from another module. Some of those are
listed by hand; the sweeps in `guardedValueComparison.spec.ts` and
`hostTextNames.spec.ts` stay uncovered, so a change to a file only they read does not
run them.

## Consequences

Tests in the environment that exposes the failure add browser/runtime
maintenance and explicit upstream pin reviews, but catch what compile checks and
import mocks miss. A new Vitest workspace needs a registry entry; forgetting it
is a lint failure, not a silently untested workspace. The mutation run is one more
workflow to keep green and its score says little until rules move from services
into `domain/`.
