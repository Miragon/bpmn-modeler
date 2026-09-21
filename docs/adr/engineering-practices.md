# Engineering practices

- Status: accepted
- Last reviewed: 2026-09-21

## Context

The modeler combines browser layout, third-party DI modules, private upstream
details and host packaging tools. Type checks and mocked unit tests alone do not
cover real SVG behavior or upstream internal changes. Dependency fixes also
need compatibility proof for the paths the build and plugin installer exercise.

## Contents

- [Test environments](#test-environments)
- [Private upstream APIs](#private-upstream-apis)
- [Dependency compatibility and security](#dependency-compatibility-and-security)
- [Consequences](#consequences)

## Decision

### Test environments

Use Vitest's existing unit projects for pure logic and jsdom-compatible behavior,
plus a second BPMN package project with the Playwright provider and headless
Chromium for `*.browser.spec.ts`. Share workspace aliases between projects and
exclude browser files from jsdom. Package `test` runs both; the root test
configuration includes the browser project, and CI installs Chromium.

Real browser tests are necessary for SVG geometry, viewbox transforms and
ResizeObserver delivery. Mocks can test viewport-latch decisions but cannot
prove that a delayed initial fit leaves a restored view state intact.
Browser tests now cover modeler, designer, viewer and diff-viewer lifecycle,
new-diagram round trips, readonly/designer contracts and bridged clipboard.
The mode-session recreate transaction itself remains tested with jsdom doubles;
real-viewer restore tests cover the post-import viewport behavior it relies on.

Browser coverage collection is off to avoid combining a separate browser V8
coverage stream. Unit coverage remains enabled. The browser project incurs a
Chromium installation and startup cost; a separate Playwright test runner would
duplicate the Vite module graph, aliases and test conventions. Manual demo
testing remains useful but does not replace automated timing-sensitive cases.

The vendored properties panel requires production Preact JSX transforms in both
test pipelines. Check [browser configuration](../../packages/bpmn-modeler/vitest.browser.config.ts),
[unit configuration](../../packages/bpmn-modeler/vitest.config.ts),
[shared aliases](../../packages/bpmn-modeler/vitest.aliases.ts) and
[lifecycle contracts](../../packages/bpmn-modeler/src/lifecycleContract.browser.spec.ts)
when upstream bundler/runtime behavior changes.

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
The standalone uses Theia's generated esbuild configuration, with no custom
Webpack configuration.

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
consumers support the native compiler. Keep Electron aligned with Theia's pinned
42.3.0 runtime; a major Electron upgrade requires separate host validation.

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

Tests run in the environment capable of exposing the failure: browser layout in
Chromium, pure logic in unit tests, private shapes against installed dependencies,
and archive compatibility through real extraction. This adds browser/runtime
maintenance and explicit upstream pin reviews, but catches failures that compile
checks or import mocks would miss. Security overrides add a new dependency tree
and do not imply that all lower-severity findings have been remediated.
The compiler transition temporarily retains two TypeScript implementations and
requires checking both CLI compilation and API-based tooling when upgrading.
