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

Run every block from this checkout. `OUT` lies outside it: an untracked file
in the checkout would count as a change. Two reviews at once need their own
`TMPDIR`. A shell keeps no variables from one tool call to the next, so every
block starts with the line that reads `OUT` (and `TREE`, `REV`, `R`) back.

| Review                   | `TREE`                    | `<rev>`                                                                         |
| ------------------------ | ------------------------- | ------------------------------------------------------------------------------- |
| The current branch       | this checkout             | `origin/main`                                                                   |
| PR `<n>`, open or merged | worktree of the PR's head | its `baseRefOid`                                                                |
| A commit on main         | worktree of `<commit>`    | `<commit>^`, its first parent (its PR's `baseRefOid` adds the PRs merged since) |
| A whole tree, no change  | worktree of `<commit>`    | `<commit>`: every finding is `existing`, `touched.txt` is empty                 |

Run the block of your row. The current branch:

```sh
OUT="${TMPDIR:-/tmp}/architecture-review"; mkdir -p "$OUT"
git rev-parse --show-toplevel > "$OUT/tree.txt"   # always absolute
echo origin/main > "$OUT/rev.txt"
```

PR `<n>`:

```sh
OUT="${TMPDIR:-/tmp}/architecture-review"; mkdir -p "$OUT"
git worktree remove --force "$OUT/worktree" 2>/dev/null   # a leftover of an earlier review
git fetch origin "pull/<n>/head" && git worktree add --detach "$OUT/worktree" FETCH_HEAD
echo "$OUT/worktree" > "$OUT/tree.txt"
gh pr view <n> --json baseRefOid --jq .baseRefOid > "$OUT/rev.txt"
```

A commit on main; for a merged PR, prefer its squash commit
(`gh pr view <n> --json mergeCommit --jq .mergeCommit.oid`): on an unsquashed
head each branch commit counts as a PR for `change-coupling` and `hotspots`.

```sh
OUT="${TMPDIR:-/tmp}/architecture-review"; mkdir -p "$OUT"
git worktree remove --force "$OUT/worktree" 2>/dev/null
git worktree add --detach "$OUT/worktree" <commit>
echo "$OUT/worktree" > "$OUT/tree.txt"
git rev-parse "<commit>^" > "$OUT/rev.txt"
```

A whole tree: the same block, with `git rev-parse <commit> > "$OUT/rev.txt"`.

Then measure:

```sh
OUT="${TMPDIR:-/tmp}/architecture-review"; TREE=$(cat "$OUT/tree.txt"); REV=$(cat "$OUT/rev.txt"); R="$OUT/report.json"
corepack yarn fitness --format json --repo "$TREE" --base "$REV" > "$R"
BASE=$(jq -r .base.commit "$R")
git -C "$TREE" diff --name-only "$BASE" > "$OUT/touched.txt"
if [ "$BASE" != "$(git -C "$TREE" rev-parse "$REV")" ]; then
  MERGED=$(git -C "$TREE" merge-tree --write-tree "$REV" HEAD | head -n 1)   # exits 1 on a conflict, still writes the tree
  { git -C "$TREE" diff --name-only "$REV" "$MERGED"; git -C "$TREE" diff --name-only HEAD; } | sort -u > "$OUT/touched.txt"
  echo "merge base $BASE is not $REV: touched.txt lists the change as it would land on $REV"
fi
```

The report runs this checkout's fitness functions on `TREE`, which needs no
install. It compares with `git merge-base HEAD <rev>`, so `<rev>` need not be
an ancestor. When the head lags `<rev>`, the diff from the merge base also
holds changes that reached `<rev>` another way, such as a stacked PR squashed
into it, so the block lists the change as it would land on `<rev>` instead.
Findings keep their status against the merge base: a `new` finding outside
`touched.txt` came with such a change. Say so in the review's header. Run
`git worktree remove --force "$OUT/worktree"` when done.

## 2. Read the report

The JSON is about 1 MB, mostly `size-and-complexity` rows: filter it with
`jq` (or `node -e`), never read it whole. Read every entry of `functions[]`;
the registry grows, so never assume which functions exist.

- `head.commit`, `head.uncommittedChanges`; `base.commit` is the merge base,
  `base.ref` the `<rev>` given.
- Limits: `misses` and `reportsWrongly` are what a review needs. `measures`
  says what a function reads; query it when a finding surprises you.
  `categories`, `reliesOn` and `evidence` (the trials that calibrated the
  function, on other trees) are long and say nothing about this one.
- A function's own `base.source` is `snapshot` or `checkout`; with its
  `base.unmeasurable` every finding counts as new.
- `outcome.kind` is `measured` (`findings`, `resolved`) or `unmeasurable`
  (`reason`). An unmeasurable function says nothing about this tree.
- A finding: `key` (what it is about, never the line), `path`, `line`,
  `message`, `status` (`new` or `existing`), and optionally `group` (one of
  the function's `groups`), `rank`, `values` and `trend`: points
  `{ commit, values }`, oldest first, HEAD's values last. `resolved` lists
  base findings HEAD lacks; check `reportsWrongly` before calling one a fix.

```sh
OUT="${TMPDIR:-/tmp}/architecture-review"; TREE=$(cat "$OUT/tree.txt"); R="$OUT/report.json"
jq -r '.functions[] | [.id, .outcome.kind, ([.outcome.findings[]? | select(.status == "new")] | length), (.outcome.resolved // [] | length), (.outcome.reason // "")] | @tsv' "$R"
jq '.functions[] | {id, misses, reportsWrongly}' "$R"
jq -r --arg id '<id>' '.functions[] | select(.id == $id) | .measures' "$R"
# new and resolved findings, and every finding whose key names a touched file
jq -r --rawfile touched "$OUT/touched.txt" '
  ($touched | split("\n") | map(select(. != ""))) as $paths
  | .functions[] | .id as $id
  | (.outcome.findings[]?, (.outcome.resolved[]? | .status = "resolved"))
  | select(.status != "existing" or (.key as $key | any($paths[]; . as $path | $key | contains($path))))
  | [$id, .status, "\(.path):\(.line)", .message, (.trend // [] | map(.values | tostring) | join(" → "))]
  | @tsv' "$R"
```

A row you drop under a `reportsWrongly` entry, or check and find harmless,
goes under **Marked, no action** in the output, never under Findings.

A whole tree has no new findings and no touched files: count the findings per
function and group, then list those under each area step 4 walks.

```sh
OUT="${TMPDIR:-/tmp}/architecture-review"; TREE=$(cat "$OUT/tree.txt"); R="$OUT/report.json"
jq -c '.functions[] | {id, groups: (.outcome.findings // [] | group_by(.group) | map({group: .[0].group, count: length}))}' "$R"
jq -r --arg path '<path prefix>' '.functions[] | .id as $id | .outcome.findings[]? | select(.key | contains($path)) | [$id, .group // "", "\(.path):\(.line)", .message] | @tsv' "$R"
```

## 3. Search for copies

For each rule, value set or text the branch adds, changes, moves or removes,
search its values and its words in the measured tree. A moved or removed text
can leave an untouched copy that the touched-file filter of step 2 hides.

```sh
OUT="${TMPDIR:-/tmp}/architecture-review"; TREE=$(cat "$OUT/tree.txt"); R="$OUT/report.json"
git -C "$TREE" grep -n -E '<regex>' -- '*.ts' '*.tsx' '*.mts' '*.mjs' '*.kt' '*.kts' '*.gradle' '*.yml' '*.yaml' '*.md' '*.json' ':!*.spec.ts' ':!*.spec.tsx' ':!*Test.kt'
```

Use `-F` instead of `-E` for a literal, such as a text with dots or brackets.
It reads tracked files only, so the same tree gives the same hits, across
TypeScript, Kotlin, build scripts, CI workflows, docs and JSON.

A literal finds only copies spelled alike. Before proposing a home, look for
an existing one by concept: a rule that decides the same thing in another
form, such as another data structure, another parsing technique, or the code
that reads what this code writes. For each function or port method the
change calls, list its other callers (`git -C "$TREE" grep -n -w '<name>'`)
and compare what they pass and how they filter, sort or cut the result. A
home that one caller still bypasses fixes nothing.

A copy pinned across languages has guards of its own: the test that reads it
as a declared input, and the CI path filter that runs that test. Check them
with the copy.

A copy whose spelling you do not know shows in the `change-coupling` and
`missed-partner` findings the touched-file filter of step 2 lists: open
both files of each pair and check whether they decide the same thing.

## 4. Review what no fitness function sees

Each function's `misses` say what it cannot see; read that code yourself.
Erosion recurs as:

- **A rule in another spelling**: the same decision written differently (a
  comparison with a literal, the negation of a predicate, a Kotlin `when`),
  or one text worded twice.
- **Copies that already disagree**: two lists, enums, type declarations or
  parsers of one concept. Diff their contents or behaviour: the difference is
  the finding, ahead of the duplication itself.
- **Adapters of one port that disagree**: for each port the change calls,
  open every adapter (each host, the bridge, the in-memory fake) and compare
  what each returns on failure or cancel, its path format, order and limits,
  and how it propagates and logs errors. Check that the port's contract suite
  exercises every parameter the core passes. `contract-suites` proves that a
  suite runs, not what it asserts; when it is unmeasurable, do this for every
  port the change touches.
- **Two derivations of one state**: one function derives a state from a
  narrow input (whether an optional field is set, a boolean) while another
  view of the same state reads the full value (a union, an enum). Walk every
  value of the full input through both and check that they agree.
- **Logic in the wrong layer**: a decision in `service/`, `adapter/` or a
  host instead of `domain/`; a `domain/` file that orchestrates; a port shaped
  by a host widget instead of the feature's intent. Correct imports do not
  make it correct code. Open each new or largely rewritten adapter,
  composition root, bootstrap and UI component in full, not only the lines a
  report row or a grep names, and list its module-level mutable state kept in
  sync by hand and every branch on domain data.
- **Wiring per host**: a feature, route or session participant wired in one
  host's composition and not in the other's (VS Code, bridge, Kotlin), or in
  another order.
- **A workspace without its siblings' guards**: a new workspace or top-level
  folder without the architecture spec, the manifest's architecture
  declaration and the ADR coverage of dependencies and layering its siblings
  have. Check this by hand: `convention-coverage` reads only workspaces that
  declare an architecture.
- **Catch-all modules**: `shared/`, `kernel/` or a utility file that imports
  a feature or gathers unrelated concerns.
- **Silently ignored commands**: a router, `switch` default or `catch` that
  drops a message without a reason; a command one host never handles.

A whole tree gives no touched files to start from, so do not sample it. Walk
every port with all its adapters, every composition root, and the `domain/`
of every workspace, in hotspot order, and apply step 3 and these checks to
each. The review names what it did not cover.

```sh
OUT="${TMPDIR:-/tmp}/architecture-review"; TREE=$(cat "$OUT/tree.txt"); R="$OUT/report.json"
jq -r '.functions[] | select(.id == "hotspots") | .outcome.findings[]? | [.rank, .path] | @tsv' "$R" | sort -n
git -C "$TREE" ls-files ':(glob)**/port/**' ':(glob)**/composition/**' ':(glob)**/domain/**' | sed -E 's#/(port|composition|domain)/.*#/\1/#' | sort -u
```

Where a rule belongs and how it is named is in the
[architecture](../architecture/SKILL.md) skill. For a worktree, read that
skill and the ADRs from `TREE` (`$TREE/.agents/skills/`, `$TREE/docs/adr/`)
where it has them: judge a past tree by its own rules, and cite today's only
as context.

## 5. Propose measures from trends

For each function that declares `values`, read the `trend` of the touched
files; for a whole tree, of the files behind your findings and the hotspots.
A value that rose in each of the last PRs that changed it is a lead:
"`X.ts` grew in each of the last five PRs that touched it (300 → 330 → 348
code lines); move the rule it holds into `domain/`". The first point is the
oldest stored snapshot that holds the file, not necessarily a PR that changed
it; each later point is a commit that changed the value.

```sh
OUT="${TMPDIR:-/tmp}/architecture-review"; TREE=$(cat "$OUT/tree.txt"); R="$OUT/report.json"
jq -r --arg path '<path>' '.functions[] | select(.values) | .id as $id | .outcome.findings[]? | select(.path == $path) | .trend[]? | [$id, .commit, (.values | tostring)] | @tsv' "$R" |
  while IFS=$'\t' read -r id commit values; do printf '%s\t%s\t%s\n' "$id" "$(git -C "$TREE" log -1 --format='%h %s' "$commit")" "$values"; done
```

A hotspot's `rank` counts each branch commit as a revision until the PR is
squash-merged, so read a hotspot's growth from its size trend, not its rank.

## Rules

- Each finding names `path:line`, its evidence (the code, a grep hit, a
  report row) and what applies: each fitness function's `id` and status, each
  limit quoted from its `misses` or `reportsWrongly`, or no fitness function.
- A finding a `reportsWrongly` entry describes goes under Marked, no action.
- "Already duplicated before this PR" is never a reason to keep a copy.
  `existing` only says the branch did not add it. Fix the copy in the PR, or
  file an issue that names `path:line` of each copy.
- A copy the tree records as a planned step, in an ADR or a doc comment that
  names an issue, goes under Marked, no action once you checked that the
  issue names each copy. A copy the issue leaves out is a finding.
- Before calling two declarations of one value set unpinned, check what pins
  them already: a type equality assertion, a spec that compares them, or code
  that assigns each to the other, which the compiler checks both ways.
- Comment; never block or request changes.

## Output

Order the findings: copies or hosts that already disagree first, then copies
that can drift, then placement and naming.

```markdown
## Architecture review: <branch | #PR | commit> at `<head>` against `<merge base>` (`<base ref>`)

Measured: <ids>. Not measured: `<id>` (<reason>).
<When the merge base is not the base ref: touched files are the change as it would land on it.>
<For a whole tree: not covered: <areas>.>

### Findings

1. `<path:line>`: <what erodes the design, and how; say if it predates the change>.
   Evidence: <code, grep hit or report row>.
   Applies: <`id` new | existing | resolved>, <limit of `id`: "<quote>">, … or <no fitness function>.
   Proposal: <fix in this PR> or <issue naming `path:line` of each copy>.

### Marked, no action

- `<id>` `<path:line>`: <the `reportsWrongly` entry it matches, the planned step that records it, or why it is harmless>.

### Measures from trends

- `<path>`: <value> <a → b → c> over <n> PRs; <measure>.

Comments only; this review does not block.
```
