# Engineering practices

- Status: accepted
- Last reviewed: 2026-10-24

## Context

The modeler combines browser layout, third-party DI modules, private upstream
details and host packaging tools. Type checks and mocked unit tests alone do not
cover real SVG behavior or upstream internal changes. Dependency fixes also
need compatibility proof for the paths the build and plugin installer exercise.

## Contents

- [Test environments](#test-environments)
- [Coverage gates](#coverage-gates)
- [CI test targets](#ci-test-targets)
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
beside VS Code and the bridge. The entry is test-only: production code
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

### Coverage gates

Each Vitest workspace owns its coverage target as literal `coverage.thresholds`
in its `vitest.config.ts`, set about three points below the measured baseline.
Its `test` script runs `vitest run --coverage`, so its CI leg fails below the
target and the required `ci` check enforces it without a separate coverage job.
The PR coverage comment reads the same numbers; it parses the thresholds from
the config text, which is why they are not computed in the shared preset.
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

Coverage options are root-only in a Vitest multi-project run, so the root
`yarn test` skips coverage; `yarn test:coverage` runs each workspace's `test`
as CI does.

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
coverage, an optional typecheck script, the PR comment and the Codecov upload.
The app and package build jobs and the Extension-Host smoke test are gated on
the same target ids.

[`check-vitest-targets.mjs`](../../.github/scripts/check-vitest-targets.mjs)
runs in the lint job and pre-push. It fails when a workspace with a Vitest
config is not a target, when a target does not declare the Vitest packages its
focused install needs (including Vitest's `vite` peer), when its trigger
paths miss a workspace or file its tests import, or when its `build` script
only runs `tsc --noEmit` but the target names no `typecheck` (most such builds
run in no other CI job). Before the registry, each workspace needed a hand-written job,
filter and `ci.needs` entry, and twelve workspaces' specs never ran in CI.

Only `<id>-src` matches upload coverage, so the release-please PR (changelogs,
manifests) gets none. Codecov statuses stay advisory, and
[`codecov.yml`](../../.github/codecov.yml) carries every flag forward because
path-filtered legs upload only what a commit touched. A manual
`workflow_dispatch` run executes all targets to refresh those flags.

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

Coverage targets are floors that only rise when someone raises them. Adding a
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
