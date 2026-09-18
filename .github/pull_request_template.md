## Issue

<!-- Required: link an `accepted` issue. PRs whose linked issue is not yet
     `accepted` are put on hold — see CONTRIBUTING → The Acceptance Gate. For a
     trivial fix with nothing to discuss, add the `no-issue` label instead. -->
Closes #

## Description

<!-- What changed and why. Link an ADR if this changes architecture or public API. -->

## Author checklist

- [ ] The linked issue was marked `accepted` before I opened this PR (or `no-issue` for a trivial fix)
- [ ] PR title follows Conventional Commits (`<type>(<scope>): <subject>`; breaking changes marked with `!`)
- [ ] Tests added or updated (or N/A)
- [ ] Docs (or N/A)
- [ ] ADR updated or added under `docs/adr/` (see the [recording rules](../docs/adr/README.md#recording-rules)) (or N/A)
- [ ] Self-reviewed the diff
- [ ] No new architecture-test violations (`architecture.spec.ts`, part of `corepack yarn test`)
- [ ] Verified in the affected hosts — VS Code / IntelliJ / standalone (or N/A)

## For the reviewer

- [ ] Would we still want this change if the code didn't already exist? (Judge the idea, not the diff.)
