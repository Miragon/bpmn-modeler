# 0035 — Isolate private upstream access behind typed adapters with pinned shape tests

- Status: accepted
- Date: 2026-09-14

## Context

Several places in `packages/bpmn-modeler` and the inlined `libs/*` reach into
private, undocumented upstream state:

- `libs/bpmn-clipboard` read `directEditing._textbox.content`
  (diagram-js-direct-editing, which ships no `.d.ts`);
- `libs/bpmn-diff` read the `_added` / `_removed` / `_changed` / `_layoutChanged`
  keys of a `bpmn-js-differ` result;
- `libs/append-menu` called `popupMenu._getContext(target, providerId)`
  (a private diagram-js method);
- `libs/properties-panel/src/modeFilter` carries hand-copied
  `bpmn-js-properties-panel` group/entry ids.

Each is a silent-breakage risk: a renovate bump can change or remove any of them
and nothing fails loudly — the clipboard just stops routing, the diff quietly
returns nothing. These reaches were also untyped (`any` at the DI seams), so the
compiler could not even flag a shape mismatch. A scoped ESLint run reported
**605** `@typescript-eslint/no-explicit-any` warnings, concentrated at those
seams and in the vendored properties-panel fork, and CI ignored them.

## Decision

Confine every private-upstream reach to a small **typed adapter module** that
asserts the runtime shape and throws a descriptive `Error` naming the file and
the pinned upstream version when the shape is wrong:

- `libs/bpmn-clipboard/src/directEditingInternals.ts` — `getDirectEditingContent`;
- `libs/bpmn-diff/src/differResult.ts` — `runDiff` / `assertDiffResultShape` /
  `categoryIds` (callers speak public category names, never the `_`-keys);
- `libs/append-menu/src/popupMenuInternals.ts` — `getPopupMenuContext`;
- `libs/properties-panel/src/modeFilter/engineGroupData.ts` already *was* the
  group-id adapter; it gains a pinned test rather than a new module.

Each adapter is pinned by a test against the **installed** upstream package, so a
bump that moves the shape fails in CI:

- `packages/bpmn-modeler/src/upstreamShape.browser.spec.ts` (real Chromium)
  pins `directEditing._textbox.content` and `popupMenu._getContext`;
- `libs/bpmn-diff/src/differResult.spec.ts` pins the differ result keys;
- `packages/bpmn-modeler/src/engineGroupData.upstream.browser.spec.ts` pins the
  engine provider group/entry ids against `bpmn-js-properties-panel`, and
  `libs/properties-panel/src/modeFilter/engineGroupData.upstream.spec.ts` pins
  the `ElementTemplates__` prefix against `bpmn-js-element-templates`.

The engine-group pin runs in the Chromium project because the jsdom project
cannot load `bpmn-js` — its extensionless ESM imports break the web resolver
(only the filesystem-only `ElementTemplates__` pin stays jsdom-side).

A text-scan gate in `packages/bpmn-modeler/src/architecture.spec.ts` forbids any
new non-`this` `_`-access (or bracket access to the known-private names) outside
the three adapter modules, across the package and every `libs/*/src` except the
vendored properties-panel fork.

The internal DI accessors are typed: `CoreModelerServices` moves to
`src/coreServices.ts` with a `CoreServiceAccessor` alias the surface managers
(`selection`/`viewport`/`rootElement`) take instead of `<any>` casts; the
remaining internal `.get<any>` seams get real upstream generics for core
services and minimal local structural interfaces for non-core ones.

`@typescript-eslint/no-explicit-any` is escalated to `error` on the cleaned
paths via a path-scoped block in `eslint.config.cjs`. The vendored
properties-panel fork (`libs/properties-panel/src` outside `modeFilter/`) stays
at `warn`: it uses `this._x` on its own ported classes pervasively and is
maintained as a fork, not authored here.

## Consequences

- A dependency bump that changes any pinned private shape fails loudly against a
  located test instead of silently degrading a feature at runtime. The label
  clipboard's failure mode changes deliberately: a shape mismatch now degrades
  to `console.error` + no clipboard (the CI shape test supplies the loudness)
  rather than a silent no-op.
- New private reaches are blocked at review time by the architecture gate.
- The `no-explicit-any` count drops from **605** to **380**, and is now
  `error`-enforced on every cleaned path. The 380 that remain are all outside the
  escalated scope and stay at `warn`: the vendored properties-panel fork (375)
  and `libs/modeler-core/src/migration` (5). No repo-wide `--max-warnings`
  ratchet was added — it would make unrelated warnings CI-fatal everywhere; a
  scoped ratchet is a possible follow-up.

## Rejected alternatives

- **didi / diagram-js `ServiceMap` module augmentation** to type `injector.get`
  globally. It types the *lookup* but not the private *members* the adapters
  reach, gives every consumer an over-broad surface, and couples our types to
  didi internals. Local structural slivers keep each seam honest about exactly
  what it uses.
- **A custom ESLint rule or dependency-cruiser** to ban private access. A
  text-scan gate in the existing `architecture.spec.ts` (which already scans
  `libs/`) needs no new dependency, no rule-authoring surface, and lives beside
  the other import-direction gates.

The broader C7/C8 dependency-bump matrix that these pins protect is tracked
separately in issue #1505.
