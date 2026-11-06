---
name: architecture-review
description: Reviews a branch, a pull request or a past commit for architecture and design erosion. Reads the fitness function report (findings, delta, trends and each function's limits), searches for copies of a rule and judges what no fitness function sees. Use when asked to review a branch or PR for architecture, design, layering, duplicated rules or erosion.
---

# Architecture review

The fitness functions of `corepack yarn fitness` are computational sensors:
deterministic, and blind to what their `misses` name. This review is the
inferential sensor next to them
([ADR](../../../docs/adr/engineering-practices.md#architecture-review)). It is
not deterministic, so it comments and never blocks.

## 1. Measure the tree

| Review | Tree (`<dir>`) | Base (`<rev>`) |
| --- | --- | --- |
| The current branch | `.`, this checkout (omit `--repo`) | `origin/main` (omit `--base`) |
| PR `<n>` | `git fetch origin pull/<n>/head`, then `git worktree add --detach <dir> FETCH_HEAD` | `baseRefOid` of `gh pr view <n> --json baseRefOid` |
| A past commit | `git worktree add --detach <dir> <commit>` | `baseRefOid` of its PR |

```sh
OUT=$(mktemp -d)   # an untracked file in the checkout would count as a change
corepack yarn fitness --format json [--repo <dir>] [--base <rev>] > "$OUT/report.json"
git -C <dir> diff --name-only "$(jq -r .base.commit "$OUT/report.json")" > "$OUT/touched.txt"
```

The report runs this checkout's fitness functions on `<dir>`; `<dir>` needs
no install. It compares with `git merge-base HEAD <rev>`, so `<rev>` need not
be an ancestor. Remove the worktree when done.

## 2. Read the report

The JSON is about 1 MB, mostly `size-and-complexity` rows: filter it with
`jq` (or `node -e`), never read it whole. Read every entry of `functions[]`;
the registry grows, so never assume which functions exist.

- `head.commit`, `head.uncommittedChanges`; `base.commit` is the merge base,
  `base.ref` the `<rev>` given.
- Limits: `categories` (`scope`, `cadence`, `result`), `measures`,
  `reliesOn` (`skill`, `rule`), `misses`, `reportsWrongly` and `evidence`
  (`kind` `published` with `reference`, or `trial` with `commit` and `outcome`).
- `base.source` is `snapshot` or `checkout`; with `base.unmeasurable` every
  finding counts as new.
- `outcome.kind` is `measured` (`findings`, `resolved`) or `unmeasurable`
  (`reason`). An unmeasurable function says nothing about this tree.
- A finding: `key` (what it is about, never the line), `path`, `line`,
  `message`, `status` (`new` or `existing`), and optionally `group`, `rank`,
  `values` and `trend`: points `{ commit, values }`, oldest first, HEAD last.
  `resolved` lists base findings HEAD lacks; check `reportsWrongly` before
  calling one a fix.

```sh
R="$OUT/report.json"
jq -r '.functions[] | [.id, .outcome.kind, ([.outcome.findings[]? | select(.status == "new")] | length), (.outcome.resolved // [] | length), (.outcome.reason // "")] | @tsv' "$R"
jq '.functions[] | {id, categories, reliesOn, misses, reportsWrongly, evidence}' "$R"
# new and resolved findings, and every finding whose key names a touched file
jq -r --rawfile touched "$OUT/touched.txt" '
  ($touched | split("\n") | map(select(. != ""))) as $paths
  | .functions[] | .id as $id
  | (.outcome.findings[]?, (.outcome.resolved[]? | .status = "resolved"))
  | select(.status != "existing" or (.key as $key | any($paths[]; . as $path | $key | contains($path))))
  | [$id, .status, "\(.path):\(.line)", .message, (.trend // [] | map(.values | tostring) | join(" → "))]
  | @tsv' "$R"
```

## 3. Search for copies

For each rule, value set or text the branch adds or changes, search its
values and its words in the measured tree:

```sh
git -C <dir> grep -n -E '<regex>' -- '*.ts' '*.tsx' '*.mts' '*.mjs' '*.kt' '*.md' '*.json' ':!*.spec.ts' ':!*Test.kt'
```

Use `-F` instead of `-E` for a literal (`oauth2`, `Personal Access Token`).
It reads tracked files only, so the same tree gives the same hits, across
TypeScript, Kotlin, docs and JSON.

A copy whose spelling you do not know shows in the `change-coupling` and
`missed-partner` findings the last filter lists for the touched files: open
both files of each pair and check whether they decide the same thing.

## 4. Review what no fitness function sees

Each function's `misses` say what it cannot see; read that code yourself.
#1799's structural causes recur as:

- **A rule in another spelling**: the same decision written differently
  (`engine === "c7"`, a negated `isC8`, a Kotlin `when`), or one text worded
  twice.
- **Logic in the wrong layer**: a decision in `service/`, `adapter/` or a
  host instead of `domain/`; a `domain/` file that orchestrates; a port shaped
  by a host widget instead of the feature's intent. Correct imports do not
  make it correct code.
- **Wiring per host**: a feature, route or session participant wired in one
  host's composition and not in the other's (VS Code, bridge, Kotlin), or in
  another order.
- **Catch-all modules**: `shared/`, `kernel/` or a utility file that imports
  a feature or gathers unrelated concerns.
- **Silently ignored commands**: a router, `switch` default or `catch` that
  drops a message without a reason; a command one host never handles.

Where a rule belongs and how it is named is in the
[architecture](../architecture/SKILL.md) skill.

## 5. Propose measures from trends

For each function that declares `values`, read the `trend` of the touched
files. A value that rose in each of the last PRs that changed it is a lead:
"`X.ts` grew in each of the last five PRs that touched it (300 → 330 → 348
code lines); move the rule it holds into `domain/`". A point's `commit` is the
PR that changed the value (`git log -1 --format=%s <commit>`). A touched file
with a `rank` (a hotspot) that grows is a lead too.

## Rules

- Each finding names `path:line`, its evidence (the code, a grep hit, a
  report row) and what applies: a fitness function's `id` and status, a limit
  quoted from its `misses` or `reportsWrongly`, or no fitness function.
- A finding a `reportsWrongly` entry describes is dropped, or marked as such.
- "Already duplicated before this PR" is never a reason to keep a copy.
  `existing` only says the branch did not add it. Fix the copy in the PR, or
  file an issue that names `path:line` of each copy.
- Comment; never block or request changes.

## Output

```markdown
## Architecture review: <branch | #PR | commit> at `<head>` against `<merge base>` (`<base ref>`)

Measured: <ids>. Not measured: `<id>` (<reason>).

### Findings
1. `<path:line>`: <what erodes the design, and how>.
   Evidence: <code, grep hit or report row>.
   Applies: <`id` new | existing | resolved> or <limit of `id`: "<quote>"> or <no fitness function>.
   Proposal: <fix in this PR> or <issue naming `path:line` of each copy>.

### Measures from trends
- `<path>`: <value> <a → b → c> over <n> PRs; <measure>.

Comments only; this review does not block.
```
