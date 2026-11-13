---
name: architecture-review
description: Reviews a branch, a pull request or a past commit for architecture and design erosion. Reads the fitness function report (findings, delta, trends and each function's limits) and checks its rows in the code, searches for copies of a rule, judges what no fitness function sees and proposes how to make the fitness functions more accurate. Use when asked to review a branch or PR for architecture, design, layering, duplicated rules or erosion.
---

# Architecture review

The fitness functions of `corepack yarn fitness` are computational sensors:
deterministic, and blind to what their `misses` name. This review is the
inferential sensor next to them
([ADR](../../../docs/adr/engineering-practices.md#architecture-review)). It is
not deterministic, so it comments and never blocks.

## 1. Measure the tree

On a pull request the Fitness report workflow already lists the new and
resolved rows per function: the job summary holds every row, and a PR from
this repository, unless Dependabot opened it, has at most one comment with a
capped copy, posted once there is a change
([ADR](../../../docs/adr/engineering-practices.md#fitness-function-report)).
It measures GitHub's test merge, so the whole PR counts as one change, which
the PR row below does not. Read it for an overview; the review still measures
here, because only the JSON holds the existing findings and the trends.

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
`touched.txt` may have come with such a change; check the function's
`reportsWrongly` first. Say so in the review's header. Run
`git worktree remove --force "$OUT/worktree"` when done.

## 2. Read the report

The JSON is about 1 MB, mostly `size-and-complexity` rows: filter it with
`jq` (or `node -e`), never read it whole. Read every entry of `functions[]`;
the registry grows, so never assume which functions exist.

- `head.commit`, `head.uncommittedChanges`; `base.commit` is the merge base,
  `base.ref` the `<rev>` given.
- Limits: `misses` and `reportsWrongly` are what a review needs. `measures`
  says what a function reads; query it when a finding surprises you.
  `categories` and `reliesOn` say nothing about this tree. `evidence` holds
  the trials that calibrated the function, on commits of this repository; it
  is long, so query it per row as step 6 says, never whole.
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
jq -r '.functions[] | [.id, .version, .outcome.kind, ([.outcome.findings[]? | select(.status == "new")] | length), (.outcome.resolved // [] | length), (.outcome.reason // "")] | @tsv' "$R"
jq '.functions[] | {id, version, misses, reportsWrongly}' "$R"
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

Each row is a claim about the code, not yet a finding: check it as step 6
says. A row that matches a `reportsWrongly` entry, proves wrong or is
harmless goes under **Marked, no action** in the output, never under Findings.

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
it. Each later point except the last is a commit that changed the value; the
last holds HEAD's values, and when it names HEAD's commit it stands for every
change since the newest stored snapshot, on a branch the whole branch.

```sh
OUT="${TMPDIR:-/tmp}/architecture-review"; TREE=$(cat "$OUT/tree.txt"); R="$OUT/report.json"
jq -r --arg path '<path>' '.functions[] | select(.values) | .id as $id | .outcome.findings[]? | select(.path == $path) | .trend[]? | [$id, .commit, (.values | tostring)] | @tsv' "$R" |
  while IFS=$'\t' read -r id commit values; do printf '%s\t%s\t%s\n' "$id" "$(git -C "$TREE" log -1 --format='%h %s' "$commit")" "$values"; done
```

A hotspot's `rank` counts each branch commit as a revision until the PR is
squash-merged, so read a hotspot's growth from its size trend, not its rank.

## 6. Improve the fitness functions

A fitness function can report code wrongly, or miss erosion, beyond what its
`reportsWrongly` and `misses` declare. Each review checks its rows and feeds
what it learns back.

- Before you report a row as erosion or drop it, read the function's
  `reportsWrongly` and `misses`, then open the row's `path:line` and check
  that the code is what its `message` claims. Never drop a row unchecked: a
  true finding dismissed is as bad as a false one reported.
- Before you mark a row false or propose a `reportsWrongly` entry, look up
  the function's trials that name the row's files. A trial ran on a commit of
  this repository, so it can name a row that is still in the tree. A trial
  that names the row and counts it as true, at a commit where the row's code
  reads as it does now, makes the row a finding: quote the trial under
  Applies. A trial that names only the row's file, or ran on other code, is a
  lead, not a verdict.

    ```sh
    OUT="${TMPDIR:-/tmp}/architecture-review"; TREE=$(cat "$OUT/tree.txt"); R="$OUT/report.json"
    jq -r --arg id '<id>' --arg file '<file name>' '.functions[] | select(.id == $id) | .evidence[]? | select(tostring | contains($file))' "$R"
    git -C "$TREE" diff '<trial commit>' -- '<path>'   # a hunk at the row's lines, or an unknown commit: a lead
    ```

- A row the code disproves is a false alarm. List it under Marked, no action
  with the evidence: the code that disproves it, and the `reportsWrongly`
  entry it matches, if any.
- Propose a correction for each false alarm no `reportsWrongly` entry
  describes, and for each erosion you found that a function's `measures`
  covers but it did not report and its `misses` do not name. Prefer a
  narrower rule, then an exclusion derived from types, folders, imports or
  configuration; at the least, a `reportsWrongly` or `misses` entry. For a
  row a `reportsWrongly` entry already describes, propose a narrower rule or
  an exclusion only when the code can decide the case; do not restate the
  entry. Every fitness function stays deterministic, adds no dependency and
  never reads a file or type name (#2049), so a proposal does not either.
- Each proposal names the function's `id` and `version`, the row's `key` (for
  a miss, the `path:line` of the erosion), the case, and whether it is a fix
  in this PR (one that adds or changes that function) or an issue for a
  maintainer to check before it is filed. A proposal that changes a
  function's rule bumps its `version` and needs a measured trial (#2049).

These proposals go under Fitness function feedback, never among the findings.

## Rules

- Each finding names `path:line`, its evidence (the code, a grep hit, a
  report row) and what applies: each fitness function's `id` and status, each
  limit quoted from its `misses` or `reportsWrongly`, each trial quoted from
  its `evidence`, or no fitness function.
- A row a `reportsWrongly` entry describes goes under Marked, no action once
  the code shows it is that case.
- "Already duplicated before this PR" is never a reason to keep a copy.
  `existing` only says the branch did not add it. Fix the copy in the PR, or
  file an issue that names `path:line` of each copy.
- A copy the tree records as a planned step, in an ADR or a doc comment that
  names an issue, goes under Marked, no action once you checked that the
  issue names each copy. A copy the issue leaves out is a finding.
- Before calling two declarations of one value set unpinned, check what pins
  them already: a type equality assertion, a spec that compares them, or code
  that assigns each to the other, which the compiler checks both ways.
- A `repeated-value-sets` row that names another order: propose the type pin
  on the copy, not deriving it from the home, unless the order is the same
  concern.
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
   Applies: <`id` new | existing | resolved>, <limit of `id`: "<quote>">, <trial of `id` at `<commit>`: "<quote>">, … or <no fitness function>.
   Proposal: <fix in this PR> or <issue naming `path:line` of each copy>.

### Marked, no action

- `<id>` `<path:line>`: <the `reportsWrongly` entry it matches, a false alarm and the code that disproves it, the planned step that records it, or why it is harmless>.

### Measures from trends

- `<path>`: <value> <a → b → c> over <n> PRs; <measure>.

### Fitness function feedback

- `<id>` v<version>, `<key>` or the missed `<path:line>`: <false alarm | declared false alarm | missed erosion>, <the case and its evidence>.
  Proposal: <narrower rule | exclusion derived from types, folders, imports or configuration | `reportsWrongly` or `misses` entry>; <fix in this PR | issue for a maintainer>.

Comments only; this review does not block.
```
