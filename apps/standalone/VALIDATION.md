# Theia 1.75 migration validation — 2026-09-25

Scope: [issue #1556](https://github.com/Miragon/bpmn-modeler/issues/1556),
HEAD `073f014452f759b9f71e34cb9a54d99dd063dc03` plus the uncommitted
migration changes. This records evidence, not release approval or issue closure.
Local checks used Node 24.21.0 and Yarn 4.18.0; Theia builds/tests on Node 24
used `NODE_OPTIONS=--no-experimental-webstorage` when needed. CI uses Node 22,
which was not reproduced locally.

## Build, tests, and package

| Check | Result |
| --- | --- |
| Root checks | `corepack yarn lint` passed with 0 errors and 480 existing warnings; format check passed; knip reported 3 hints. Root build passed. |
| Standalone extension and security | Extension build and tests passed (59 tests); `corepack yarn workspace @miragon/bpmn-modeler-standalone test:security` passed (15 tests). |
| Runtime compatibility | `corepack yarn workspace @miragon/bpmn-modeler-standalone test:runtime` passed (41 tests, including POSIX/Windows/unpackaged ripgrep path cases). |
| Documentation | Documentation tests passed (21 tests), followed by a successful documentation build. |
| Desktop package | Theia development and production builds and the Linux directory package passed with Theia 1.75.0 and Electron 42.8.1. `corepack yarn workspace @miragon/bpmn-modeler-standalone test:packaged` passed (1 test). |
| Real packaged search | `xvfb-run -a corepack yarn workspace @miragon/bpmn-modeler-standalone test:packaged-search` passed twice against the Linux package, about five seconds per Quick Open test (1 test each). |

The packaged search test uses a disposable workspace and profile. It passes
`--no-sandbox` only to its isolated Xvfb Electron process, not to normal
packaged launches. The Linux release job runs the binary and Quick Open checks
after directory packaging and before Flatpak bundling. Before the ripgrep fix,
Quick Open returned no result for an existing BPMN file and logged
`FileSearchServiceImpl ... spawn ENOTDIR`; unpacking the binary alone did not
fix the backend path. The corrected ASAR sidecar path returned the file without
that error. The app remains packaged in ASAR, with only generated ripgrep
unpacked.

## Desktop behavior exercised

Disposable Git workspaces with branch and merge commits were used in two
headless real-Electron runs. A Camunda 7 BPMN **process-name** edit and a DMN
DRD **definitions-name** edit were made through the visible editors, saved,
verified on disk, and rendered again after tab close/reopen. This did not
exercise DMN decision-table cell editing. The Source Control graph showed the
merge commit and `main` ref, and a selected BPMN file's Timeline showed its
commit; graph ref selection was only partially exercised.

In both runs, the live Miragon theme picker switched the host **and** the BPMN
and DMN webviews: light → dark and dark → light. The host class/background,
BPMN canvas theme, and both webview classes/backgrounds matched the selected
theme. Both editor formats detached into secondary windows and accepted edits
and saves. Calling Electron's `BrowserWindow.close()` on those secondary windows
restored the editors to the main window with their content intact; further UI
edits and saves worked. This exercises Electron's programmatic native close
lifecycle, **not** an OS title-bar button or mixed-DPI behavior.

With auto-save disabled only in the temporary workspace, an unsaved DMN edit
made in a secondary window stayed off disk and returned as a dirty tab after
`BrowserWindow.close()`. Closing a dirty tab displayed Save / Don't Save /
Cancel: Cancel retained the dirty edit without writing it, and Save persisted
it. A dirty **main-window** `BrowserWindow.close()` left the window and dirty
editor open with disk unchanged, but no save prompt was confirmed, so that
scenario remains unverified.

Each final light and dark run recorded **33 passed behavioral checks, no
functional failures, one unverified dirty-main-window check, and one renderer
log review item**. The temporary helper deliberately exited nonzero for that
review item; its result is not an all-clear. No file-search backend error or
page error occurred in those runs. The exploratory helper, logs, and screenshots
under `/tmp/opencode` are ephemeral and are not part of this repository.

## Supply-chain comparison

A frozen npm bulk-advisory snapshot was applied to the union of resolved
standalone and development/build-tool package versions in the pre-upgrade
lockfile at `b01f5eabadfe3cfc4b59f84a66619672f14934df` and the migration
candidate. It matched **142 distinct baseline GHSAs**, **134 candidate GHSAs**,
and **zero newly introduced GHSA/package pairs**; package-version advisory
matches were 191 and 181 respectively. The patched `decompress` alias was
identified as `@xhmikosr/decompress@11.1.4`, not legacy `decompress`.

A separate Yarn recursive audit captured **133 candidate GHSAs and 155
advisory-range records**. These are different counting units and potentially
different query times from the frozen snapshot's 134 GHSAs and 181
package-version matches. The CI gates for **direct dependencies at high
severity** and **recursive dependencies at critical severity** passed; this
does **not** mean an all-severity audit is clean. Inherited advisories remain,
and no unrelated security override was changed for this migration.

## Remaining limits

- The Linux Flatpak bundle is blocked locally by unavailable Electron
  `org.electronjs.Electron2.BaseApp` 25.08. Earlier macOS CI history reached
  signing but failed at `SecKeychainUnlock`; there is no fresh signed macOS
  validation. Windows has not run the new packaged ripgrep path.
- A sandbox-enabled Linux Playwright launch probe failed without a useful
  platform diagnostic. The smoke used local `--no-sandbox`; normal packaged
  sandbox behavior is not established by that test. OS-button secondary-window
  closing, mixed-DPI operation, and the dirty-main-window prompt still need
  manual verification.
- The renderer logged `no handler for  MessageEvent` 22 times in each final
  smoke run. Read-only inspection traced it to
  `@theia/plugin-ext/src/main/browser/webview/pre/host.js` (lines 27–48)
  receiving `fromMain`-forwarded channels from
  `@theia/core/lib/browser/window/default-secondary-window-service.js`
  (lines 53–74). Its significance is unresolved, so it remains a review flag,
  not an assumed-benign message. No new patch was made for it.
