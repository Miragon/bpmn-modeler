# 0013 — Injectable lint stack via the `@miragon/bpmn-modeler/lint` subpath

- Status: accepted (#1407)
- Date: 2026-09-01
- Category: bpmn-webview

Roadmap step 5 of the bpm-iq embeddability epic (#1409). The first step toward a
subpath-injection pattern that the viewer (#1405, `/viewer`) and design (#1196,
`/design`) surfaces build on.

## Context

The package used to reach its bundled lint stack through an internal dynamic
`import("./bpmnlint")` in `modeler.ts`, so the whole stack
(`bpmn-js-bpmnlint`, `bpmnlint`, `@miragon/bpmnlint-plugin-rules`, and its CSS)
code-split into a lazily-fetched chunk. That kept it off the critical path for
multi-file consumers, and [ADR 0007](0007-public-modeler-api.md) made linting an
opinionated `[B]` built-in — **on by default**, `linting: false` to opt out.

Single-file hosts break that. bpm-iq embeds the modeler through
`vite-plugin-singlefile`, which sets Rollup's `inlineDynamicImports`: every
dynamic import is inlined into the one output bundle. A **reachable** dynamic
import can never be tree-shaken — the bundler cannot prove `linting: false` at
build time — so the entire lint stack landed in a `linting: false` consumer's
bundle regardless. The epic's acceptance criterion is the opposite: a
`linting: false` consumer must have **no lint import in its module graph at all,
in every bundling mode.**

The epic's own wording said "the internal dynamic import stays the default." The
maintainer superseded that: keeping any internal import — even guarded, even as a
fallback — yields zero benefit for single-file hosts, because reachability, not
the guard, is what defeats tree-shaking.

## Decision

**Injection-only, breaking.** Remove the internal dynamic import entirely. The
package never imports its lint stack; a host that wants linting imports the new
`@miragon/bpmn-modeler/lint` subpath and hands the namespace in as
`linting.module`.

- **New tier ladder** (`LintingOptions`), with `module` **required** on both
  object variants:

  | `linting` | lint bytes in consumer bundle | behaviour |
  | --- | --- | --- |
  | *(omitted)* | none | off + one-time `console.info` migration nudge |
  | `false` | none | off, silent, explicit |
  | `{ module, config? }` | via host's own `/lint` import | in-page linting |
  | `{ module, results: "external" }` | via host's own `/lint` import | paints host-pushed results; `startInPageLinting` handback works |

  `module` is required even on the external tier because that tier still needs
  `LintConfigService` to paint. A missed migration is therefore a **compile-time**
  error, not a silent runtime downgrade.

- **Omitted `linting` now means off** (was: on with the bundled default). This
  amends [ADR 0007](0007-public-modeler-api.md)'s "`[B]` on-by-default" for
  linting specifically — with the stack no longer bundled, on-by-default would
  require importing it unconditionally, defeating the whole change. A one-time
  `console.info` nudge eases the migration.

- **`LintingOptions.module` is a structural `LintModule` interface**
  (`{ createLintModule(tier, callbacks): unknown }`), not
  `typeof import("./bpmnlint")`. api-extractor rollups of relative `import()`
  types are fragile; a type-level conformance check in `publicApi.spec.ts`
  (`typeof import("./bpmnlint") extends LintModule`) keeps the interface and the
  implementation in sync without the rollup hazard.

- **The dynamic import moves into `apps/bpmn-webview/src/bootstrap.ts`**, which is
  in this PR. The webview imports `/lint` and injects it; the chunk stays a
  separate lazily-fetched file, byte-identical to before — now owned by the host,
  not the package. The epic's hard constraint (no vscode/intellij host change)
  holds: both consume the built webview bundle, which is unchanged in shape.

- **Lint CSS stays unconditional.** `cssCodeSplit: false` already folds the lint
  chrome CSS into `dist/bpmn-modeler.css` (`@miragon/bpmn-modeler/styles.css`),
  which every consumer loads. Injecting the module brings no extra stylesheet
  wiring; the CSS bytes are unchanged.

### Mechanised gates

- **`scripts/check-lint-free-entry.mjs`** (new, wired into the package `build`):
  walks the static import graph from `dist/index.js` and fails if any statically
  reachable chunk names `bpmnlint`. This mechanises the acceptance criterion.
- **`src/architecture.spec.ts`**: outside `src/bpmnlint/`, no *value* import
  (static or dynamic) of `./bpmnlint`, `bpmn-js-bpmnlint`, or `bpmnlint`;
  `import type` stays allowed.
- **`scripts/check-dts.mjs`** and the CI dist-artefact list gain the new
  `lint.d.ts` / `lint.js` entry; `scripts/smoke-consumer.mjs` resolves the
  `./lint` subpath.

## Alternatives considered

- **Keep the internal import as a fallback when `module` is omitted.** Rejected:
  a reachable import is exactly what `inlineDynamicImports` cannot shake, so it
  delivers zero benefit for the single-file hosts that motivated the change.
- **Optional `module` with a runtime fallback to the bundled stack.** Rejected
  for the same reason, and it would reintroduce the bundled dependency.
- **Runtime warning instead of a compile error for a missing `module`.**
  Rejected: silent degradation of an opinionated built-in is worse than a
  type error the migrator sees immediately.
- **Keep on-by-default by importing the stack unconditionally.** Rejected: it is
  the very coupling this change removes.

## Consequences

- **Breaking API change**, released as `feat(bpmn-modeler)!` while the package is
  pre-1.0 (0.2.0). Consumers that linted implicitly must now inject a `module`.
- Establishes the **subpath-injection precedent** for #1405 (`/viewer`) and
  #1196 (`/design`).
- `apps/demo-webapp` (`bpmn/main.ts`, `bpmn/dual.ts`) now injects the `/lint`
  module to keep its host-less in-page linting.
- Deviates from epic #1409's literal "internal dynamic import stays the default"
  wording, per the maintainer decision recorded above.
