# Allowance playground

A hands-on test bed for the allowance of workspace code
([#2358](https://github.com/Miragon/bpmn-modeler/pull/2358), design in the ADR section
"Allowance per repository and add-on" of [`docs/adr/bpmn-modeler.md`](../../docs/adr/bpmn-modeler.md)).
An allowance names a BPMN plugin or a bpmnlint rule package at its place in a repository, so every
worktree of that repository runs it, later changes included, while another clone, another
repository and a folder outside git ask once.

That needs real git repositories, worktrees and clones, which cannot be committed inside this
repository. [`create-playground.mjs`](create-playground.mjs) builds them in a folder of your choice
from the files in [`template/`](template/):

| Template | What it is |
| --- | --- |
| `repo/.camunda/plugins/hello-badge/` | A bpmn-js plugin that registers on `window.plugins` and shows a green badge **Hello badge v1** on the canvas |
| `bpmnlint-plugin-acme/` | A rule package whose rule `acme/task-found` warns on every task with `acme <version>: task "<name>" found`, the version read from its own `package.json` when it loads |
| `repo/order.bpmn` | A Camunda 7 process with three tasks, so it opens in Implement, the mode with linting |
| `repo/.bpmnlintrc`, `repo/package.json` | Extends `bpmnlint:recommended` and `plugin:acme/recommended`; devDependency `bpmnlint-plugin-acme` |

`node_modules` is not committed. The script copies the rule package into each checkout's
`node_modules/bpmnlint-plugin-acme`, as `npm install` would, so it needs neither npm nor a network.

## Prerequisites

- Node 18 or later and `git` on `PATH`. Git 2.48 or later adds the `relative` worktree; an older
  git skips it and says so.
- The branch built: `corepack yarn build`, or `corepack yarn watch` while you change code.
- A target folder outside every git repository. The script refuses one inside a work tree, since
  that repository would hold `no-git/` and the other plain folders.

## Build it

```bash
node resources/allowance-playground/create-playground.mjs                 # into ~/bpmn-allowance-playground
node resources/allowance-playground/create-playground.mjs create <target> # anywhere else
node resources/allowance-playground/create-playground.mjs <target> --force # rebuild a playground
node resources/allowance-playground/create-playground.mjs bump [<target>]  # simulate an update
```

`create` refuses a folder that is not empty. With `--force` it deletes and rebuilds a folder only
when that folder holds the marker file `.allowance-playground` an earlier run wrote. Git runs with an
empty config written to `<target>/.playground/gitconfig`, so your signing, hooks and templates do not
apply. At the end the script prints the folder map with the expected outcome per folder; each folder
also has a `README.txt` that says what to test there (git ignores it through `.git/info/exclude`).

| Folder | What it is |
| --- | --- |
| `acme/` | The main repository: one commit, branches `feature`, `upgrade`, `pnpm` and `relative` |
| `acme-worktrees/feature/` | `git worktree add` on `feature`, rule package 1.0.0 |
| `acme-worktrees/upgrade/` | `git worktree add` on `upgrade`; a commit changes the badge to **Hello badge v2**; rule package 2.0.0 |
| `acme-worktrees/relative/` | `git worktree add --relative-paths`: the `.git` file and the admin folder hold relative paths |
| `acme-worktrees/pnpm/` | A worktree with pnpm's layout: `node_modules/bpmnlint-plugin-acme` links to `node_modules/.pnpm/bpmnlint-plugin-acme@1.0.0/node_modules/bpmnlint-plugin-acme` (a junction on Windows) |
| `acme-clone/` | `git clone` of `acme/` |
| `other-repo/` | A separate repository with the same files |
| `no-git/` | The same files, no git |
| `spoofed-worktree/` | The same files; its `.git` file names `acme/.git/worktrees/feature`, the admin folder of another worktree |
| `linked-git/` | The same files; its `.git` is a directory link to `acme/.git` |
| `two-worktrees.code-workspace` | A VS Code multi-root workspace with `acme/` and `acme-worktrees/feature/` |

Do not run git commands in `spoofed-worktree/` and `linked-git/`: git would act on `acme`'s
repository. The `relative` worktree sets `extensions.relativeWorktrees` in `acme/.git/config`, so a
git older than 2.48 can no longer read `acme/`.

## VS Code: a clean profile

Earlier approvals live in VS Code's global state and would answer the questions this playground is
meant to ask. Start the branch build in a throwaway profile, from the repository root:

```bash
PLAYGROUND=~/bpmn-allowance-playground
PROFILE=$(mktemp -d)
code --user-data-dir "$PROFILE/user-data" --extensions-dir "$PROFILE/extensions" \
    --extensionDevelopmentPath="$PWD/dist/apps/vscode-plugin" "$PLAYGROUND/acme"
```

When VS Code asks whether you trust the authors of `acme`, check **Trust the authors of all files in
the parent folder** and confirm. That trusts the whole playground, so every other folder opens
trusted; the extension does not run in Restricted Mode. Open the next folder with **File ▸ Open
Folder…** in the same window, or quit and run the command again with the same `$PROFILE`: the profile
keeps your allowances between folders, which is what the checklist tests.

Watch the **bpmn.modeler** output channel (**View ▸ Output**) and the **Add-ons** view (the Miragon
comet in the activity bar) while you go.

## IntelliJ

`corepack yarn intellij:run` builds the webviews and the bridge and starts a sandbox IntelliJ. Open
each playground folder as its own project (**File ▸ Open…**) and trust the project when the IDE asks.
Until PR 4 of #2345 the plugin does not read the IDE's project trust, so an untrusted project of an
allowed repository still runs its add-ons; do not count that as a result of this checklist.

The question is an IDE notification balloon with **Review…**; the view is the **Add-ons** tab of the
**BPMN Modeler** tool window; the output channel lines go to the IDE log (**Help ▸ Show Log in
Finder**, **Explorer** on Windows, **Files** on Linux). The IDE keeps allowances for all projects, so
an add-on you allow in one project window is allowed in the others.

The documented IntelliJ limit for rule packages is `main`, `exports` and most dependencies. The
playground's package has none of them, but nobody has run it in IntelliJ yet: if the `acme` warnings
do not appear, look in the IDE log first.

## Checklist

Go top to bottom in one profile: the rows below `acme/` assume you allowed both add-ons there. The
notices are *1 BPMN plugin in this workspace is not allowed yet.* and *1 bpmnlint rule package in this
workspace is not allowed yet, so rules from it are skipped.*, each with **Review…**. In the view the
states read **Allowed**, **Not allowed yet** and **Declined this session**, and the list marks a
waiting add-on **Needs review**. The rule package is listed as `bpmnlint-plugin-acme@<version>`.

| # | Open | Do | You should see (VS Code) | IntelliJ differs |
| --- | --- | --- | --- | --- |
| 1 | `acme/order.bpmn` | Click **Review…** on the first notice and **Allow** at the end of the review, then the same on the second | Two notices, one after the other: the second appears once you answered the first, as only one question is open at a time. The review says *Allowed in: every worktree of `<playground>/acme`*. After Allow: *Allowed Hello badge in every worktree of its repository. Open editors reload with it.* and *Allowed bpmnlint-plugin-acme@1.0.0 in every worktree of its repository. Open editors lint again with it.* The badge **Hello badge v1** shows; the canvas overlays and the Problems panel show three warnings `acme 1.0.0: task "…" found` | Balloons instead of notifications; **Review…** opens the Add-ons tab; read the warnings on the canvas overlays |
| 2 | `acme-worktrees/feature/order.bpmn` | Nothing | No question. Badge v1, warnings `acme 1.0.0`, both add-ons **Allowed**, *Allowed in: every worktree of `<playground>/acme`* | Same |
| 3 | `acme-worktrees/upgrade/order.bpmn` | Nothing | No question. Badge **Hello badge v2**; warnings `acme 2.0.0`; the view lists `bpmnlint-plugin-acme@2.0.0` as **Allowed** | Same |
| 4 | `acme-worktrees/relative/order.bpmn` | Nothing | No question, as in row 2 | Same |
| 5 | `acme-worktrees/pnpm/order.bpmn` | Keep it open, run `bump`, then move a task to lint again. Optionally delete the old `node_modules/.pnpm/bpmnlint-plugin-acme@1.0.0` folder, as pnpm does, and move a task again | No question before or after. After `bump` the warnings say `acme 1.1.0` without a question and without a window reload, the old folder kept or deleted. **Refresh Add-ons** lists `bpmnlint-plugin-acme@1.1.0` | Same, without reloading the project |
| 6 | `acme/order.bpmn` after `bump` | Move a task | Warnings say `acme 1.1.0`, no question, no reload (an update rewrites the package's `package.json` in place) | Same |
| 7 | `acme-clone/order.bpmn` | Allow both | Asks once per add-on (another clone). *Allowed in: every worktree of `<playground>/acme-clone`* | Same |
| 8 | `other-repo/order.bpmn` | Allow both | Asks once per add-on (another repository) | Same |
| 9 | `no-git/order.bpmn` | Allow both | Asks once per add-on. The review warns *… Allowing it covers this folder, later changes included. Allow it only if you trust it.* and says *Allowed in: this folder only*. The result is *Allowed Hello badge. Open editors reload with it.* | Same |
| 10 | `spoofed-worktree/order.bpmn` | Look, then allow or leave | Asks, although `acme/` is allowed: it never counts as `acme`. *Allowed in: this folder only* | Same |
| 11 | `linked-git/order.bpmn` | Look, then allow or leave | Asks, although `acme/` is allowed: a linked `.git` proves no repository. *Allowed in: this folder only* | Same |
| 12 | `two-worktrees.code-workspace` (**File ▸ Open Workspace from File…**) | First **Revoke** both add-ons in the view. Then open `order.bpmn` from both folders | One notice per add-on, each counting **1**, not 2 (*1 BPMN plugin in this workspace is not allowed yet.*). The view shows the add-on under each folder; one **Allow** on either row makes both **Allowed**, and the editors in both folders reload or lint again | No multi-root workspace: open `acme/` and `acme-worktrees/feature/` as two project windows. After **Allow** in one, the other's editor reloads or lints again without asking |
| 13 | Any allowed folder | **Revoke** in the view | *Revoked Hello badge in every worktree of its repository. Open editors reload without it.* and *Revoked bpmnlint-plugin-acme@… in every worktree of its repository. Code it already ran stays loaded until you reload the window.* Other worktrees of `acme` ask again in a new window | *…until you restart the IDE.* |

Optional, a stale Allow: in `no-git/`, open the view on a plugin that is **Not allowed yet**, run
`git init` in `no-git/` in a terminal, then click **Allow** without refreshing. The place now resolves
to a repository, so the view refuses with *The list changed since you looked at it. Check it again,
then allow.* If the view re-read before your click, it shows *Allowed in: every worktree of
`<playground>/no-git`* instead. Rebuild the playground with `--force` afterwards.

## Simulate an update

```bash
node resources/allowance-playground/create-playground.mjs bump [<target>]
```

`bump` raises `bpmnlint-plugin-acme` to the next minor version (1.0.0 to 1.1.0, then 1.2.0, …) in
two places:

- `acme/node_modules/bpmnlint-plugin-acme/package.json` in place, as `npm install` of a new version
  rewrites it;
- in `acme-worktrees/pnpm/` it creates
  `node_modules/.pnpm/bpmnlint-plugin-acme@<new>/node_modules/bpmnlint-plugin-acme` and points the
  `node_modules/bpmnlint-plugin-acme` link at it; the old folder stays, as pnpm can leave it. Delete
  it to try what pnpm usually does.

The modeler checks the stamps of the package's `package.json` (and of the link's) before each lint,
so the next lint runs the new version without a question. Node and Bun keep where a link led for
the whole process, so after the pnpm `bump` they still name the old folder; the modeler loads the
same file from the folder the link leads to now. A pnpm update that moves the package's entry or a
rule file to another path is refused instead, and the output channel asks you to reload the window
or restart the IDE. The Add-ons view does not watch `node_modules`: click **Refresh Add-ons** to see the
new `name@version`.

## Reset between runs

- **Revoke** each add-on in the Add-ons view (VS Code) or the **Add-ons** tab (IntelliJ). Revoke
  takes the allowance back in every worktree of the repository, together with any 1.21.0 approval of
  it.
- VS Code: start with a new `$PROFILE` (a new `--user-data-dir`).
- IntelliJ: the sandbox keeps its config under `apps/intellij-plugin/build/` (by default
  `build/idea-sandbox/`); deleting it resets every sandbox setting, allowances included.

`create <target> --force` is no reset: it restores the files (for example after `bump`), but an
allowance names a path, so a playground rebuilt at the same path keeps every allowance and `acme/`
no longer asks. To start over, Revoke or use a new profile, or build into another target.

## The start-up migration of 1.21.0 approvals

VS Code 1.21.0 and IntelliJ 1.16.0 stored one approval per folder and content. The branch build
rewrites each local one whose folder it finds as an allowance at start-up and logs one line
(`contentRowMigration.ts`).

VS Code:

1. Use a fresh profile and install the released extension:
   ```bash
   PROFILE=$(mktemp -d)
   code --user-data-dir "$PROFILE/user-data" --extensions-dir "$PROFILE/extensions" \
       --install-extension miragon-gmbh.vs-code-bpmn-modeler@1.21.0
   code --user-data-dir "$PROFILE/user-data" --extensions-dir "$PROFILE/extensions" "$PLAYGROUND/acme"
   ```
   **Install Specific Version…** in the Extensions view does the same. Check that the Extensions view
   shows 1.21.0.
2. Open `acme/order.bpmn`, click **Review…** on both notices and check the plugin and the rule
   package in the list. Do the same in `acme-worktrees/feature/`: 1.21.0 asks per folder. That stores
   four approvals pinned to content.
3. Quit, then start the branch build in the same profile; the development extension takes the
   installed one's place:
   ```bash
   code --user-data-dir "$PROFILE/user-data" --extensions-dir "$PROFILE/extensions" \
       --extensionDevelopmentPath="$PWD/dist/apps/vscode-plugin" "$PLAYGROUND/acme-worktrees/upgrade"
   ```
4. The **bpmn.modeler** output channel says
   `Approvals: rewrote 4 approvals pinned to content as allowances of their add-ons, later changes included.`
   (one approval per folder and add-on you allowed in step 2; with one it says
   `Approvals: rewrote 1 approval pinned to content as an allowance of its add-on, later changes included.`).
5. Nothing asks in `upgrade/`, `acme/`, `feature/`, `relative/` or `pnpm/`. The view shows both
   add-ons **Allowed**. A second start logs no migration line.

IntelliJ, the same with plugin 1.16.0. `runIde` always installs the branch build into its sandbox, so
use an IntelliJ installation you can spare: install **Miragon BPMN Modeler** 1.16.0 (download it from
plugins.jetbrains.com and use **Settings ▸ Plugins ▸ ⚙ ▸ Install Plugin from Disk…**), allow both
add-ons in `acme/` and `acme-worktrees/feature/`, then build the branch plugin with
`corepack yarn intellij:build` and `./gradlew buildPlugin` in `apps/intellij-plugin`, install the ZIP
from `apps/intellij-plugin/build/distributions/` the same way and restart. The IDE log has the same
line, and nothing asks.

If the rewrite fails, the line is `Approvals: could not rewrite approvals pinned to content: <reason>`
and the next start tries again; the old approvals still allow their own folders meanwhile.

## Remote windows (optional)

In a VS Code remote window (SSH, dev container, WSL) an allowance holds only for that remote, and a
1.21.0 approval counts nowhere remote, because it names no machine.

1. On the remote, copy `resources/allowance-playground/` and run `create-playground.mjs` there (Node
   18 and git on the remote).
2. In a remote window with extension 1.21.0 installed on the remote, allow both add-ons in `acme/`.
3. Package the branch build (`cd dist/apps/vscode-plugin && npx @vscode/vsce@4.1.0 package --out
   bpmn-modeler-plugin.vsix --yarn --no-dependencies`), install it in the remote window with
   **Extensions ▸ ⋯ ▸ Install from VSIX…** and reload.
4. `acme/order.bpmn` asks once per add-on, although 1.21.0 had allowed both; no migration line
   appears. The review says *Allowed in: every worktree of `<remote path>/acme` on `<host>`*, for
   example `ssh-remote+box` or `dev-container+…`.
5. Allow, reload the window: no question. `acme-worktrees/feature/` on the remote asks nothing either.
   A local window does not count this allowance.

## Output channel lines

From `rulePackageLog.ts`, `contentRowMigration.ts` and the catalogs, as the **bpmn.modeler** channel
(IntelliJ: the IDE log) prints them:

| Line | Meaning here |
| --- | --- |
| `bpmnlint: rule package bpmnlint-plugin-acme@1.0.0 (<folder>) is not allowed yet (new), so rules from it are skipped.` | The lint skipped `acme/task-found`; the notice asks. `declined this session` in place of `new` after you left it unchecked or closed the list |
| `bpmnlint: 1 rule(s)/config(s) could not be resolved and were skipped: plugin:bpmnlint-plugin-acme/recommended` | Comes with the line above while the package waits: the skipped package leaves `plugin:acme/recommended` unresolved. Expected before Allow; it goes once the package is allowed |
| `bpmnlint applied from <folder>/.bpmnlintrc` | A lint ran with the folder's config |
| `bpmnlint: bundled rules stand in for a rule package that is not allowed yet: <name>@<version> (<folder>)` | The bundled rules covered what the config takes from a package, so nothing asks. The playground's package has no bundled stand-in, so this should not appear |
| `bpmnlint: refused to run <file>: <reason>.` | A rule file no allowance can cover; it never runs. Should not appear in the playground |
| `Allowed BPMN plugin(s): Hello badge` | Your answer in the list allowed the plugin. Only when **Review…** opens the list, which it does for code outside every workspace folder; in the playground **Review…** opens the view, and **Allow** there logs nothing |
| `Allowed bpmnlint rule package(s): bpmnlint-plugin-acme@1.0.0` | The same for the rule package, so it should not appear in the playground either |
| `Approvals: rewrote <n> approvals pinned to content as allowances of their add-ons, later changes included.` | The start-up migration rewrote `<n>` approvals from 1.21.0 / 1.16.0; `rewrote 1 approval … as an allowance of its add-on` for one |
| `Approvals: could not rewrite approvals pinned to content: <reason>` | The migration failed; it runs again at the next start |
