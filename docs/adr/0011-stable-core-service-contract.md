# 0011 — Freeze a typed contract for the core bpmn-js services

- Status: accepted (#1408)
- Date: 2026-08-31
- Category: bpmn-webview

Extends [ADR 0007](0007-public-modeler-api.md), which kept `getService` public
but declared everything reached through it unstable.

## Context

`getService(name)` is the DI escape hatch on the public `@miragon/bpmn-modeler`
handle (v0.2.0). Its *signature* is frozen — it is part of `StableModelerSurface`
— but ADR 0007 and its TSDoc declare every service reached through it unstable
across minors.

In practice host adapters (live-sync bindings, canvas overlays, toolbar actions)
depend on exactly seven standard diagram-js/bpmn-js services — `canvas`,
`commandStack`, `elementRegistry`, `eventBus`, `modeling`, `overlays`,
`selection`. These are not modeler-internal names that might be renamed on a
whim; they are the long-stable core of the upstream libraries. Leaving them
under the blanket "unstable" caveat gives real integrations no semver guarantee
for the surface they actually use. Issue #1408 asks to freeze that short list.
The future `createViewer()` handle (#1405) needs the same contract as a
`Pick`-able subset.

## Decision

### A `CoreModelerServices` name→type map

Export an interface mapping each of the seven service names to its upstream
vendor type (imported from `diagram-js`/`bpmn-js` `.d.ts`, the same precedent as
`ImportXMLResult` on the public surface). Modelled as a name→type map — not a
union or a bag of accessors — so a future viewer handle can `Pick` exactly the
subset it exposes.

### A keyed `getService` overload

`getService` gains a keyed overload, placed **first** so map keys resolve typed
automatically:

```ts
getService<K extends keyof CoreModelerServices>(name: K): CoreModelerServices[K];
getService<T = unknown>(name: string): T;
```

`getService("canvas")` now returns `Canvas` with no explicit type argument,
while `getService<Foo>("custom")` and unknown names fall through to the generic
escape hatch unchanged. `StableModelerSurface` needs no edit — its `Pick`
carries both overloads.

### Semver split

The seven `CoreModelerServices` names are semver-covered: the name resolves and
the returned value keeps its upstream-documented shape across minor versions.
Every *other* name stays the unstable escape hatch of ADR 0007 — kept public so
advanced integrations are not blocked, but changeable across minors.

### No raw-instance accessor

The map is a *type* contract over the existing `getService` call, not a new
`services` object exposing raw instances. Growing the surface with concrete
accessors would leak more of bpmn-js than the issue wants; encapsulation stays
intact.

## Alternatives considered

- **A `services` accessor object** (`handle.services.canvas`). Rejected: the
  issue explicitly does not want the raw-instance surface to grow, and it would
  duplicate `getService` rather than type it.
- **A union of literal names without types.** Rejected: it would freeze the
  names but still hand callers `unknown`, missing half the value — the
  documented *shapes* are the point.
- **Leaving all of `getService` unstable.** Rejected: it is the status quo #1408
  set out to fix; the seven names are already de-facto stable upstream.

## Consequences

- Host adapters get a compile-time-typed, semver-covered contract for the
  services they actually use, with no runtime change — the implementation
  signature stays wide (`get(name)`).
- The unused ambient shim `src/types/diagram-js.d.ts` (a hand-rolled `EventBus`
  that would shadow the real vendor `.d.ts`) is deleted so `eventBus` resolves
  to the genuine type.
- **No runtime enforcement spec.** The intent was a jsdom test booting a real
  modeler and asserting each name resolves, guarding against upstream renames.
  The camunda-bpmn-js modeler does not boot under vitest's jsdom — `diagram-js-minimap`'s
  prebundled CJS `require` of diagram-js's ESM `IdGenerator` default export throws
  `IdGenerator is not a constructor`, and inlining does not fix the interop. The
  contract is therefore enforced at compile time only (`publicApi.spec.ts` keyed
  lookups + the roll-up `.d.ts` gate); an upstream *rename* would slip past the
  types until an integration hits it. Revisit if the modeler becomes bootable
  under the test env.
- The contract is `Pick`-able, so the #1405 viewer handle can freeze its own
  subset from the same map.
