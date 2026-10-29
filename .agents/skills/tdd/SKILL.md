---
name: tdd
description: Test-first workflow for new features, changed business rules and bug fixes in this repository. Use before writing production code for a feature or a fix: write the failing spec, give the rule one home in the domain model, then make it pass.
---

# Test-first development

A rule written in more than one place drifts, and the drift becomes a bug.
Writing the spec first gives each rule one home and one pure test before any
code depends on it.

## When it applies

- A new feature, or a changed decision: a business rule, a state transition,
  a validation, a classification, what a host shows or stores.
- Every bug fix. The first commit reproduces the bug.

Exempt: bpmn-js/diagram-js wiring, DOM chrome and host-API glue (VS Code API,
JCEF, Kotlin UI). Cover those afterwards with the browser specs
(`*.browser.spec.ts`), the bridge black-box harness or the VS Code smoke test.
Pull any decision out of such code first; the decision itself is not exempt.

## 1. Red

1. Find the rule's home (see step 2) and search for copies of the rule
   elsewhere: other services, the other host, Kotlin, the webview. The spec
   targets the one home; the copies go in step 3.
2. Write the spec first. For a bug, reproduce the report in the smallest setup
   that shows it.
3. Run only that spec: `corepack yarn test <path/to/file.spec.ts>`.
4. It must fail on its assertion, for the reason you expect. A missing module,
   an import error or a type error is not red yet: add the empty export or the
   signature and run it again.
5. Keep the failing output for the PR description.
6. For a bug, commit the spec on its own: `test(<scope>): reproduce …`.

## 2. Green: put the rule in the domain model

- Pure code in `libs/modeler-core/src/<feature>/domain/`: no ports, fakes,
  timers, DOM, `vscode`, Node host modules or `@miragon/bpmn-modeler-shared`
  imports. The core's `architecture.spec.ts` enforces the layer direction.
- Aggregates and value objects own their invariants: a factory that validates,
  no public mutation, derived state computed instead of stored.
- Return decisions as values, as discriminated unions such as
  `{ kind: "alreadyDeclared" } | { kind: "declared"; manifestText: string }`,
  and let the service act on them. The domain decides; it does not call out.
- Services in `service/` only orchestrate ports around those decisions.
- Rules that browser code and the core both apply live in `libs/modeler-types`
  (pure, protocol-free). Webview-only rules go into a pure reducer module next
  to the bootstrap, not into DOM handlers.
- Write the least code that makes the spec pass.

## Spec style

- Domain specs are table-driven (`it.each`) and assert values. No fakes, no
  `vi.mock`, no timers.
- One orchestration spec per use case through `createTestHost`
  (`libs/modeler-core/src/testing/`). Assert what the fakes hold, not which
  methods were called. No `as never` partial mocks; spy on a fake only to
  inject a failure or a hang.
- Bridge behaviour goes through the black-box harness
  (`apps/modeler-bridge/src/__fixtures__/bridgeHarness.ts`); Kotlin through
  JUnit in `apps/intellij-plugin/src/test/`.
- Name a test after the behaviour ("keeps unsaved edits when …"), not after
  the method.

## 3. Refactor

- Delete every copy of the rule found in step 1 and route its callers through
  the new home.
- Run the owning workspace's `test` (it enforces the coverage floor), its
  `typecheck` and `corepack yarn lint`. Run the bridge specs when a core change
  reaches the bridge, and `./gradlew test` for Kotlin.

## 4. Prove the spec bites

Run Stryker on the domain files you touched (paths relative to
`libs/modeler-core`):

```bash
corepack yarn test:mutation --mutate src/<feature>/domain/<file>.ts
```

Kill each surviving mutant with a spec, or state in the PR why it is
equivalent. Outside `domain/`, break the key line by hand, watch a spec fail,
and revert.

## Pull request

The description shows the red output, the green run and the mutation result.
