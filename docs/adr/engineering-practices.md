# Engineering practices

- Status: accepted
- Last reviewed: 2026-11-13

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
beside VS Code and the bridge. The entry is test-only: production code does not
import it, and specs that test a host adapter itself keep mocking the host API
underneath. A spec spies on a fake only to inject a failure or hang, or when
the call itself is the behaviour under test.

Contract suites hold the fakes to the hosts (#2054). A suite runs the same
scenarios against every adapter of one port, so within those scenarios a spec
that passes on a fake cannot rely on a rule a host breaks. Where the hosts
differ, VS Code is the reference. A VS Code adapter runs over a fake of the
`vscode` API that behaves as VS Code does, and a bridge adapter that calls
IntelliJ runs over an RPC loopback that answers as the Kotlin side does. So a
run pins each adapter's own mapping, not the host itself: where a fake and its
host part, the suite cannot tell. The lists after the suites name what holds
each loopback to the Kotlin side.

- `describeAddOnViewRevealContract`: `RecordingAddOnViewReveal` and
  `VsCodeAddOnsViewReveal` over a view focus that rejects where the host
  cannot show its view, as the provider's does when the focus command fails.
- `describeApprovalReviewContract`: `ListReview` over `ScriptedPicker`,
  `ScriptedReview`, and `ViewReview` when the view cannot open
  (`RecordingAddOnViewReveal({ shows: false })` over a `ListReview`).
- `describeClipboardContract`: `InMemoryClipboard`, `VsCodeClipboard` over a
  fake `env.clipboard` and the bridge's `RpcClipboard` over a loopback that
  answers as `HostUiRouter` does.
- `describeDeploymentStateContract`: `InMemoryDeploymentState`,
  `VsCodeDeploymentState` over a fake `Memento` that keeps a rejected value in
  memory, as VS Code's does, and the bridge's `RpcDeploymentState` over a
  loopback that answers as `DeploymentRouter` and `IntellijDeploymentState` do.
- `describeDiffPaneContract`: `FakeDiffPaneHandle`, VS Code's
  `WebviewPaneHandle` over a fake panel and document, and the bridge's
  `RpcDiffPaneHandle` over a loopback that routes posts as `DiffRouter.kt`
  does.
- `describeDocumentContract`: `EditorSessionDocuments` twice, over the kit's
  `FakeEditorHandle` as `createTestHost` composes it and over
  `VsCodeEditorHandle` on a fake `vscode` text document, and the bridge's
  `RpcDocumentPort` over a loopback that answers as `EditorSessionRouter.kt`
  does. The kit has no `DocumentPort` fake of its own.
- `describeEditorHandleContract`: `FakeEditorHandle`, `VsCodeEditorHandle`
  over a fake panel, text document and `workspace` events, and the bridge's
  `RpcEditorHandle` over a loopback that answers as `EditorSessionRouter.kt`
  does.
- `describeLintingPreferenceContract`: `InMemoryLintingPreference`,
  `VsCodeLintingPreference` and the bridge's `RpcLintingPreference`. The setter
  returns nothing, so each reads the choice back through its host's settings
  adapter (`InMemorySettings`, `VsCodeSettings`, `BridgeSettings`). VS Code's
  pair runs over a configuration fake with a user and a workspace scope, the
  bridge's over a loopback that answers as `SettingsRouter` does.
- `describeMarketplacePromptContract`: `ScriptedMarketplacePrompt`,
  `VsCodeMarketplacePrompt` over `vscodeWindowFake.ts` and the bridge's
  `RpcMarketplacePrompt` over a loopback that answers as `MarketplaceRouter`
  and `AddMarketplaceDialog` do.
- `describeMarketplaceRegistrationsContract`:
  `InMemoryMarketplaceRegistrations`, `VsCodeMarketplaceRegistrations` over the
  real `VsCodeSettings` and a stateful `vscode` configuration fake, and the
  bridge's `RpcMarketplaceRegistrations` over a loopback that answers as
  `MarketplaceRouter`, `ProjectMarketplacesStore` and `ModelerSettingsStore` do.
- `describeNotifierContract`, which covers `withProgress`:
  `RecordingNotifier`, `VsCodeNotifier` over `vscodeWindowFake.ts` and the
  bridge's `RpcNotifier` over a loopback that answers as `HostUiRouter.kt`
  does.
- `describePluginApprovalStoreContract`: `InMemoryPluginApprovals`,
  `VsCodePluginApprovalStore` over an in-memory `Memento` and over one that
  sets its value only after `update` yields (so two changes started together
  need the store's own ordering), and the bridge's
  `RpcPluginApprovalStore` over a loopback that merges each change with
  `approvalsAfter` and stamps revisions as `PluginApprovalRouter` and
  `PluginApprovalStore` do. Its fixture can store a list as another writer
  (another IDE project or VS Code window), so the suite holds that a change
  keeps a row the store never read.
- `describePickerContract`: `ScriptedPicker`, `VsCodePicker` over mocks of
  the `vscode` window and the bridge's `RpcPicker` over the
  `intellijPromptHost.ts` loopback, which answers as `HostUiRouter` does.
- `describePropertiesPanelStateContract`: `InMemoryPropertiesPanelState` and
  VS Code's `PropertiesPanelStateRepository` over an in-memory `Memento`. The
  bridge has no adapter of this port.
- `describeScriptEditorContract`: `RecordingScriptEditor`, VS Code's
  `ScriptTaskService` over a fake of the editor tabs
  (`vscodeEditorTabsFake.ts`) and the bridge's `BridgeScriptEditor` over a
  loopback that answers as `ScriptRouter` and `ScriptEditorManager` do.
- `describeSecretStoreContract`: `InMemorySecretStore`, `VsCodeSecretStore`
  over the `InMemorySecretStorage` fake and the bridge's `RpcSecretStore` over
  the `intellijCredentialHost.ts` loopback, which answers as
  `SecretStoreRouter` does.
- `describeSettingsContract`: `InMemorySettings`, `VsCodeSettings` over a
  `vscode` configuration mock and the bridge's `BridgeSettings`, which a
  loopback feeds `settings/didChange` as `EditorSessionRouter.pushSettings`
  does. Each also runs the shared normalization rows
  ([test-first for rules](#test-first-for-rules)).
- `describeTokenPromptContract`: `ScriptedTokenPrompt`, `VsCodeTokenPrompt`
  over a mocked `showInputBox` and the bridge's `RpcTokenPrompt` over the
  `intellijPromptHost.ts` loopback as well, which answers as
  `MarketplaceRouter` does.
- `describeTokenStoreContract`: `InMemoryTokenStore`, `VsCodeTokenStore` over
  the `InMemorySecretStorage` fake as well and the bridge's `RpcTokenStore`
  over the `intellijCredentialHost.ts` loopback as well, which answers
  `tokenStore/*` as `MarketplaceRouter` does.
- `describeWorkspaceContract`: `InMemoryWorkspace`, the bridge's
  `NodeWorkspace` and `VsCodeWorkspace`, both hosts on a temporary directory.
  `VsCodeWorkspace` runs over `vscodeWorkspaceFake.ts`, which serves
  `workspace.fs` and `findFiles` from the disk and delivers watcher events in
  coalesced batches, as VS Code does.

A rule of the Kotlin side that a loopback answers by is held to Kotlin by
shared rows (#2223), as `settingsNormalization.cases.json` holds a core rule:
a file in `apps/modeler-bridge/src/__fixtures__/` that the bridge's spec runs
against the loopback and a Kotlin test against the router behind it, read
through a `miragon.*` test input in `build.gradle.kts`.

- `intellijPasswordSafe.cases.json`: a pair saved with an empty name reads
  back as absent, one with an empty secret as saved. `SecretStoreRouterTest`
  runs it on the platform's unit-test PasswordSafe.
- `intellijDocumentWrite.cases.json`: a write stores LF line endings and
  replies with the stored text when it differs from the written one, reports a
  change only when the text differs, and is refused (`accepted: false`) for
  another session or at another revision. `EditorSessionRouterTest` runs it on
  a real Document; both document loopbacks answer with `intellijDocumentWrite`.
- `intellijScriptTabs.cases.json`: `script/close` closes the tab and acks with
  `script/didClose`, also for a tab it never opened, and a tab the user closes
  reports `script/didClose`. `ScriptRouterTest` runs it over the platform's
  editor manager.
- `intellijProgress.cases.json`: one spinner per progress title, which a
  second start replaces. `HostUiRouterTest` runs it; the spinner itself is a
  seam of the router.
- `intellijWritableScopes.json`: where IntelliJ saves each marketplace scope,
  which `MarketplaceRouterTest` compares with the `marketplaceState/read`
  reply.

Hand-written Kotlin tests, not shared rows, hold these rules a loopback
answers by, so nothing fails when a loopback and its Kotlin test drift apart:

- `DiffRouter.kt`'s routing: a core post reaches only the browser of its
  `paneUri`, serialized by Gson, and a pane's message goes to the core under
  its URI (`DiffRouterTest`).
- What `DeploymentRouter` and `IntellijDeploymentState` store: the seed holds
  only what the project stores, a save keeps every patched field, and ledger
  rows are removed before they are put (`DeploymentRouterTest`). That a write
  which throws answers with its message is the channel's rule for every
  handler (`RpcChannelTest`).
- `SettingsRouter`'s lint choice: stored, pushed to every bridge, then acked
  (`SettingsRouterTest`, `SettingsBroadcastTest`).
- The marketplace add form: `MarketplaceRouter` reads the question from the
  params and answers the form as entered, or `null` on cancel
  (`MarketplaceRouterTest`); `AddMarketplaceDialog` offers a radio button per
  scope and starts from the core's scope (`MarketplaceAddFormTest`).
- The marketplace lists: the merge the settings loopback applies
  (`ProjectMarketplacesStore.merged()`, `ModelerSettingsStoreTest`) and the
  push of a saved or reduced list before the ack (`MarketplaceRouterTest`).
- `PluginApprovalRouter`: a change pushed to the bridges before it answers,
  both at its revision, no revision for a change that keeps every row, and a
  row another writer stored kept (`PluginApprovalRouterTest`). The merge
  itself runs the core's `codeApprovalChange.cases.json` rows
  (`PluginApprovalStoreTest`).
- `TemplatePreferenceRouter`: a project change pushed to this bridge and an
  all-projects change to every bridge before the answer, no revision for a
  change that keeps every switch, and an error for a switch named twice
  (`TemplatePreferenceRouterTest`). The merge runs the core's
  `templatePreferenceChange.cases.json` rows (`TemplatePreferenceStoreTest`).
- `AddOnsRouter`: `addOns/reveal` answers whether the Add-ons tab is shown, or
  an error when the tool window throws (`AddOnsRouterTest`).
- The prompts `intellijPromptHost.ts` answers: a `PickManyDialog` reports its
  checked rows in list order (`PickManyDialogTest`); an action notice answers
  the chosen index, or `{}` when dismissed (`HostUiRouterTest`); the token
  prompt answers the text as typed, or `null` on cancel
  (`MarketplaceRouterTest`).
- `tokenStore/*`: a token round-trips, an unknown host reads `null`, and a
  read that blocks does not hold up the next frame (`MarketplaceRouterTest`).
  Replies keep request order because both routers answer on one credential
  thread, which `SecretStoreRouterTest` checks for `secretStore/*`.
- The refusal of a write without a revision while a host change has not
  reached the webview, which the document loopbacks leave out because they
  have no webview (`EditorSessionRouterTest`).

No Kotlin test holds these, with the reason:

- What an OS keychain does with an empty secret. In unit-test mode
  PasswordSafe is an in-memory store, so no test reaches a keychain, and the
  suite accepts both answers. An empty name reads back as absent on every
  backend: `Credentials` drops it before any store sees it.
- The pane URIs `BpmnDiffViewer.uriFor` builds. It is a member of a diff
  viewer showing JCEF browsers, which the headless tests do not create.
- The clipboard loopback's order of reads and writes and its empty text for a
  clipboard without text. No Kotlin test drives `clipboard/read` or
  `clipboard/write`, and whether the headless test application's
  `CopyPasteManager` keeps text as the system clipboard does is not checked.
- A `picker/show` that picks one item, and `confirm/show`: `HostPicker` opens a
  `JBPopup` and `handleConfirm` a modal `Messages` dialog, and `HostUiRouter`
  has no seam for either. A dismissed pick goes out as `{}` by the same Gson
  rule the action notice test checks.
- The `fsPath` IntelliJ sends for a file on a network share (#2186). The
  document loopbacks pass their path through, so the suites pin only that
  the bridge keeps the host's `fsPath`. That IntelliJ sends `VirtualFile.path`
  as `//server/share/…` is what the bridge's specs assume; no Kotlin test opens
  a file on a share, and it was not checked in IntelliJ.
- The error text a loopback answers for a missing or mistyped param (`Param
  '…' is missing or not of the expected type`). `RpcChannelTest` holds that a
  handler which throws answers with its message, but no Kotlin test checks
  `RpcParams`' text.

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

The Orca plugin has the same two layers. Its
[e2e suite](../../apps/orca-plugin/test/e2e) (`test:e2e`) builds the plugin
and opens each editor in Chromium under Orca's frame CSP with the Orca stub of
`@miragon/modeler-shell`, a test-only dependency (MIT) published by the
modeler suite; the stub has no `editor.flush`, so the suite adds it. The
[Orca smoke test](../../apps/orca-plugin/test/smoke/orcaSmoke.test.ts)
(`test:orca`) runs the shell's `runOrcaSmoke` in a real Orca for a `.bpmn` and
a `.dmn` file. Unlike the VS Code driver, this one is imported: it drives Orca
through its CLI by click coordinates and file contents, never the shell's
chrome. The click points are measured in the e2e suite and shared with the
smoke test. Its container runner is still our own, as the shell's assumes npm. The smoke retries each
document up to twice: `orca plugin shot --act` clicks two animation frames
after the editor asks for its document, which is often before the BPMN modeler
has rendered, and its capture now and then loses the BPMN frame ("Object has
been destroyed"). Both were measured in repeated runs against a real Orca; in
every failed round inspected, the click had selected nothing, and no edit was
lost on its way to the file.
CI runs the e2e suite in the `ci` check and the smoke test in a
[workflow of its own](../../.github/workflows/orca-smoke.yml) on the newest
Orca and the `engines.orca` floor. Orca's `plugin check` warns on any
`eval`/`Function(` call, which the smoke test treats as a failure; the build
patches the three known calls out of upstream modules and its assemble step
fails on a new one, and on a plugin over Orca's size limits.

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
`codeApprovalChange.cases.json` holds how a code approval change merges into
the stored list and which changes are refused; `PluginApprovalStoreTest` runs
it against the Kotlin merge. `brandMode.cases.json` in `libs/shared` holds
the add-ons view's brand mode for each IDE theme and `colorTheme` setting, with
the `<html>` attributes it writes; `BrandModeTest` runs it against `BrandMode.kt`.
Rows whose shapes the typed Kotlin side cannot hold, such as a value of the
wrong type, live in the core's testing kit (`TYPESCRIPT_ONLY_SETTINGS_CASES`),
and `describeSettingsContract` runs them beside the JSON rows against every
TypeScript adapter of `SettingsPort`, the in-memory fake included. A value set the
Kotlin host copies is pinned the same way, to the TypeScript source file itself:
`StatusSlotPlacementTest` reads the unions in `statusView.ts`,
`ModelerSettingsStoreTest` the `SURFACE_MODES` array in `surfaceMode.ts` and
the `COLOR_THEMES` array in `settings.ts` of `libs/modeler-types`,
`ModelerSettingsConfigurableTest` the `MODE_LABEL` table in the modeler's
`modeStrip.ts`; each fails when the Kotlin copy differs. A text the Kotlin
host copies is pinned the same way: `EmptyDmnDiagramTest` compares the scaffold
IntelliJ's New DMN Model writes with `EMPTY_DMN_DIAGRAM` in `emptyDmn.ts` byte
for byte. No generated file sits in between that could go stale. One Kotlin
copy does not follow this yet:
`ModelerLocalesTest` pins the languages to the VS Code manifest, which
`manifest.contract.spec.ts` pins to the shipped catalogue, so the Kotlin list
holds only through that chain.

When the core and the webview each keep a state machine for one protocol on
purpose, because each side holds state the other does not need, one spec in
the core drives both through the wire. The BPMN lint tier is the case:
`LintSession` tracks negotiation and escalation, the package's
`lintTierMachine` a user's switch-off.
[`lintTierAgreement.spec.ts`](../../libs/modeler-core/src/modeler/bpmn/domain/lintTierAgreement.spec.ts)
feeds both reducers the same sequences, posts each core action the way
`BpmnLintConfigService` and the webview's lint bridge do, and fails when the
two sides, with no message in flight, disagree on whether the page lints, when
the token and config the page lints with differ from the core's negotiation,
when the core drops the page's next run, or when it applies a run under any
other token. It imports the package reducer by relative
path, as `lintParity.spec.ts` imports the browser linter; the core's CI target
lists `packages/bpmn-modeler/src/bpmnlint/**`, so a change on either side runs
it. A test-only workspace would need its own manifest, CI target and install
for one spec. `tools/repo-checks` holds repository rules, not product
behaviour. Case rows each side runs alone would have to restate the other
side's answers, so they could not catch the two drifting apart. While a host
lint or a webview request is in flight, the sides may differ by design: the
page keeps its tier until the host's results land. The spec does not check
those windows, so a session outside the page that wrongly escalates to
`escalating` goes unseen. #2227 ran 32 sequences on `6a37988a` and found no
disagreement.

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
`ci` check: it runs every mutant weekly and on demand on `main`, and on pull
requests and merges to `main` that touch a `domain/` folder re-tests only the
mutants affected by the change. Each `main` run uploads Stryker's incremental
file as the `stryker-incremental-modeler-core` artifact, and the next run
restores the newest one, so a pull request is compared against the `main` it
branched from rather than last week's. The baseline was a cache entry first;
the repository's caches exceed the 10 GB limit, eviction removed it within
hours, and every run fell back to all mutants and hit the timeout. A full run
takes about 30 minutes, so runs on `main` get 60 and are not cancelled by the
next merge, which would leave the baseline lost again. Its step summary
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
throws or returns a malformed finding. `--changes-only` prints only the new
and resolved rows, or what a function's `changesView` shows instead; every
pull request shows them (see **On a pull request**).

**On a pull request.** `.github/workflows/fitness-report.yml` runs on every
`pull_request`, with no branch filter, as `codeql.yml` does for stacked PRs.
It is no required check and not in `build.yml`'s `ci.needs`, so it never
blocks a merge, and findings never fail it.

- **What it shows.** Per function with a new or resolved row: its counts, the
  new rows and then the resolved ones in the function's groups (a collapsed
  group inside `<details>`), and its measures, misses, false reports and evidence in a
  collapsed `<details>`, since a reader judges a row by them. Functions with no
  change share one line, and a PR without a change says so. A function
  measured at the merge base but not at HEAD gets a line with its reason and
  counts as a change, since its findings at the base drop out without being
  resolved; one unmeasurable on both sides, such as convention-coverage before
  a workspace declared a kind, goes on another line and does not. The first line,
  `<!-- fitness-changes: some -->` or `<!-- fitness-changes: none -->`, tells
  the workflow whether anything changed; a spec pins it.
- **What a function shows instead** (`changesView`, #2371). After the trial
  in #2238 three functions declare one; the full report and the JSON keep
  every row of all of them. `size-and-complexity` is `grown-values`: under
  "Grown since the merge base", outside any `<details>`, it lists the
  existing files whose code lines or highest complexity are higher than at
  the merge base or new there, each with its trend (from the base to HEAD
  when no stored series exists). Its new files fold into one line with their
  count and the largest by code lines, its deleted files into a count. Only
  grown rows count as a change, so a PR that only adds or deletes files gets
  `fitness-changes: none` and no new comment: 259 of the trial's 341 new rows
  were such files, and none led to a change. `missed-partner` and
  `mutation-score` are `full-report-only`: they share a line naming them and
  never count as a change, unmeasurable ones included. A mutation score
  comes from a stored run, so it landed on whichever PR came next, and the
  missed-partner warnings left on PRs were judged false 10 times and never
  judged 7 times; the review reads both in the full report. The delta carries
  an existing finding's `valuesAtBase` when its values changed, so no
  finding or key changes and no version is bumped. On ten trial PRs (#2274
  to #2360, each squash commit against its first parent) the comment went
  from 100 size rows, 5 missed-partner rows and 1 mutation-score row to 143
  grown rows; 65 of them grew by 1 to 5 code lines, 23 by more than 20.
- **Measured commit.** The default checkout of `pull_request`, GitHub's test
  merge of the head into the base, with `--base "origin/<base branch>"`. Its
  first parent is the base tip, which is the merge base. Change-coupling and
  hotspots read the base's window and put the working tree's change against
  the merge base in front of it, so the whole PR counts as one change, as
  after the squash merge, both here and in a local `corepack yarn fitness` on
  the branch head, and no base commit leaves the window. `--head-label` names the
  PR head and the base it was merged into, so the summary does not leave a
  reader with only the merge commit's SHA. A conflicting PR has no test merge,
  and GitHub runs no `pull_request` workflow for it.
- **Size.** The job summary (1 MiB per step) carries every row: about 15 KB at
  #2181's test merge, 4 KB at #2201's. The same run writes a capped copy for
  the comment (`--capped-out <file> --max-characters 60000`), under GitHub's
  65,536-character comment limit with room for the marker. The cap gives every
  function the same row limit, the largest that fits, keeping new rows before
  resolved ones; then it leaves out the declarations, and as a last resort it
  prints only a note. It scans the limits down from the most rows instead of
  bisecting, since one row fewer can lengthen the text. A capped section ends
  with the number of rows left out and a pointer to the job summary, and no
  table or `<details>` is cut. A spec checks the length and the Markdown over
  40 budgets, and that a capped text's own length gives it back. Measured
  against `a2e5e8ee` (#1867), 250 first-parent commits before `8bfb20fc`, the
  summary held 771 rows in 170,267 characters and the comment 122 rows in
  58,683. The renderer counts UTF-16 code units, and GitHub does not say
  whether its comment limit counts characters or bytes. In a rerun without
  `--head-label`, the non-ASCII characters (`→`, `×`, `—` and the like) added
  124 bytes to the comment's 59,056 characters; a byte limit would only bite
  a capped comment holding thousands of them. No cap guards the summary: the
  largest measured one used a sixth of its limit, and the artifact holds
  `summary.md` whole beside `comment.md`.
- **Permissions.** The workflow grants `contents: read`. The `report` job runs
  the PR's code, which can change `tools/repo-checks`, uploads the summary and
  the comment as an artifact and writes nothing else. The `comment` job's own
  `permissions` replace the workflow's with only `pull-requests: write`, so it
  has no `contents: read`; it checks nothing out and runs no PR code. The
  artifact is still that code's output, so the job runs only for an author who
  could change the workflow anyway: a head in this repository, and not
  Dependabot. A Dependabot run gets the write token the job asks for, and its
  install runs the bumped package's lifecycle scripts, which could write the
  artifact. A fork's token cannot write. Both get the summary only. The job
  pages through the PR's comments for its own: the hidden marker
  `<!-- fitness-report-comment -->` on the first line, written by
  `github-actions[bot]`. Without a change and without an earlier comment it
  posts nothing; otherwise it creates the comment or updates it, to "no
  change" too. A failed read or write only warns. `pull_request_target` is
  not used.
- **Duration.** About 40 s on `ubuntu-latest` when the merge base has a
  stored snapshot, measured on the job's own pull request: the `report` job
  took 31 s (checkout with `fetch-depth: 0`, which fetches `fitness-history`
  too, 10 s; workspace setup 4 s; the report 12 s), the `comment` job 5 s on
  its own runner after it. A function runs on a checkout of the base when the
  PR bumps its version, when fitness-history has not stored the merge base
  yet, and on every stacked PR; measuring and storing a commit took
  fitness-history 53–113 s, so such a report should take one to two minutes.
  No extra fetch of `fitness-history`:
  a `--depth=1` fetch into the full clone makes git call it shallow, which the
  report treats as broken input.

Alternatives considered:

- **Measuring the PR head** (`github.event.pull_request.head.sha`) matches a
  local run, but compares with the branch point, not the base tip the PR
  lands on.
- **The full report in a comment**: about 240,600 characters on main
  (`8bfb20fc`), almost four times the limit.
- **Running the report twice**, once capped, doubles the measurement, a base
  checkout included.
- **One job with a write token** would give it to code the PR changes.

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
A function may declare a `changesView` (see **On a pull request**);
`grown-values` needs declared values, and the field changes no finding, so
setting it bumps no version. `findFindings` gets the tree, its commit and a `changeBase`: the merge base when
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
stays visible as existing, so no fitness function keeps an allowlist.

**Renames.** A finding lists the files its key names as `paths`, in the key's
order, with `pathOrder: "code-unit"` when the key sorts them whatever they are,
as a change-coupling pair does; every function fills them except
mutation-score, whose keys name folders. Before the delta the report reads the
working tree's renames since the merge base with the history reader's pinned
`git diff -M -l0 --name-status`, and matches each head finding by the key it
had at the base: the text around its `paths` stays, each renamed path goes back
to its old name, and a sorted key is sorted again. A finding in a renamed file
stays existing; one whose text also changed is new and its old key resolved.
Only head findings need `paths`, so a base finding matches by the key its
snapshot stores: the snapshots stay as they are, store no `paths`, and the
report shows none. `paths` the key does not name in their order are broken
input. The trend joins the stored series by that key at the base too, so a
renamed file keeps its series (see **Trend**). Not followed: a rename git does
not pair (a file changed too much for its 50 % similarity index, or a new file
not yet added), a key that names a folder, and a text or set moved into another
file. The diff took under 30 ms at #2140 (`f08fb08a` against `2af0dd7d`, 85
renames), whose new and resolved counts it took from host-text 50 + 50,
contract-suites 17 + 17, change-coupling 14 + 14, repeated-value-sets 9 + 9 and
hotspots 2 + 2 to 0, and size-and-complexity from 47 + 50 to 3 + 6, the files
the PR added and deleted.
The role-folder moves #2179 to #2181 dropped likewise; what they still show are
added and deleted files, sets moved into new files, and change-coupling pairs
the other side holds under no name. Two PRs without renames, #2172 and #2192,
report the same counts as before. Alternatives considered:

- **Rewriting the base findings forward** needs `paths` on every stored
  finding: 145 KB more on the 506 KB snapshot of `f08fb08a`, and the stored
  snapshots have none.
- **Replacing every renamed path in every key** can hit a path inside a text,
  or the start of a longer path.

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
is dated to the oldest stored commit that shows it. A finding's series lies
under the key the delta matched it by at the merge base, so a file renamed
since then continues its old path's series, as all 44 renamed files that
size-and-complexity measures at #2140 do. A commit that lacks the key, or holds
it twice, ends the series, so a rename before the merge base still ends it
there. A key that repeats at HEAD gets no trend,
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

- **Window.** The 924 first-parent commits up to the merge base, one
  squash-merged PR each, with the branch's change in front as one more record
  (version 2, #2228): the working tree against the merge base, the one PR its
  squash will land as. `withBranchAsOneChange` in `history/domain` builds it
  for this function, `hotspots` and `missed-partner`. Every base commit stays,
  so a row moves only through the branch's own change; the head's 925 records
  against main's 924 after the squash cost nothing, while dropping the oldest
  base commit brought back 7 new rows on untouched files in 6 of 28 PRs. The
  record's subject is `branch`, not the PR title, which only CI knows, so a
  `chore(deps)` PR counts as a change, as GitHub's test merge did in version 1.
  The base run and every snapshot measure no change and keep their window. A
  commit count, not a date: the dates of the older history were
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
- **Read files.** Non-spec `.ts`/`.tsx` and every `.json` file under a
  workspace's `src/`, Kotlin under `src/main/`, `.mjs` anywhere in a workspace
  except build configs (`*.config.*`), and a manifest that declares
  `contributes` (today `apps/vscode-plugin/package.json`). Specs, test folders
  (`__fixtures__`, `__tests__`, `test/`, `tests/`) and barrels are not read.
  Workspaces are the dirs the root `workspaces` entries match, with or without
  a `package.json`, so the Gradle-built IntelliJ plugin is read. Read literally,
  the issue's "outside `src/`" exclusion would have read no `.mjs` file at
  all, such as the `check-*.mjs` scripts or
  `libs/bpmn-i18n-extras/tools/build-overlay.mjs`.
- **Generated files.** Not read: the tracked files git marks
  `linguist-generated`, bare or `=true` as GitHub reads it, today the 13
  translation overlays in `libs/bpmn-i18n-extras/src/languages/`, marked in
  the root `.gitattributes`. The `SourceStructure` adapter asks `git
  check-attr` once for every tracked file, so `sourceLayout.ts` stays pure and
  a checkout of another commit reads that commit's `.gitattributes`. git also
  reads a nested `.gitattributes`, `.git/info/attributes` and
  `core.attributesFile`; the last two are local, so a mark there changes a
  local run but not CI's. `generatedFiles.spec.ts` fails when a
  `linguist-generated` pattern of any tracked `.gitattributes` matches no
  tracked file, so a stale entry
  cannot let its files be read again unnoticed. GitHub collapses the same
  files in a pull request's diff. Unmarked, the overlays and their generator
  turn 53 findings into 130 at `c001a82f`.
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

Trial of version 2, rows new/resolved before → after. At each PR head against
its `baseRefOid`: #2047 at `3d1b19b3` against `452b6440` (38 commits, 3
merges) 10/15 → 0/0, and 46/79 → 3/8 over 28 PRs, of them on files the
branch did not touch 92 → 1. On GitHub's test merge of 27 PRs: 10/8 → 3/8;
#2255, #2256 and #2257 no longer show `BridgeScriptEditor.ts` ↔
`apps/vscode-plugin/src/main.ts`, #2332 and #2333 no longer
`ModelerSettingsConfigurable.kt` ↔ `apps/vscode-plugin/package.json`. The
one row left on untouched files: #2180 deletes and re-adds a `bootstrap.ts`,
so a past commit falls from 31 to 30 read files and counts, which the function
names as a false report. The 28 merge-base trees and 28 stored snapshots
(every 20th of 558) keep their findings.

Version 3 (#2218) reads files by extension and declaration instead of by
name: every `.json` under `src/` instead of `*.schema.json` and
`*.cases.json`, and generated files by their `linguist-generated` mark instead
of skipping every folder named `languages`. A JSON contract named any other
way, such as the bridge's `protocol.json`, was invisible to change-coupling
and missed-partner. At `c001a82f`, 50 → 53 findings: 6 across-languages pairs
with `protocol.json` come in, `descriptor.ts` (87 %) and `types.ts` (71 %),
the snapshot's sources, `CoreProcess.kt`, `HostUiRouter.kt` and
`EditorSessionRouter.kt`, the protocol's Kotlin half that no spec pins
(#2223), and the composition root `editorSessionFeature.ts`. The two theme
files of `libs/standalone-extension` add none. 3 pairs leave:
`ModelerSettingsConfigurable.kt` and `ModelerSettingsStore.kt` ↔
`VsCodeSettings.ts`, and `CoreProcess.kt` ↔ `RpcResults.kt`, each at 5 shared
changes: #2172 also changes `protocol.json`, now holds 31 read files and is no
longer counted. The mark skips the same 13 files the folder name did. 0.61 to
0.65 s per tree warm, version 2 0.56 to 0.57 s in the same runs; the
difference is the one `git check-attr`. missed-partner version 2 reads the
same files; in its replay at the chosen thresholds 103 → 107 warnings, 27 →
28 hits, precision 26.2 % both, margin over chance 6.1 → 5.4 points. The base
of the pull request that adds `.gitattributes` has no mark, so its base run
reads the overlays and shows their pairs as resolved once.

Alternatives considered:

- **The generator's header** (`GENERATED from a runtime harvest`), which all
  13 files carry. It needs no new file and reads the same on every commit, but
  it is a text convention a generator may word differently, while the
  attribute is a declaration GitHub honours too.
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
  `.mjs` and `.cjs` file, without specs, tests and the test folders
  `__fixtures__/`, `__tests__/`, `test/` and `tests/` (tests and their inputs,
  as contract suites leave them out; v2, #2294), declaration files
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
  are the same key twice. A finding also names the occurrences that list the
  values in another order, compared by first appearance, and the remedy: pin
  the copy to the home's type. In #2304 a reversed home replaced such a copy
  and tied the marketplace fetch order to the add prompt's; deriving a copy
  from its home fits only where the order is the same concern. The order of a
  union or an `||` chain is compared too, although it means nothing; the
  message is not part of the key. A copy that drifts, a value added to or
  removed from one copy only, shows as resolved, not new: the head no longer
  holds the set in two files, and nothing at the head relates the two now
  different sets.
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
`toEqualTypeOf` skips it. Leaving out the test folders (v2) took `fe75e584`
from 66 to 61 findings: the 5 gone are an e2e page object's editor kinds and
theme modes and their product copies. A copy whose other half sits in a spec
or a test folder, such as `SOURCE_ONLY` before #2236, gives no finding.

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
  commit. The window ends at the merge base, and a branch adds one revision to
  each file it changed, as its squash will (version 3, #2228, the same record
  as in [change coupling](#change-coupling)). Version 2 read the window from
  the head, so each branch commit was a revision and a merge of main one
  revision for all its PRs. Mechanical commits (`isMechanicalCommit`) are not counted. There is
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
- **Barrels.** A barrel, a file with no statement other than imports and
  re-exports (`readModuleSymbols`, the test that keeps barrels out of
  [change coupling](#change-coupling)), is not ranked (version 2). It changes
  whenever its exports change, and it holds no rule, so it only pushes a file
  with code out of the top 20. At `add816a2` version 1 ranked
  `libs/modeler-core/src/index.ts` 8th (60 revisions × 161 code lines) and
  `ArtifactService.ts` (24 × 197) 21st; version 2 ranks `ArtifactService.ts`
  20th. The flag travels with each file's measures (`FileMeasure.barrel`). A
  file of declarations, such as `libs/shared/src/lib/modeler.ts`, is no
  barrel and stays ranked, and so does a file that re-exports through
  declarations of its own (`export const DiffViewer = DiffViewerImpl` in
  `packages/bpmn-modeler/src/index.ts`, 60th at `add816a2`), which the
  function names as a false report. Leaving out every file without a function
  as well would also drop `apps/modeler-bridge/src/protocol/domain/types.ts`
  (9th at `add816a2`); that needs a trial of its own.
- **No trend of its own.** Findings carry no values; the per-file trend is
  `size-and-complexity`'s, joined by path.

Trial at `e8c92425`, 924 commits, 825 measured files: the product's top 20
holds 5 of the 8 `libs/modeler-core` services over 300 lines that #2057 names
(`DeploymentMessageDispatcher` 10th, `DeploymentTargetService` 13th,
`CodeLinkMapService` 16th, `BpmnLintConfigService` 17th, `DeploymentService`
18th; `TemplateMarketplaceService` 22nd, `EditorSessionStore` 23rd,
`SourceIndex` 61st; version 1 ranked the barrel
`libs/modeler-core/src/index.ts` 9th and each of them one place lower).
Ranking by revisions alone holds none of them and puts three barrels,
`apps/bpmn-webview/vitest.config.ts` and the 60-line
`apps/vscode-plugin/src/main.ts` in its top 20. The first places go to
`libs/shared/src/lib/modeler.ts` (46 × 794), a type-only protocol file that
holds no rules, which the function names as a false report.

Trial of version 2 over the 428 stored snapshots with version 1 findings,
`0966e35f` (2026-09-30) to `eb4fe899` (2026-11-06), each tree checked out:
version 1 recomputed matched every stored top 20, so the comparison measures
the barrel rule alone. Version 2 drops `libs/modeler-core/src/index.ts` from
197 of them, where it ranked 8th to 20th; no other file leaves, though each
tree holds 15 to 23 barrels. Every file below it moves up one place, and the
next file enters 20th: `DeploymentService.ts` 59 times, `ArtifactService.ts`
38, `BpmnLintConfigService.ts` 32, `AppendMenuOverlay.tsx` 24 and six other
files 44. Nothing else changes. A version bump restarts the series, which the
backfill recomputes from git.

Trial of version 3, rows new/resolved before → after. #2047 at `3d1b19b3`
against `452b6440`: 1/1 → 0/0; `TemplateBuilder.tsx` had entered at 5 branch
commits × 1,284 code lines = 6,420 and stays out as one revision. 12/12 → 4/4
over 28 PR heads. On GitHub's test merge of the 6 trial PRs whose comment
showed hotspot rows: 6/6 → 4/4; in each of the 4 left a file the PR touched
enters and pushes the 20th out, which the function names as a false report.
The 28 merge-base trees and 28 stored snapshots keep their findings.

### Missed partner

`missed-partner` (#2095) warns when the branch changes a file without the
partner it usually changes with: atomic, triggered, dynamic, reported. It
catches drift in the PR where it happens, which `change-coupling` cannot: a
drifted copy is one that changed without the other, so its co-change stays
low (1 of 9 known copies listed). It mines association rules F → P from the
history (Zimmermann et al., ROSE, ICSE 2004 / TSE 2005) and lives in the
`changeCoupling` context, reusing its read files, counted commits and history
reader. Version 2 (#2218) follows change-coupling version 3: every `.json`
under `src/`, generated files skipped by their `linguist-generated` mark; the
replay is in [Change coupling](#change-coupling). On main it finds 0 warnings
in both versions, as the base and every snapshot measure no change and return
at once (0.01 s). A branch run, this PR's tree against `c001a82f`, takes 0.38
to 0.50 s warm, version 1 0.37 to 0.39 s in the same session; the difference
is the one `git check-attr` it shares with change-coupling.

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
reads Kotlin, version 3 (#2372) leaves markup and the messages of Kotlin's
preconditions unread, and version 4 (#2218) derives the Kotlin loggers from
their declarations; a new version restarts the series, which the engine
recomputes from git.

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
  nearest brace): code a callee runs is no argument it is handed. For a brace
  right after a call's `)` the Kotlin reader names that call as the one the
  lambda trails (`require` in `require(ok) { "…" }`).
- **A text** is a literal one of whose stretches holds two words: two
  whitespace-separated tokens that each hold a letter or a digit. A placeholder
  is no word, so formats such as `${a}: ${b}` and `$(${icon}) ${label}` hold no
  text; at `8d75923b` judging the joined template instead added 9 findings,
  all such formats, and no text. Punctuation around whitespace is no text
  either: at `cd48f2cd` requiring a letter or a digit on both sides dropped 9
  findings, 3 CSS selector lines such as `:root {`, 4 scripts
  `window.postMessage(${…}, '*');` and 2 Markdown formats, and no text.
  Markup is no word (version 3): a tag, from a `<` before a letter, `!` or `/`
  to the next `>` or the end of the literal, placeholders inside included, and
  the content of a `title`, `style` or `script` element, which a page does not
  show. An HTML shell of structure, title, style and script holds no text, and
  a text in its body or after a tag (`<code>marketplace.json</code>, one per
  line`) does. An attribute a user sees, such as `title` or `aria-label`, is
  missed, and an XML declaration is no tag, so the DMN template stays read.
- **Not read.** A literal inside the arguments of `new Error(…)`, of a call a
  Kotlin `throw` raises (Kotlin constructs without `new`), of a TypeScript
  call to `log` or a `log` + capital function (`logError`, not `login`), the
  members of the core's `LoggerPort`, or of a Kotlin call on an IntelliJ
  logger, up to the nearest function or lambda. Version 4 (#2218) derives the
  Kotlin loggers from their declarations instead of the variable names `log`,
  `LOG`, `logger`, `thisLogger` and `console`: a value the file declares from
  `Logger.getInstance(…)`, `logger<T>()` or `fileLogger()`, as a property, a
  top-level value or a constructor property's default
  (`HostNotifications.kt`), read by `readKotlinInitializedValues` of the
  engine, each factory imported from `com.intellij.openapi.diagnostic` or
  called fully qualified, and `thisLogger()`, imported from there. A call
  site names only its receiver's callee, so a fully qualified
  `thisLogger().warn(…)` cannot be told from another `thisLogger` and is
  read. `thisLogger()` is the logger IntelliJ recommends, so new Kotlin host
  code logs through `thisLogger().warn(…)`; the tree holds none yet. The
  `log…` pattern no longer applies to Kotlin, where it matched no call. In
  TypeScript, `console` is no logger any more: it matched no call, and host
  code logs through `LoggerPort`, so a text on `console` is reported. Two
  names stay, each declared in the function's limits and guarded by
  `hostTextNames.spec.ts`, which fails when one no longer takes a text in
  host code: `log…`, the members of the core's `LoggerPort`, and the global
  `Error`. The guard does not tell which functions a name covers: a private
  `logError` helper alone would keep `log…` green. Version 1 read through functions, so it skipped every text inside
  `logAndRethrow(async () => …)`: 5 texts of `CommandController.ts` at
  `cd48f2cd`. The lambda after the parentheses of Kotlin's `require(…)`,
  `check(…)`, `requireNotNull(…)` and `checkNotNull(…)` is their message, so
  it is not read (version 3). Kotlin's `error(…)` throws too, but the UI DSL's
  validation `error(…)` shows its text, and a callee name cannot tell them
  apart, so it is read. An exception Kotlin constructs without
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

Version 3 at `fe75e584` (the same counts at `862b8a02`): 156 to 112 findings,
44 dropped and none added. 41 are markup: the 33 rows of `WebviewServer.kt`'s
three shells, written one line per literal (tags, two document titles, a style
element), 6 TypeScript shells (structure, a title and a script each), 1 tag
fragment (the DMN properties panel markup) and a log redaction marker. 3 are
`require(…)` invariants. No dropped row is a text a user sees. The 6 literals that start with a tag and hold text stay: two
JCEF-unavailable labels, the out-of-process notice (2) and two settings
comments. "Starts with `<!DOCTYPE`" (#2309's proposal) dropped 9 and left 30
lines of the Kotlin shells; "starts with a tag" dropped 47, those 6 user texts
among them; tags without the element content dropped 33 and left 5 TypeScript
shells for their two-word titles. Of the 17 new rows of the trial (#2238), at
each PR's final head, the 6 shell rows, the 3 `require(…)` rows and 2 moved
shell lines of #2310 are gone; #2310's other 6 stay.

Version 4 at `c001a82f`: 112 findings, the same keys as version 3. 17 Kotlin
host files declare a logger from `Logger.getInstance(…)`, all named `log`, and
41 two-word texts in 16 of them stay unread; no host file calls
`thisLogger()`, `logger<T>()` or `fileLogger()`. TypeScript leaves 7 texts in
5 files unread through `log…` and 9 through `new Error`; dropping `console`,
which took none, and `log`, `LOG` and `logger` adds no finding, as the one
text on `this.logger` goes to `logWarning(…)`. 0.20 to 0.41 s per tree warm,
version 3 0.17 to 0.19 s in the same runs; the Kotlin host files are lexed a
second time.

Alternatives considered:

- **Log calls and `Error` subclasses decided by type** (#2218's first
  proposal): a call whose callee resolves to a member of `LoggerPort` or of
  the global `Console`, a construction that derives from the global `Error`.
  The two type programs over `apps/vscode-plugin` and `apps/modeler-bridge`
  and the resolution of the 257 calls that hold a literal took 1.5 to 2.1 s
  on a working tree with node_modules, ten times the function, and change no
  finding at `c001a82f`: host code constructs no `TypeError` or `Error`
  subclass with a text, and every log call goes through `LoggerPort`. It also
  needs the `LoggerPort` anchor by path, a product name of its own. The
  function keeps `log…` and `Error`, names both in its limits and guards
  both with `hostTextNames.spec.ts`.
- **Keeping `console` as a platform global, unguarded.** No rename removes
  it, but it took no text at `c001a82f`, so a guard on it would fail at once,
  and #2218 asks that every name left takes a text. Host code logs through
  `LoggerPort`, so a text on `console` is worth a row.
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
- **Excluding `error(…)` by name.** At `cd48f2cd` it hides the validation text
  of `AddMarketplaceAction.kt` to drop one developer error.
- **Excluding a literal that starts with a tag, or the arguments of
  `executeJavaScript`.** Markup also wraps user text (`<code>`, `<b>` on the
  settings page): the first drops the 6 user texts measured above, and a
  callee name is not call shape. Version 3 reads the text inside and after a
  tag, and the JavaScript stays reported.

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
contract suite in the core's test kit once a second adapter meets it, and
every adapter of the port runs it, the in-memory fake included. A port that
only renders and a strategy the core chooses between are correct without one,
so a rule over every port would fire on correct code; the function reports and
never blocks. A port whose methods return `void` but whose value the core
reads back through another port does not only render, though its types say
so: it needs a suite whose fixture pairs it with the reader, as `describeLintingPreferenceContract` pairs
`LintingPreferencePort` with `SettingsPort.getLintingEnabled`. The pure measure
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
- **Structural adapters (version 2, #2370).** A class without an
  `implements` clause is an adapter when a production file of a hexagonal
  workspace hands it over where the port is expected: an argument, an
  assignment (`??=`, `||=` and `&&=` too), a return value, an initializer, a
  property, an array element or a branch of a conditional, as the type
  checker's contextual type shows. Of a union only the parts the value meets
  count, and a class passed as its constructor meets what the constructor
  returns. An interface handed over as the port passes it on to what meets
  that interface: VS Code's `vsCodeModelerPreferences` is typed by the host's
  `ModelerPreferences`, which the composition hands to
  `ModelerLanguageService` as `LanguagePreferencePort`. Outside the core's
  workspace, a module-scope variable or function that names an object literal
  handed over that way is an adapter too, and a spec covers it by importing
  it; a literal named inside a function is missed, as no spec can import it.
  What a spec hands over counts for nothing, a class reached only as its own
  type or through a type parameter bounded by the port is not seen, and an
  interface none of whose members is a function holds data and lists no pair.
- **Inside the core (#2355).** An implementer inside the core counts like a
  host's. The add-on inventories meet the add-on source ports, and
  `PluginInventory` and `RulePackageInventory` both meet `CodeAddOnSource`,
  the shape of the disagreement the review of #2289 found by hand.
  `JsonFormTextEdits` stays the only adapter of `FormTextEdits`, set aside;
  a second implementation lists it. Object literals in the core are not
  counted: the four the trial found (`TRUSTED_WORKSPACE`,
  `PANEL_ALWAYS_VISIBLE`, `fingerprintHasher`, `NO_GIT_FILES`) are defaults
  or kit stubs that drop the port's behaviour by design, so a kit fake
  written as a literal is missed with them.
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
- **Coverage.** A spec covers a pair when it imports the adapter as a
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
  `NotifierPort` is not: `withProgress<T>` returns the task's `Promise<T>`, so
  its three adapters were true findings until each ran
  `describeNotifierContract`, while its base `LoggerPort` is render-only. That
  suite clears the `LoggerPort` pairs too, because a `NotifierPort` fixture
  holds a `LoggerPort`, though it calls no logging member.
  The types cannot see a value the core reads back through another port.
  `LintingPreferencePort.setLintingEnabled` returns `void | Promise<void>`,
  and the core reads the choice back through `SettingsPort.getLintingEnabled`;
  the port has `describeLintingPreferenceContract`, so an adapter that skips
  it is listed. `LanguagePreferencePort.setLanguage`, read back through
  `SettingsPort.getLanguage`, has no suite, and its two pairs stay
  render-only.
- **One adapter.** A port the core reads back from with one adapter and no
  suite has nothing to drift from yet: the kit has no fake of it, and a fake
  written inside a spec is no adapter. Its pair is set aside in a collapsed
  group, derived from the adapter count as render-only is from the types, and
  moves up to the ports without a suite when a second adapter meets the
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

Version 2 at `fe75e584`: 88 to 93 adapters and 17 to 25 findings, none lost:
the two `CodeAddOnSource` pairs listed without a suite, five pairs set aside
with one adapter (the four inventories' own ports and `BridgeSettings` as
`SettingChanges`) and one render-only pair, so `LanguagePreferencePort` has
two adapters. At the heads of #2289, #2296 and #2341 the findings go from 15
to 20, 15 to 22 and 17 to 25. Counting every object literal would list 30 on
main, the 4 core literals as adapters that skip their suite and a kit value
of `ApprovalReviewRequest`, an interface of data. The read took 2.2 to 3.8 s
per tree instead of 1.5 to 2.2 s, on a machine loaded by other runs.

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
  and the render-only derivation need. For the same reason
  `convention-coverage`, which reads syntax only, does not take over the
  structural derivation.
- **Structural assignability to every port.** Any class whose shape fits a
  port would count, a `dispose()` holder as an adapter of every port that
  only disposes; a handover is the composition's own statement.
- **No implementer inside the core (#2355).** At `fe75e584` it drops 17 of
  25 findings: the six strategy pairs declared as false reports, but also
  both `CodeAddOnSource` pairs and every core port with one adapter. The
  single-implementation case #2355 named is already set aside.

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
code. When a PR's head conflicts with its base, as a stacked PR's often
does, its touched files are the change since the commit that the head's
newest merge after the merge base took in, or since the merge base when the
head has no such merge, and each conflicted file is labelled as changed or
not changed by the PR. It searches for copies of a rule with one `git grep`
over the tracked TypeScript, Kotlin, build scripts, CI workflows, docs and
JSON, searches a touched list, union or enum by two or three of its members
to find copies with other names and members, looks for an existing home by
concept, compares the other callers of each function the change calls, and
takes the `change-coupling` and `missed-partner` findings of the touched
files as the search for copies whose spelling is unknown. It reviews what no
fitness function sees: a rule in another spelling, copies that already
disagree, adapters of one port that disagree, two derivations of one state,
logic in the wrong layer, wiring per host, a workspace without its siblings'
guards, catch-all modules and silently ignored commands. A whole tree is
reviewed one area per run, or at most five ports in hotspot order; the run
checks every row in the areas it walked, and names the areas it did not
cover and the rows it left unchecked. It proposes measures from trends. The
reviewer runs the commands it writes itself under bash, because zsh and the
regex of macOS broke them in 6 of the 9 runs of rounds 2 and 3 below. Each
finding names `path:line`, its evidence and the fitness function, limit or
trial that applies; a report row it drops goes under "Marked, no action".
"Already duplicated before this PR" is never a reason to keep a copy: the PR
fixes it, or an issue names `path:line` of each copy.

A fitness function can report wrongly or miss erosion beyond its declared
limits, so the review checks each row in the code before it reports or drops
it, and marks a row the code disproves as a false alarm, with the evidence.
Before it calls a row false, it looks up the function's trials that name the
row's files: a trial that names the row and counts it as true, at a commit
where the row's code reads as it does now, makes the row a finding, and any
other trial is a lead. Before it calls a false alarm undeclared, it quotes
the nearest `reportsWrongly` entry, or the collapsed group that sets the row
aside, and says why it does not fit; before it proposes a `reportsWrongly`
entry, it checks that the row is not one rule held in two places. For each
false alarm no `reportsWrongly` entry declares, and each erosion a
function's `measures` covers but it missed, it proposes, apart from its
findings, a narrower rule, an exclusion derived from types, folders, imports
or configuration, or at least a `reportsWrongly` or `misses` entry. For a
row an entry already declares, it proposes a narrower rule or an exclusion
only when the code can decide the case. It says whether each proposal is a
fix in the PR or an issue for a maintainer to check before it is filed. A
proposal that changes a function's rule bumps its version and needs a
measured trial.

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
after the 15 changes round 1 proposed (two of them in part). Round 3 ran it
once per case with the row check and the proposals for the fitness functions
(the trial lookup and the proposals for declared rows came from its results
and are unmeasured), and a second judge per run checked in the code each row
the run set aside, each proposal and each row it cited as erosion. One run
per case shows that the step runs and what its feedback is worth, not a
trend.

| Case (items) | Round | Matched per run (exact) | Added: true / plausible / false | Mean run time |
| --- | --- | --- | --- | --- |
| #2040 (4) | 1 | 3 (1), 3 (3), 1 (1) | 3 / 10 / 2 | 401 s |
| #2040 (4) | 2 | 4 (4), 4 (4) | 2 / 8 / 0 | 624 s |
| #2040 (4) | 3 | 3 (3) | 1 / 4 / 0 | 606 s |
| #2047 (15) | 1 | 8 (3), 8 (0), 8 (1) | 8 / 10 / 0 | 705 s |
| #2047 (15) | 2 | 10 (2), 9 (2) | 5 / 7 / 0 | 796 s |
| #2047 (15) | 3 | 9 (3) | 3 / 5 / 0 | 1016 s |
| #1799 (20) | 1 | 4 (0) in each run | 15 / 3 / 1 | 565 s |
| #1799 (20) | 2 | 4 (0) in each run | 12 / 3 / 0 | 674 s |
| #1799 (20) | 3 | 4 (0) | 3 / 1 / 0 | 873 s |

Two of #2047's round-2 and three of its round-3 plausible findings are trend
notes, which those two judges counted and the others did not. #1799's
round-3 judge scored three findings as support for S1 and S2, not as added.

- **Stability.** Coverage is mostly stable across rounds: #2047 1.5 was half
  found in all six runs and 1.8 in five, #1799 matched S1 to S4 partly in all
  six. Depth and the added findings vary: #2047 1.2, 1.6, 1.8 and 3.1 and
  most added findings came and went between runs, #2040 R2 was exact in both
  round-2 runs and missed in round 3, and the exact/partial split moves by
  about one item per run between judges, who scored one observation as a
  match in one run and as an addition in the other.
- **What it finds**, in at least 5 of 6 runs: a rule written twice in
  different spellings near the diff (#2040's verify rule, #2047 1.1, the
  deployable-file rule as a glob and as an extension list), text built per
  host (#2047 3.4), the CI path filter that misses the Kotlin test inputs
  (not in the reference) and #1799's structural causes, partly. Round 2's
  checks matched exactly, in both runs, the home that moved code bypasses,
  the host that cuts a list before the core sorts it, the two derivations of
  one state and the two type declarations that disagree; round 1 matched each
  exactly in at most one of three runs, round 3 all but the two derivations.
- **What it misses:** a second copy it must discover rather than follow from
  the diff, with another name and other members (#2047 3.5 and #1799 D10 and
  D15 in 0 of 6 runs, the key lists of #2047 1.4 in 1); the guards a new
  workspace lacks (#2047 1.7, 0 of 6); wiring compared with the sibling
  feature's (the VS Code half of #2047 1.2, 0 of 6); the second halves of
  bundled items (#2047 1.5 and 1.8); and most of a whole tree: each
  whole-tree run since round 2 listed 7 or 8 of about 15 ports as not
  compared, and D1 to D16 were missed in all 96 run-items. Defects inside one
  copy (#2047 3.3 and 3.6, most D items) belong to code review, not to this
  skill.
- **False findings:** 3 of 106 added findings (2.8 %), none of 54 in rounds
  2 and 3, which still allows up to about 6 % at 95 % confidence. 51 of the
  106 are only plausible, real but arguable or minor, and about five findings
  in each of rounds 2 and 3 carry one wrong sub-claim, so about half the added
  findings are worth acting on.
- **Fitness function feedback** (round 3). Each run kept its proposals apart
  from its findings and named the function's `id` and version in each. Of
  the 40 items the runs set aside (one item can hold several report rows),
  25 are false alarms an entry already declares, 4 undeclared ones (the runs
  proposed a fix for 2, and claimed 2 declared ones as undeclared), 5
  unclear and 6 true findings wrongly dismissed, at least one per run. The
  worst: the #1799 run called the lint-config copy, which `change-coupling`'s
  evidence names, two halves of one protocol and proposed a `reportsWrongly`
  entry that declares it false. Two of the six, that copy and a `host-text`
  row of #2047, are rows the function's own trials count as true, so the
  review now looks those trials up before it calls a row false. The
  lint-config trial ran at `c53e97f0`, after #1799's tree. The `host-text`
  trial ran at #2047's own commit but counts the file's 7 texts together,
  and the judge rated one of them a declared false alarm and one unclear.
  The #1799 run also dismissed the copy although a `missed-partner` limit it
  read names it. So a trial decides only where it names the row and the
  row's code is unchanged. Of 17 proposals, 6 are correct and actionable, 3
  right but vague, 7 wrong (an entry that would mark correct rows false or
  restates an existing one, or a rule on a false premise) and 1 would read a
  type name, which no fitness function may. Two of the 6 correct ones narrow
  rows an entry already declares (log text that reaches a logger through a
  parameter, and adapters of one port that `change-coupling` lists as
  explained by their shared import). Round 3's step did not ask for that, so
  the review now asks for such a rule where the code can decide the case.
  One row a run cited as applying to a finding is a declared false alarm
  (the `hotspots` rank of `TemplateBuilder.tsx`, which comes from branch
  commits). #1799's judge also called its marketplace dialog titles host
  chrome, but `host-text` declares IntelliJ's action names, not dialog
  titles, and #2172 has since moved those titles into the core. The step
  finds real gaps in the functions, but each proposal needs a maintainer's
  check before it becomes an issue, the row check does not stop true
  findings from being dismissed, and a whole tree has more rows than one run
  checks (331 for `repeated-value-sets` and `host-text` at #1799).
- **Cost:** 10.1 to 16.9 min per round-3 run (mean 13.9 min; round 2 11.6,
  round 1 9.3), plus 5 to 13 s for the report; tokens were not recorded. One
  run per case cannot say how much of the rise step 6 causes. The PR's author
  then triages 8 to 15 numbered findings, the marked rows and the feedback.
- **What rounds 2 and 3 show.** Most of round 2's checks were written from
  round 1's misses on the same cases, so it shows that they fire, not that
  they generalize. Matched items per run rose (#2040 from 2.3 to 4.0, #2047
  from 8.0 to 9.5), all on items a change aimed at; the seven #2047 items no
  change aimed at went from 12 of 21 run-items to 7 of 14, and #1799's score
  did not move. Two runs per case cannot tell a one-item difference from
  judge noise, and round 3's single runs (#2040 3, #2047 9 and #1799 4
  matched; 3 of the 7 untargeted #2047 items) lie within that spread. False
  findings fell from 3 to 0 and stayed there: two were dropped report rows,
  which now have their own section, and one an "unpinned" claim that the
  pin-check rule now catches.
- **Contamination.** All rounds ran with some answers in the tree. The
  `tdd` skill and [Architecture tests](#architecture-tests) name
  `verifiesDeployments`, #2040's fix, and this change had added it as the
  `architecture` skill's naming example before rounds 1 and 2, so #2040 R1's
  exact match in those five runs is contaminated in part by this change
  itself; round 3 ran with another example there and matched R1 exactly too.
  The limits of `change-coupling` and `repeated-value-sets` name a structural
  cause and a defect of #1799 and parts of #2047; round-2 runs quoted them,
  and the round-3 run on #1799 flagged them. This section now names the
  answers of all three cases, so if recall is ever measured again, it needs
  PRs whose answers the tree does not name.

**The trial (#2238).** From 2026-11-07 to 2026-11-12 the skill ran on 16
feature PRs and made about 75 findings, eight of them behaviour bugs. From
#2274 on, nearly every finding was accepted and fixed; in the first two
reviews (#2251, #2252), a skeptic judged 13 of 16 findings no defect. About
7 of the 75 trace to a report row, and none of the eight behaviour bugs:
those came from the copy search, from comparing a port's adapters and from
comparing the wiring per host. Recall was not measured; no trial PR has a
reference list.

**On demand, no CI job** (decided on #2238, 2026-11-12). The review stays a
skill run by hand, on PRs that move rules between layers, add a host feature
or add a workspace: the shape of #2040 and #2047, where it scored best. It
gets no CI pilot. Only two trial runs were timed (379 s and 287 s), the first
two reviews needed a skeptic to filter their findings, and runs differ, so
the comment would change from push to push. A job would also need a
workflow, an API secret and possibly a dependency. A run on 3 to 5 held-out
merged PRs, with a CI pilot if it matched most architectural items at a
false rate under 10 %, was proposed and is dropped. Instead, one finished
review is repeated without the fitness report, to measure what the report
adds to the skill (#2231). The review's fitness function proposals go to a
maintainer, who files the ones that hold.

The skill changes proposed with that run are in (#2231): the bash note, the
stacked PR's own change and its labelled conflicts, the whole-tree areas
with their port and row budget, the search by members, each function's
`base.unmeasurable` in the summary, and the two checks before it calls a
false alarm undeclared or proposes a `reportsWrongly` entry. Only the run
below has used them.

**Without the report** (#2231, 2026-11-13). The review of #2359 at
`048b2100` was repeated with the changed skill, skipping every step that
reads the report. It found 7 of the posted review's 10 findings, two of them
in part. Of the three findings that cite a report row, it found two without
the row. Of its three misses, one came from the report (a size row and a
trend); the other two had no row and are checks the skill already asks for.
It also made six findings the posted review lacks, four of them real and
minor. Only the report gave the trends and the proposals for the fitness
functions. So the report's value lies in trends, placement leads and
feedback on the functions, not in finding erosion. One run on one PR; the
reviewer read the PR body, which names three of the original fixes.

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
additions are arguable, so the PR's author triages them, and it runs by hand,
with no CI job. The data branch is one
more ref to keep: deleting it costs a backfill, and nothing but convention
keeps people from pushing to it.
Rules move into `domain/` before or together with the feature that needs
them, so services shrink to orchestration. No gate enforces test-first;
reviewers check the failing output in the PR description.
