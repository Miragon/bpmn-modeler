---
name: architecture-review
description: Reviews a branch, a pull request or a past commit for architecture and design erosion. Reads the fitness function report (findings, delta, trends and each function's limits) and checks its rows in the code, searches for copies of a rule, judges what no fitness function sees and proposes how to make the fitness functions more accurate. Use when asked to review a branch or PR for architecture, design, layering, duplicated rules or erosion.
---

# Architecture review

The fitness functions of `corepack yarn fitness` are computational sensors:
deterministic, and blind to what their `misses` name. This review is the
inferential sensor next to them
([ADR](../../../docs/adr/architecture-enforcement.md#architecture-review)). It is
not deterministic, so it comments and never blocks.

## 1. Measure the tree

On a pull request the Fitness report workflow already lists the new and
resolved rows per function: the job summary holds every row, and a PR from
this repository, unless Dependabot opened it, has at most one comment with a
capped copy, posted once there is a change
([ADR](../../../docs/adr/architecture-enforcement.md#fitness-function-report)).
For `size-and-complexity` it lists the existing files that grew and only
counts the new ones; `missed-partner` and `mutation-score` are in the full
report only, so the comment never shows their rows.
It measures GitHub's test merge, so the whole PR counts as one change, which
the PR row below does not. Read it for an overview; the review still measures
here, because only the JSON holds the existing findings, the trends and those
two functions.

Run every block from this checkout. `OUT` lies outside it: an untracked file
in the checkout would count as a change. Two reviews at once need their own
`TMPDIR`. A shell keeps no variables from one tool call to the next, so every
block starts with the line that reads `OUT` (and `TREE`, `REV`, `R`) back.

The blocks run under bash and zsh. Run the commands you write yourself under
bash (`bash -c`, or a script file run with `bash`): zsh and the BSD tools of
macOS break them, often without an error.

- zsh ties `path` to `PATH`, so a loop variable named `path` leaves `jq` and
  `git` unfound (exit 127); name it `file`.
- zsh reads `echo ====` as a command lookup; quote it.
- zsh reads `$REV:libs/…` as `$REV` with the history modifier `:l`; write
  `"${REV}:libs/…"`.
- zsh has no `PIPESTATUS`, only `pipestatus`.
- `git grep -E` on macOS matches nothing for `\b` or `\<`; use `-w`.

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

A commit on main, such as a merged PR's squash commit
(`gh pr view <n> --json mergeCommit --jq .mergeCommit.oid`). `change-coupling`
and `hotspots` count a branch as one change, its squash, so a PR's head gives
the same rows.

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
: > "$OUT/conflicts.txt"
if [ "$BASE" = "$(git -C "$TREE" rev-parse "$REV")" ]; then
  git -C "$TREE" diff --name-only --no-renames "$BASE" > "$OUT/touched.txt"
else
  git -C "$TREE" merge-tree --write-tree --name-only "$REV" HEAD > "$OUT/merge.txt"; MERGE_STATUS=$?
  if [ "$MERGE_STATUS" -eq 0 ]; then
    { git -C "$TREE" diff --name-only --no-renames "$REV" "$(head -n 1 "$OUT/merge.txt")"; git -C "$TREE" diff --name-only --no-renames HEAD; } | sort -u > "$OUT/touched.txt"
    echo "merge base $BASE is not $REV: touched.txt lists the change as it would land on $REV"
  else
    LAST_MERGE=$(git -C "$TREE" log --first-parent --merges -n 1 --format=%H "$BASE..HEAD")
    OWN_FROM="$BASE"; [ -n "$LAST_MERGE" ] && OWN_FROM=$(git -C "$TREE" rev-parse "$LAST_MERGE^2")
    git -C "$TREE" diff --name-only --no-renames "$OWN_FROM" > "$OUT/touched.txt"
    awk 'NR > 1 && /^$/ { exit } NR > 1' "$OUT/merge.txt" | while IFS= read -r file; do
      if grep -qxF "$file" "$OUT/touched.txt"; then printf '%s\tchanged by the PR\n' "$file"; else printf '%s\tnot changed by the PR\n' "$file"; fi
    done > "$OUT/conflicts.txt"
    echo "merge-tree exit $MERGE_STATUS, $(grep -c . "$OUT/conflicts.txt") conflicted files in conflicts.txt"
    if [ -n "$LAST_MERGE" ]; then echo "touched.txt lists the change since $OWN_FROM, merged in $(git -C "$TREE" log -1 --format='%h %s' "$LAST_MERGE")"
    else echo "the head has no merge: touched.txt lists the change since the merge base $BASE"; fi
  fi
fi
```

The report runs this checkout's fitness functions on `TREE`, which needs no
install. It compares with `git merge-base HEAD <rev>`, so `<rev>` need not be
an ancestor. When the head lags `<rev>`, the diff from the merge base also
holds changes that reached `<rev>` another way, such as a stacked PR squashed
into it, so the block lists the change as it would land on `<rev>` instead.
When the head conflicts with `<rev>`, that merged tree would hold files the
PR never changed, so the block lists the PR's own change: from the commit
that the head's newest merge after the merge base took in to the working
tree. Only merges after the merge base count, because the base's own history
holds old merges the PR never made. Check in the printed line that this
merge took in the PR's base; without a merge the list starts at the merge
base and holds a stacked parent's commits too. `conflicts.txt` labels each
conflicted file as changed or not changed by the PR: one the PR did not
change conflicts through what reached `<rev>` after that merge. `--no-renames` lists a renamed file under
both paths, so deleted and renamed files are in `touched.txt` too.
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
  the function's `groups`), `rank`, `values`, `valuesAtBase` (on an existing
  finding whose values changed since the merge base) and `trend`: points
  `{ commit, values }`, oldest first, HEAD's values last. `resolved` lists
  base findings HEAD lacks; check `reportsWrongly` before calling one a fix.

```sh
OUT="${TMPDIR:-/tmp}/architecture-review"; TREE=$(cat "$OUT/tree.txt"); R="$OUT/report.json"
# id, version, outcome, new, resolved, why unmeasurable, why unmeasurable at the merge base
jq -r '.functions[] | [.id, .version, .outcome.kind, ([.outcome.findings[]? | select(.status == "new")] | length), (.outcome.resolved // [] | length), (.outcome.reason // ""), (.base.unmeasurable // "")] | @tsv' "$R"
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
function and group, then list those under each area step 4 walks. The rows
outside those areas stay unchecked; the header counts them per function.

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

A list, union or enum the change touches has copies under other names and
with other members, which a literal of the whole set misses. Grep two or
three of its most distinctive members one by one, bare so that either quote
style matches; a file that holds two or more of them is a candidate:

```sh
OUT="${TMPDIR:-/tmp}/architecture-review"; TREE=$(cat "$OUT/tree.txt")
for member in '<member 1>' '<member 2>' '<member 3>'; do
  git -C "$TREE" grep -l -F -e "$member" -- '*.ts' '*.tsx' '*.mts' '*.kt' '*.kts' '*.json' ':!*.spec.ts' ':!*.spec.tsx' ':!*Test.kt'
done | sort | uniq -c | sort -rn
```

Open each candidate and diff its list with the touched one, including a list
with extra or missing members: the difference is the finding.

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
  the finding, ahead of the duplication itself. Find them by their members
  (step 3), not only through the diff or a report row.
- **Adapters of one port that disagree**: for each port the change calls,
  open every adapter (each host, the bridge, the in-memory fake) and compare
  what each returns on failure or cancel, its path format, order and limits,
  and how it propagates and logs errors. Check that the port's contract suite
  exercises every parameter the core passes. `contract-suites` proves that a
  suite runs, not what it asserts; when it is unmeasurable, do this for every
  port the change touches. It sees an adapter without an `implements` clause
  only where production code hands it over as the port, and skips the core's
  own object literals; find those with `git grep` on the port's name.
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

A whole tree gives no touched files to start from and is more than one run
can walk: whole-tree runs compared about half of 15 ports and left hundreds
of rows unchecked. Review one area per run: a port family, the hosts'
composition roots or one workspace's `domain/`, as the request names it.
Without one, take the ports in hotspot order, at most five per run. Walk each
port with all its adapters, and each composition root and `domain/` file of
the area, and apply step 3 and these checks to each. The header names the
areas and ports not covered, so the next run can take them.

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

A hotspot's `rank` counts the branch as one revision, so it shows where the
file stands, not how it grew; read its growth from its size trend.

## 6. Improve the fitness functions

A fitness function can report code wrongly, or miss erosion, beyond what its
`reportsWrongly` and `misses` declare. Each review checks its rows and feeds
what it learns back.

- Before you report a row as erosion or drop it, read the function's
  `reportsWrongly` and `misses`, then open the row's `path:line` and check
  that the code is what its `message` claims. Never drop a row unchecked: a
  true finding dismissed is as bad as a false one reported. On a whole tree,
  check every row in the areas walked and count the rest as unchecked.
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
- Before you call a false alarm undeclared, quote the function's nearest
  `reportsWrongly` entry and say why it does not fit. A row in a group the
  function declares `collapsed` is set aside already; quote that group's
  title instead. If either fits, the row is a declared false alarm.
- Before you propose a `reportsWrongly` entry, check that the row is not one
  rule held in two places. Two halves of one protocol, a writer and its
  reader, or a host and the core can each spell the same rule: if changing
  the rule means editing both files, the row is true. Report it and propose
  a home or a pin, not an entry.
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
<When the merge base is not the base ref: touched files are the change as it would land on it, or, on a conflict, the change since `<commit>`, which `<merge>` took in, or, on a conflict without a merge, the change since the merge base, which may hold a stacked parent's commits; conflicted files the PR did not change: <paths>.>
<For a whole tree: walked: <areas and ports>; not covered: <areas and ports>; unchecked rows: <count per function>.>

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

- `<id>` v<version>, `<key>` or the missed `<path:line>`: <false alarm, nearest entry "<quote>" and why it does not fit | declared false alarm | missed erosion>, <the case and its evidence>.
  Proposal: <narrower rule | exclusion derived from types, folders, imports or configuration | `reportsWrongly` or `misses` entry>; <fix in this PR | issue for a maintainer>.

Comments only; this review does not block.
```
