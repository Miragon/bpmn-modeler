# Dependencies

- Status: accepted
- Last reviewed: 2026-11-13

## Context

The modeler builds on upstream bpmn-io packages whose identity matters (a second
copy of bpmn-js, diagram-js or preact breaks plugins and the properties panel),
reaches into undocumented upstream members, and straddles two TypeScript
compilers. This topic records how those dependencies are kept coherent. Release
mechanics are in [Release and publishing](release-and-publishing.md); the
standalone app's own dependency constraints are in [Standalone app](standalone-app.md).

## Contents

- [Private upstream APIs](#private-upstream-apis)
- [Identity-sensitive packages](#identity-sensitive-packages)
- [TypeScript compilers](#typescript-compilers)

## Decision

### Private upstream APIs

Confine access to undocumented upstream members behind small typed adapters, each
in an `upstreamInternals/` folder of its library (the package's lint adapter in
`src/bpmnlint/upstreamInternals/`). An adapter validates the runtime shape and
reports a descriptive error naming the dependency and the pinned expectation.
Callers use narrow public concepts, never private member names.

| Adapter | Assumption and enforcement |
| --- | --- |
| Clipboard `directEditingInternals` | `_textbox.content`; installed shape tested in Chromium |
| Diff `differResult` | Private differ category keys; real differ-result test |
| Diff `moddleNamespaces` | moddle-xml's `nsMap` option and its private `DEFAULT_NS_MAP` prefixes; real parser and serializer test |
| Append-menu `popupMenuInternals` | `_getContext`; installed shape tested in Chromium |
| Properties-panel `engineGroupData` | Copied engine group/entry IDs; real providers in Chromium and a template-prefix test in the library |
| Lint `lintingInternals` | The vendor's private formatting and overlay helpers; the upstream-shape test |

- The [package architecture tests](../../packages/bpmn-modeler/src/architecture.spec.ts)
  scan the package and inlined libraries and reject a private-member reach outside
  an `upstreamInternals/` folder (the vendored panel fork excepted). They read the
  folder, not file names.
- Installed-package tests make a dependency bump fail where its shape changed:
  [upstream shapes](../../packages/bpmn-modeler/src/upstreamShape.browser.spec.ts),
  [engine groups](../../packages/bpmn-modeler/src/engineGroupData.upstream.browser.spec.ts),
  [differ results](../../libs/bpmn-diff/src/upstreamInternals/differResult.spec.ts),
  [moddle namespaces](../../libs/bpmn-diff/src/upstreamInternals/moddleNamespaces.spec.ts)
  and [template prefixes](../../libs/properties-panel/src/modeFilter/engineGroupData.upstream.spec.ts).
  The `bpmn-diff` and `properties-panel` targets list `yarn.lock` among their
  trigger paths so a lockfile-only bump re-runs the pins. The clipboard catches a
  shape failure, logs it and disables that path; the CI test is the standing
  failure signal.
- Type core DI lookups with the public core-service map and the internal
  `CoreServiceAccessor`; use minimal structural interfaces for non-core seams.
  Global didi service-map augmentation would expose too much and still not type
  private members. An architecture scan avoids a custom lint plugin or
  dependency-analysis tool for this rule.
- `no-explicit-any` is an error on the cleaned package and library paths; the
  vendored panel outside its mode filter and remaining core migration code keep
  warnings. There is no global warning ratchet. Keep the distinction between
  maintained adapter code and the upstream fork when updating dependencies.

### Identity-sensitive packages

bpmn-js, diagram-js, bpmn-moddle, moddle, the properties panels, element
templates and create-append-anything must each resolve to exactly one version: a
stale transitive range once nested a second bpmn-js under camunda-bpmn-js, so
Implement ran a different bpmn-js than View/Design.

- The [Yarn constraint](../../yarn.config.cjs) fails when such a package resolves
  to more than one version, and checks aligned dependency pins between published
  packages and in-repo consumers (peer dependencies excluded; conflicting shared
  pins fail instead of choosing one silently). CI also runs `yarn dedupe --check`.
  Dedupe only moves ranges up to the highest locked version, so the constraint
  still catches what dedupe cannot fix: an exact workspace pin older than a version
  a new transitive range resolved to (bump the pin), and ranges that do not
  overlap (add a root resolution). Immutable CI installs catch lockfile drift.
- As a second line of defence, every bundle that ships the BPMN or DMN modeler (both
  modeler webviews, the Orca editors and the BPMN package) spreads
  `modelerBundlePreset` from the root [`vite.shared.ts`](../../vite.shared.ts): one
  dedupe list of the set, the panel's `jsx-dev-runtime` alias and the preact JSX
  transform. The transform uses Vite 8's `oxc` option, because Vite types the
  `esbuild` option from esbuild, an optional peer the focused CI installs lack. The
  file is in the trigger paths of those bundles' CI targets.
- Dependabot never dedupes, so the
  [dedupe workflow](../../.github/workflows/dependabot-dedupe.yml) commits
  `yarn dedupe` onto its npm PRs with the release GitHub App (whose private key is
  therefore also a Dependabot secret); it skips the link step so no lifecycle
  script of a bumped package runs next to the write token. [Dependabot](../../.github/dependabot.yml)
  groups the bpmn-io stack across all update types so exact pins move with their
  dependents; a major there holds back the stack's minors until it lands or is
  closed.
- Published packages keep **exact pins** even where an upstream regular dependency
  declares the same package with a caret range (bpmn-js for `diagram-js` and
  `bpmn-moddle`, `@bpmn-io/diagram-js-ui` for `preact`, dmn-js for `diagram-js`).
  Yarn Berry resolves each descriptor to its highest match, so a consumer's fresh
  Yarn install nests a second copy whenever upstream has released past our pin; npm
  and pnpm reuse the pinned version. The package READMEs give Yarn consumers root
  `resolutions` at our pins, and grouped Dependabot updates bound the lag. Caret
  ranges would break the exact-pin rule, an exact peer dependency would not help
  (the upstream caret descriptor still resolves on its own), and bundling would
  break plugin interoperability. Moving the monorepo to another package manager
  does not change a consumer's resolver (pnpm is evaluated on other grounds in
  #1780).
- `@miragon/bpmn-modeler` declares `tiny-svg` and `@lezer/lr` directly to cover
  upstream undeclared imports; remove them only when upstream declares or stops
  using them. Hoisted installs hide such gaps, and strict Yarn PnP compatibility is
  not established by a hoisted build.

### TypeScript compilers

Use TypeScript 7 for the `tsc` CLI through the exact alias
`@typescript/native: npm:typescript@<version>`, and keep the JavaScript compiler
API available through `typescript: npm:@typescript/typescript6@<version>` for
ESLint, `ts-loader`, declaration generation, the architecture engine and package
verification scripts. TypeScript 7 cannot replace that API yet; use Microsoft's
[side-by-side setup](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0)
instead of rewriting those tools.

- Declare both aliases in every workspace that uses TypeScript so focused installs
  keep the CLI and the API independent of the root workspace.
- Keep the isolated packed-consumer check on TypeScript 6 to verify compatibility
  with existing consumers.
- Point API Extractor at the directory `ts.getDefaultLibFilePath` reports, since
  the compatibility wrapper holds no standard-library declarations.
- Root `lint` and `build` and the BPMN package's
  [packed-consumer smoke check](../../packages/bpmn-modeler/scripts/smoke-packed-consumer.mjs)
  exercise both compiler paths. Remove the compatibility alias only when all API
  consumers support the native compiler. Until then two TypeScript implementations
  stay and both CLI compilation and API-based tooling need checking on upgrade.
