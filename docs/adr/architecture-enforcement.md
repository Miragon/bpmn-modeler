# Architecture enforcement

- Status: accepted
- Last reviewed: 2026-11-23

## Context

Architecture erodes when the code drifts from the intended design: a rule written
in two places, decisions outside pure code, hosts that do more than render,
messages nobody handles. Coding agents write most changes, so no single control is
enough; the repository combines guidance, deterministic checks and a model's
review.

## Contents

- [Architecture erosion](#architecture-erosion)
- [Architecture tests](#architecture-tests)
- [Fitness function report](#fitness-function-report)
- [Fitness functions](#fitness-functions)
- [Architecture review](#architecture-review)

## Decision

### Architecture erosion

Three parts, named after Böckeler's "Harness engineering for coding agent users":

1. **Rules for agents** (a guide): where code goes and how a rule is named, in the
   skills under `.agents/skills/`, read before the change. Agents do not always
   follow them; the fitness functions rely on them and say which skill rule they
   check.
2. **Fitness functions** (computational sensors): deterministic checks of the
   result, either blocking ([architecture tests](#architecture-tests)) or reported
   ([fitness function report](#fitness-function-report)).
3. **The [architecture review](#architecture-review)** (an inferential sensor): a
   model's judgement of a branch, reading the report and what no function sees.

**When a fitness function blocks.** Only when it is static and never fires on
correct code: the architecture specs (import direction, role folders, cycles,
stability, the webview command scan), the ESLint rules (empty function in an
adapter, guarded value compared outside its home), the command coverage tables and
the type check. A blocking function misses code outside its scope; a miss is a
reason to report that code, not to stop blocking what it catches. Everything else,
each dynamic function and each static one that can fire on correct code (a size
limit, host text), is reported and never fails a build. A gate on a heuristic needs
an exception list, and that list is work in every PR (#2094 measured 50 of 200 PRs
editing one).

### Architecture tests

Every `architecture.spec.ts` reads its sources through one engine,
[`tools/architecture-testing`](../../tools/architecture-testing/src/index.ts). It
reads imports from the TypeScript syntax tree (so comments, JSDoc `import()` and
strings never count), resolves a relative import through a fixed suffix list and a
package import to a workspace by package name, and needs no `node_modules`. A rule
that needs types, not syntax, gets a type-checked `ts.Program`
(`readTypeProgram`); it throws when a named file or base class is missing, so a
moved declaration cannot make a rule match nothing and pass. The engine lives under
`tools/` because it is dev-only. A workspace's own spec keeps only rules specific to
it (the core's contexts and domain imports, the merge library's stages, the diff and types
libraries' folders).

- [`tools/repo-checks`](../../tools/repo-checks/src/architecture.spec.ts) holds the
  repo-wide rules for every root workspace with a `src/`: no import cycle inside a
  workspace (type-only imports count), every relative import resolves, no cycle
  between workspaces, no workspace depends on a less stable one (instability
  `I = Ce / (Ca + Ce)`, compared on integers), and the
  [role-folder rules](role-folders.md) of each workspace's declared kind. It also
  reads every `port/` file of a hexagonal workspace and fails on any runtime value
  (rule 10). That guard is no import rule, so it keeps its own exception list. Every
  `domain/` file is read for an async function or an `await` (rule 11).
- **Two exception regimes.** Cycles take no exceptions; a cycle is fixed. Role,
  layer and stability rules take `KnownException` entries that name the issue
  removing them; a stale or unnamed entry fails the gate, so the lists only shrink.
  A rule scoped to a folder or file set fails when the scope matches nothing
  (`requireMatches`), so a renamed folder cannot pass vacuously.
- ESLint bans an empty function in an adapter outside specs (#2053): an adapter
  stubbed that way passes every spec that never calls it, so an intended no-op says
  why in a comment instead.

**Guarded values.** A domain value that describes the world keeps its rules in one
home module. The typed ESLint rule `miragon/no-guarded-value-comparison`
([source](../../tools/repo-checks/eslint/noGuardedValueComparison.cjs)) reports
`===`, `!==`, `==`, `!=` and `case` comparisons of such a value with a string
literal outside its home. Each registry entry in `eslint.config.cjs` names the type,
its module, its homes (a capability table in `libs/modeler-types`, or a
`Record<Type, …>` lookup where the knowledge lives) and an error message naming the
fix; a lookup keyed by the union makes the compiler name a missing member, so a new
member is decided in every table before it builds.

- *Typed, not name-based:* it reads the type checker through typescript-eslint's
  parser services, so it sees the value under any name (a local, a parameter, a type
  parameter resolved to its constraint). A union whose literals all belong to a
  registered type counts as that type (`ModelerMode` is guarded as `SurfaceMode`),
  using the declared type, not the narrowed one, unless the declared type is no
  string-literal union. A raw `string` is invisible until a guard (`isEngine`) or
  parse (`parseEditableMode`) turns it into the type: parse, don't validate.
- *Opt-in:* discriminated unions a domain function returns are narrowed by design
  and stay unregistered. A type joins when review or the change-coupling report
  shows a decision on it in two places.
- *Never vacuous:* the registry is resolved against the program on every run; a
  missing module or export, or a type that is no string-literal union, throws.
- *Exceptions* are an `eslint-disable-next-line` whose description reads
  `-- #<issue>: <reason>`; [`guardedValueComparison.spec.ts`](../../tools/repo-checks/src/guardedValueComparison.spec.ts)
  fails on one without, and unused directives fail. None exists today.
- *Known misses:* `["c7"].includes(engine)`, `Set.has`, a comparison on a `string`,
  a value used as data, a wider union compared before narrowing, Kotlin. *False
  alarms* (an unrelated type whose literals all belong to a registered one) take the
  exception form; the rule blocks anyway because value-set matching is what found 4
  of the 11 `SurfaceMode` decisions.

**Alternatives rejected.** *archunit* ran the VS Code spec before and needed a
Vitest matcher shim, a graph warm-up and regexes for specifiers it did not expose,
with 17 lockfile entries. *dependency-cruiser* catches nothing the engine misses
here (resolution is a suffix list plus a name lookup), cannot name an issue in its
baseline, and adds 12 packages; revisit it when a rule needs reach through npm
packages or `exports` maps. *Sheriff* would repeat the spec rules or move them out
of Vitest and lose issue-named exceptions. A *name-based `no-restricted-syntax`*
selector misses every alias (`const e = target.engine`).

### Fitness function report

A reported fitness function plugs into
[`tools/repo-checks/src/fitness`](../../tools/repo-checks/src/fitness/composition/fitnessFunctions.ts)
and never fails a build. `corepack yarn fitness` prints the report of the current
checkout against `git merge-base HEAD origin/main` as Markdown, or JSON with
`--format json` for the [architecture review](#architecture-review). It exits
non-zero only on broken input: a ref that names no commit, no merge base (a shallow
clone), a corrupt snapshot, or a function that throws or returns a malformed
finding. A function that cannot measure an old tree (`--repo` on a worktree of an
old commit) throws `InsufficientHistory` and is reported as not measurable there.

**On a pull request.** `.github/workflows/fitness-report.yml` runs on every
`pull_request` (no branch filter, so stacked PRs get it). It is no required check
and not in `build.yml`'s `ci.needs`.

- It measures GitHub's test merge of the head into the base. The history functions
  read the base's window with the branch's change against the merge base in front as
  one record, so the PR counts as one change, as after its squash, in CI and locally
  alike, and no base commit leaves the window. Reading it from the head counted each
  branch commit and let rows appear on files the branch did not touch. A conflicting
  PR has no test merge and no run.
- On a stacked PR the window ends where the merge base meets the default branch
  (`--default-branch`, `origin/main`, which the workflow's full clone holds), and the
  base branch counts as one record behind the branch's: its unsquashed commits, one
  PR each, pushed `main` commits out and brought rows that left on the retarget
  (#2742). Cost: a stack of several PRs counts as one change where `main` gets one
  squash each, so a row can be missing or extra until the retarget.
- A function may declare what the comment shows instead of its new and resolved rows
  (`changesView`, #2371); the full report and the JSON keep every row.
  `size-and-complexity` lists only the existing files that grew since the merge base,
  and a PR that only adds or deletes files counts as no change: in the first trial
  most of its new rows were such files and none led to a change. Of the grown files it
  lists those that grew by at least 11 code lines, whose highest complexity rose or
  whose code lines rose in each of the last two steps of their printed trend (#2745);
  the rest are counted in one line and alone count as no change too. The threshold is
  the function's (`growthThreshold` on a declared value), so the shared renderer names
  no value. `change-coupling`, `host-text`, `missed-partner` and `mutation-score` are
  full-report-only and never count as a change: a mutation score comes from a stored
  run, so it landed on whichever PR came next; the missed-partner warnings left on PRs
  were mostly judged false or not judged; change-coupling and host-text as decided
  below.
- The job summary carries every row; the PR comment is a copy capped under GitHub's
  65,536 characters: every function gets the same row limit, new rows before
  resolved, and no table or `<details>` is cut. Without any change and without an
  earlier comment nothing is posted.
- **Permissions.** The `report` job runs the PR's code (which can change
  `tools/repo-checks`) with `contents: read` only and uploads the summary and the
  comment as an artifact. The `comment` job has only `pull-requests: write`,
  checks nothing out and runs no PR code; because the artifact is still that code's
  output, it runs only for a head in this repository and not for Dependabot (whose
  install runs a bumped package's lifecycle scripts), and a fork's token cannot
  write. `pull_request_target` is not used.

**What a function declares** (the contract). Its id, version and categories, what it
measures, the skill rule it relies on, what it misses and reports wrongly, and its
evidence (published work or a trial on this repository); `defineFitnessFunction`
makes a missing field a type error. The report prints every field, so limits travel
with the findings instead of living in a document that drifts. The `evidence` list
sits in a data module beside the definition (`<name>Evidence.ts`), so a trial grows
that module and not the definition, which size-and-complexity would otherwise report
as grown on every trial (#2681); JSON was rejected because it loses the type check.
The rule a function relies on lands in a skill in the same PR and names the
function's id; a static spec checks both and that ids are unique. A function may
declare finding groups and numeric values (`codeLines`, `complexity`) that feed the
trend.

**Identity and delta.** A finding has `path:line`, a message and a `key` the
function builds from what the finding is about (paths, a symbol, a value), never
the line. The delta matches keys as a multiset: per key, as many head findings are
existing as the base held, the rest are new, the base's leftovers resolved. An old
finding stays visible as existing, so no function keeps an allowlist. The report
follows git renames since the merge base (`git diff -M -l0`), matching a head
finding by the key it had at the base; not followed are renames git does not pair,
keys that name a folder and text moved into another file.

**Base findings and trend.** The base is the stored snapshot of the merge base when
it holds the same `id` and `version`; otherwise today's code of the function runs on
a temporary `git worktree --detach` of the merge base (deterministic functions give
the same result and a version bump stays consistent). The trend of a function that
declares values is read from the stored snapshots of the first-parent chain from
where the merge base meets the default branch, never recomputed.

**Snapshot store.** The orphan branch `fitness-history` holds one
`snapshots/<sha>.json` per first-parent `main` commit and one `mutation/<run id>.json`
per stored mutation run. `fitness-history.yml` and the mutation workflow write
through the `store-fitness-history` composite action, which commits through the Git
Data API with `GITHUB_TOKEN`, so GitHub signs the commits and the ref moves by
fast-forward only (a losing writer rebuilds its tree, files are keyed so none
overwrites another's). The report reads `origin/fitness-history` offline as last
fetched and uses only an entry of the function's version; the push job backfills
missing `id@version` entries, newest first, so a version bump refills its series
within a few pushes. A function that throws `InsufficientHistory` is stored as
unmeasurable and its series ends there. Workflow artifacts were rejected as the store
(they expire and need a token to read); recomputing on demand cannot produce a series
git cannot recompute, such as a mutation score. The data branch is one more ref to
keep, and only convention keeps people from pushing to it.

`tools/repo-checks/bin/fitness.mjs` loads the TypeScript entry with Vite's
`runnerImport` and the workspace's aliases (Node's type stripping cannot resolve the
engine's extensionless imports); a spec boots the bin because `runnerImport` is
experimental, and `vite build --ssr` into a cache directory is the fallback.

### Fitness functions

Each function declares its own limits in the report (`measures`, `misses`,
`reportsWrongly`, `evidence`); this table records what it is for and the decisions
that are not visible there. Source lives in `tools/repo-checks/src/<id>/`.

| Function | Reports | Decisions |
| --- | --- | --- |
| `change-coupling` (#2094) | Pairs of files that keep changing in the same PRs with no import between them: the signal for a rule kept in two places | Window is a commit count (924 first-parent commits up to where the merge base meets the default branch), not a date, because older dates were rewritten; a stacked PR's base branch and the branch each count as one change in front of it. Mechanical commits and commits over 30 read files are skipped. Thresholds are code-maat's defaults (5 shared changes, degree 30 %). Linked pairs are not reported; pairs explained by a shared import go in a collapsed group. Files are read by extension and declaration, not by name: every `.json` under `src/` (a contract such as the bridge's `protocol.json` was invisible before), and generated files are skipped by git's `linguist-generated` mark, which GitHub honours too; a generator's header text was rejected as a convention a generator may word differently |
| `missed-partner` (#2095) | The branch changes a file without the partner it usually changes with, catching drift in the PR where it happens | Association rule: 5 shared changes, confidence 60 % and lift 4, chosen by `corepack yarn fitness missed-partner replay` (confidence alone is near chance below 60 %; lift guards a partner that changes in most commits). Reuses `change-coupling`'s history reader and read files |
| `convention-coverage` (#2127) | Files outside a role folder, imports that contradict their folder, a port implemented outside `adapter/out/` | Runs the role-folder rules without the blanket exceptions, so it reports migration work; the port-implementation rule is reported, not blocking, because detecting a role by type is what folders were chosen over |
| `repeated-value-sets` (#2050, #2682) | A set of allowed values written in two or more files | A regular expression's alternation of words is a set too, and an optional character or class inside it is expanded, because the copies that drifted in `tools/` were spelled `([mc]?ts\|tsx)` beside `(ts\|tsx\|mts\|cts)`; such a set gets no order note, since no type pin can hold a pattern. A copy pinned with `expectTypeOf<Copy>().toEqualTypeOf<Home>()` counts as one place; Kotlin, JSON, specs and test folders are not read, so a copy whose other half sits in a spec gives no finding. A finding names copies that list the values in another order, and the remedy is to pin the copy to the home's type: deriving a copy from its home fits only where the order is the same concern. A set that drifts shows as *resolved*, not new (a documented false report: a resolved set is a fix only where its copies are gone, import the home or are pinned) |
| `size-and-complexity` (#2057) | Per file, code lines and the highest cyclomatic complexity of a function, with trend | A report, not ESLint `max-lines`/`complexity`: line count is a weak sign of a rule and a limit would fire on a long value table. Complexity mirrors ESLint's classic `complexity` rule. A module that runs no code (imports, exports, types and constants that compute nothing) is not measured, told by its syntax and not by a list of names (#2681): its size is no logic. Type-only files and barrels fall under the same rule |
| `hotspots` (#2057) | Top 20 files by revisions × code lines: a place to look for a rule in the wrong home | A module that runs no code (a table of constants, a type-only file, a barrel) is not ranked, by `size-and-complexity`'s test, so its size cannot crowd logic out of the top 20. The cost: a rule written as a table or in types, in a module that runs no code, is no longer ranked however often it changes. Message classes run code, their constructors, and stay ranked. The product is ours, not Tornhill's script's. A branch, and a stacked PR's base branch, add one revision to each file they changed, as their squashes will |
| `host-text` (#2052, #2167) | User-visible text written in host code, TypeScript and Kotlin | A text is a literal with two words; markup, error and log arguments and the messages of Kotlin's preconditions are not read; Kotlin is read by a small lexer in `tools/architecture-testing` instead of a new parser dependency. Kotlin loggers are derived from their declarations, not from variable names. Two names stay (`log…`, the members of the core's `LoggerPort`, and the global `Error`), each guarded by `hostTextNames.spec.ts`, which fails when one no longer takes a text in host code; deciding them by type took ten times as long and changed no finding. `console` is no logger: host code logs through `LoggerPort`. Host chrome and host-failure messages are correct host text, so it never blocks and has no allowlist (the delta shows what is new) |
| `contract-suites` (#2054) | Each adapter of a core port whose specs run no contract suite of that port | Resolved by types, not names. A class without `implements` is an adapter when production code hands it over where the port is expected (a handover is the composition's own statement; structural assignability to every port would make any `dispose()` holder an adapter). Implementers inside the core count like a host's. Render-only ports (every member returns `void`) and ports with one adapter are set aside in collapsed groups; the types cannot see a value the core reads back through another port, so such a port needs a suite of its own ([testing](testing.md#test-environments)) |
| `mutation-score` (#2057) | Mutation score per domain folder from stored full Stryker runs | No floors; see [testing](testing.md#mutation-testing) |

### Architecture review

The [`architecture-review` skill](../../.agents/skills/architecture-review/SKILL.md)
(#2058) is the inferential sensor. It runs `corepack yarn fitness --format json`
against a branch, a PR, a commit on `main` or a whole tree, reads each function's
findings, trends and declared limits from that output (no second document to
drift), and searches for copies of a rule with `git grep`. It reviews what no
function sees: a rule in another spelling, adapters of one port that disagree,
two derivations of one state, logic in the wrong layer, wiring per host, a new
workspace without its siblings' guards, silently ignored commands. It searches a
touched list, union or enum by two or three of its members to find copies with other
names. For a PR whose head conflicts with its base, as a stacked PR's often does, it
takes the PR's own change from the head's newest merge of the base. A survey takes
one area of the tree per run, and the run names what it did not cover. The reviewer
runs its commands under bash, because zsh and the regex of macOS broke them. Each
finding names `path:line`, evidence, the function or limit that applies and, in a
change review, its origin. A copy the change adds or extends is a finding even when
its original predates the change; a problem the change leaves as it was is listed in
one line without a proposal. It also checks each report row in the code before it reports
or drops it, and proposes narrower rules or `reportsWrongly`/`misses` entries for
what the functions got wrong; a proposal that changes a function's rule bumps its
version and needs a measured trial.

It is not a fitness function: a model's judgement is not deterministic, so it
comments and never blocks. It reliably finds a rule written twice in different
spellings and text built per host, and misses second copies it must discover rather
than follow from the diff, guards a new workspace lacks, and most of a whole tree.
The author triages its findings.

**A fixed walk and a check before each finding** (2026-11-23). Three runs on each of
six merged PRs, with one frozen report, read the same files and reported different
findings, and two judges per finding rejected 2 of 30, one reported by all three
runs. The review now walks each source file in path order through eight closed
questions, lists its answers per file, checks each finding against the code and the
recorded decisions before writing it, and lists a problem that predates the change
without a proposal, so a follow-up PR no longer turns every older problem into an
issue. Replayed, the judges rejected none of 24 findings, but runs agreed no more (one
run found about 61 % of three runs' union, before 63 %): what a run notices in an open
file varies. The cost: a tenth more time per run and four problems found before and
not now. More agreement needs two runs merged, or a recurring finding made a fitness
function or a spec.

**On demand, no CI job** (decided on #2238, 2026-11-12). The review stays a skill run
by hand, on PRs that move rules between layers, add a host feature or add a workspace.
A trial on 16 feature PRs made about 75 findings, eight of them behaviour bugs, and
from the third review on nearly every finding was accepted and fixed. It still gets no
CI pilot: the first two reviews needed a skeptic to filter their findings, runs
differ, so the comment would change from push to push, and a job needs a workflow, an
API secret and possibly a dependency. Recall was not measured.

**What the report adds** (#2231, #2398). Few findings trace to a report row (about 7
of 75 and 9 of 109 in two trials) and none of the behaviour bugs, which came from the
copy search and from comparing a port's adapters and the wiring per host; reviews
repeated without the report found most of theirs again. The report's value lies in
trends, placement leads and feedback on the functions, not in finding erosion.

**A function's place in the PR comment** (decided on #2398, 2026-11-22). A function
keeps its rows in the comment while they lead to fixes in the same PR. A second trial
on 84 PRs judged each function by rules written before it started, with one reading
fixed afterwards: a row counts as acted on when its PR fixed it, not when a PR body
only lists it. `repeated-value-sets` and `contract-suites` stay; `contract-suites`
stays against the written rules, which count its render-only group as false although
two of those rows led to a suite. `change-coupling` and `host-text` moved to the full
report (#2743, #2744): in the trial's window none of their new rows was fixed and all
but one were false, and the review, which reads the full report, keeps them.
`hotspots` no longer ranks a module that runs no code (#2708): at `d55b8732` 13 of
its top 20 ran none. The grown-files list has a threshold (#2745) although by the letter of the trial's rule
it gets none, since five rows below it were fixed in their PR: four of those went
with nothing written about the row. Of the 25 rows fixed after the window the rule
leaves 4 out of the comment, against 8 with three rising steps instead of two.

## Consequences

Reported fitness functions never block a merge, so reviewers and the review agent
read their new findings; the report is as complete as the functions plugged into
it. The review runs by hand, with no CI job. A new workspace falls under the repo-level cycle and stability rules without
registration. The engine depends on the TypeScript 6 JS API, so moving to
TypeScript 7 alone needs another parser ([dependencies](dependencies.md#typescript-compilers)).
Rules move into `domain/` before or together with the feature that needs them, so
services shrink to orchestration.
