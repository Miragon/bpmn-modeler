# BPMN linting

- Status: accepted
- Last reviewed: 2026-11-13

## Context

The BPMN editors lint diagrams with bpmnlint, in the page or on the host. Host linting can load
`bpmnlint-plugin-*` rule packages from the workspace
([#2247](https://github.com/Miragon/bpmn-modeler/issues/2247)). Unlike a
[BPMN plugin](bpmn-plugins.md), a rule package runs in the extension host or the bridge with the
user's rights. It runs only once its [allowance](code-allowance.md) holds and only in a workspace
the host trusts.

## Contents

- [Linting](#linting)
- Workspace rule packages:
  [Unit](#unit), [Gate](#gate), [Updates without a reload](#updates-without-a-reload),
  [Asking only when needed](#asking-only-when-needed),
  [Weaker guarantee than a plugin's](#weaker-guarantee-than-a-plugins),
  [IntelliJ ordering](#intellij-ordering), [Alternatives](#alternatives)

## Decision

### Linting

The root and designer never import the lint stack internally, even dynamically.
Consumers import `/lint` and inject its structural `LintModule` interface:

| Option | Behavior |
| --- | --- |
| Omitted | Off; root modeler emits a one-time migration info message |
| `false` | Off, explicitly and silently |
| `{ module, config? }` | In-page linting |
| `{ module, results: "external" }` | Render host-pushed results, with `startInPageLinting` handback |

`module` is required for both enabled tiers because even external findings need the
renderer/config service; an internal fallback import would make lint bytes reachable in
single-file bundles again. Config is one `BpmnlintConfig` or a `{ design?, implement? }`
map; defaults use the modeling preset (Design omits Camunda deployability rules,
Implement adds the engine layer) and a live mode change re-resolves in-page linting. A
host-provided workspace config applies unchanged in both modes (the per-mode map is a
package option, never a host wire payload). The viewer stays lint-free, and
unresolvable rules are reported through results instead of failing the pass.

Both tiers render through `bpmn-js-bpmnlint`, pinned exactly. The package replaces its
`lint()` and `update()` on the instance instead of forking it: every relint trigger
(import, element change, toggle, host push) goes through one scheduler (a trailing
quiet period as long as the last pass took, 0.3–5 s, then an idle callback) with at most
one pass in flight, so a burst of edits on a large model does not pay one blocking pass
per edit. Only overlays of elements whose issues changed are redrawn, through the
vendor's private helpers behind the typed `lintingInternals` adapter. A `Linter` is
still built per pass because bpmnlint rules keep per-run state in their closures.
Consequence: `onLintResults` arrives after the debounce, not synchronously after an
edit. An
[equivalence spec](../../libs/modeler-core/src/modeler/bpmn/adapter/out/bpmnlint/coreRuleEquivalence.spec.ts)
pins the reports and order of the core rules, so a bpmnlint bump that changes either
fails.

**Host linting.** `NodeBpmnLinter` (VS Code extension host, IntelliJ bridge) runs
workspace code only through `bpmnlint-plugin-*` rule packages the user allowed, behind
the gate in [Workspace rule packages](#gate); a host that wires no
`rulePackages` port lints with the bundled rules only. bpmnlint's own rules and configs
always come from the bundled bpmnlint, because through the workspace its
`NodeResolver` would run the workspace's `bpmnlint` install or, via `requireLocal`,
scripts two folders above the `.bpmnlintrc`. Accepted cost: a workspace that pins
another bpmnlint version gets the bundled version's built-in rules. A string
`moddleExtensions` entry is resolved without running anything and loaded only when it
is a `.json` descriptor. When a host lint blocked a package that left a rule or config
unresolved, the status bar shows `blocked` (it wins over `unresolved` and carries no
install hint: installing would not help, allowing would). A run in a workspace the user did
not trust shows `untrusted`, which carries no install hint either
([host trust](code-allowance.md#host-trust)).

The webview owns lazy `/lint` loading and routes results to either editable surface.
The [lint-free entry check](../../packages/bpmn-modeler/scripts/check-lint-free-entry.mjs)
and source architecture tests guard the import boundary.


### Unit

The gate decides per installed package root: the realpath of the `node_modules/<name>` folder a
require resolved into, taken at the last `node_modules`. A nested copy is its own root for ids,
stamps and eviction, though it shares the allowance with the hoisted copy.

- The config's own package, whose `package.json` names the requested plugin so that bpmnlint
  requires `.`, is the config folder. It needs an allowance like any other root, because the
  repository picks the name.
- Any other root is refused, logged and never offered. The folder an absolute rule reference points
  into, or a `file:` link whose target holds the config folder, would make one allowance cover the
  repository.
- Each root bpmnlint requests needs its own allowance. A dependency that is itself a rule package
  does not ride on the package that declares it, so a config that extends `plugin:a`, which extends
  `plugin:b`, asks about both the first time.
- A rule package has no hash. The closure hash, its size limits and the states `changed` and `gone`
  are gone with the [allowance](code-allowance.md#the-allowance). The gate, the question, the log
  and the Add-ons view name a package as `name@version`, so an update shows without a question.

A host opts in with the optional `rulePackages` group of `BpmnEditorFeature`. Without it the linter
builds no workspace resolver at all. An untrusted linter builds no gate either: it asks the
workspace for nothing and lints with the bundled rules alone, and the status bar shows the
`untrusted` state instead of an install hint.

### Gate

`RulePackageGate` wraps the scoped require that bpmnlint's `NodeResolver` loads packages with. Each
call resolves the request, admits built-in modules and `.json` data without an allowance, maps the
realpath to its root and lets the require run only when the root's allowance holds.

- Otherwise it records the package as blocked, with its name, version and allowance, so the catalog
  can ask without reading anything, and throws `MODULE_NOT_FOUND`. The resolvers turn that into a
  miss: the bundled rule or a no-op.
- A file whose path below the root has a `.git` segment is refused, as no allowance covers it.
- The gate is synchronous, since `require` cannot wait. It uses no module loader hooks: the bridge
  runs on Bun, which does not fire them.
- The lint setup's key holds the config and the sorted rule package rows. An allow, a revoke, the
  migration or a pushed list therefore builds a new setup, and no bundled fallback cached before
  the allow shadows the allowed package.

### Updates without a reload

An update that rewrites a root's `package.json` loads without a reload.

- *Manifest stamp.* A setup records, per admitted root, the stamp of the root's `package.json` and
  of the unresolved lookup path's. `stat` follows the link, so a pnpm update that retargets the link
  stamps differently even when the old `.pnpm` folder survives. The check runs at the start of every
  lint, not at the gate, because a cached setup answers later lints without calling the gate.
  Nothing watches `node_modules`: VS Code's watcher excludes it by default, and the check costs one
  or two stats per root per lint.
- *Eviction.* When a root is admitted under another stamp than it was last loaded under, the gate
  evicts every `require.cache` entry within the `node_modules` the root is installed in (or the root
  itself for the config's own and a linked package). A hoisted dependency lives beside the root, not
  inside it, so evicting only the root would run the new root against the cached old dependency.
  The cost is reloading sibling packages once per update.
- *Current folder.* Node's and Bun's resolution caches are per process and see no retargeted link,
  so a fresh require still answers with the old `.pnpm` folder, gone or not. The gate touches
  neither cache, as Bun has no such internals. It looks the requested name up itself and takes the
  runtime's answer only inside the folder that lookup leads to now; an answer in another root of the
  same package moves to the same path below the current folder. The current folder keeps the add-on
  place `node_modules/<name>`, so the update runs under the same allowance. The gate never runs the
  old path.
- An update that leaves no file where the entry or a rule lay is refused (`movedByUpdate`), and the
  log asks for a window reload or an IDE restart. So is a folder npm installs in place of a `file:`
  link, since Node's realpath cache still maps its path to the linked folder.
- An edit that leaves every stamped `package.json` alone loads only after a reload.

### Asking only when needed

A blocked package is *needed* when a request ended unresolved because of it, and *shadowed* when
the bundle served the request instead (`CompositeResolver` brackets each synchronous request with
the gate). Only needed packages are asked about; a shadowed one is logged once and kept for the
Add-ons view. Otherwise the common Camunda config, which lints on the host because of its string
`moddleExtensions`, would ask about `bpmnlint-plugin-camunda-compat` even where the bundle serves
every entry the config uses, and train users to allow everything.

- Results never wait on the user. After the host lint finishes, the follow-up asks without awaiting
  the answer, one question per allowance key, once the start-up migration settled
  ([asking](code-allowance.md#asking)).
- Relints follow the approval store, not the question. An allow relints every open editor whose
  last host lint was blocked on some package. A revoke relints every editor linted on the host, so
  the withdrawal reaches the loaded code wherever it ran.

### Weaker guarantee than a plugin's

A bpmn-js plugin runs from a content-addressed copy of the bytes read for the request, so a file
swapped after the copy cannot run. A rule package runs in place and unhashed: that is the rule, not
a residual. Accepted:

- Phantom dependencies (undeclared, found through hoisting) and requires a package makes later from
  inside its own code are Node's and not gated; they run under the package's allowance.
- Code already loaded stays loaded until the host restarts, so removing an allowance takes full
  effect only then. The revoke relints, so the gate refuses the package from that lint on, and the
  Add-ons view says that the code stays loaded.
- Admission depends on order within a setup: a package resolved before the root that would admit it
  is blocked, and its bundled fallback stays cached until the setup is rebuilt.

The [gate specs](../../libs/modeler-core/src/modeler/bpmn/adapter/out/bpmnlint/RulePackageGate.spec.ts),
the [linter specs](../../libs/modeler-core/src/modeler/bpmn/adapter/out/bpmnlint/NodeBpmnLinter.spec.ts)
on a temporary folder with a git worktree layout, the
[installed packages contract](../../libs/modeler-core/src/testing/installedPackagesContract.ts) and
the Bun smoke (`apps/modeler-bridge/scripts/rule-package-gate-smoke.ts`) pin these rules.

### IntelliJ ordering

The compiled bridge binary lacks `--compile-autoload-package-json`, so a package whose entry comes
from `main` or `exports` does not resolve in it, and most rule packages with dependencies fall back
to the bundle or are skipped. Adding the flag widens what the bridge runs from the workspace, so it
lands only after the gate ([#2273](https://github.com/Miragon/bpmn-modeler/issues/2273)).

### Alternatives

- **Host trust alone**: off in the standalone app, and granted once per folder or project.
- **Asking about every blocked package**: asks about packages the bundle serves.
- **Running a content-addressed copy of the package and its dependencies**, as for bpmn-js plugins.
  It is the follow-up if the in-place window must close. Rejected for now because it changes what
  works today: absolute rule references would resolve from the copy, phantom dependencies would
  fail closed with no way out for the user, and an asynchronous copy inside resolution would break
  the synchronous per-request bracketing that asking only when needed relies on.
