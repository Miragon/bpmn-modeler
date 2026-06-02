---
description: Create a Conventional Commits message for the staged changes and commit
argument-hint: "[optional scope hint or extra context, e.g. 'editor' or 'fixes flaky test']"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git log:*)
---

Create a single git commit for the current changes, following this repo's
commit convention (see the "Commit Conventions" section in `CLAUDE.md`).

## Gather context

Run these in parallel and read the output:

- `git status --short`
- `git diff --staged` — the changes that will actually be committed
- `git log --format='%s' -15` — to mirror the existing type/scope vocabulary

## Decide what to commit

- If there **are** staged changes, commit **only those** — do not `git add`
  more. The user's staging is the intent.
- If **nothing is staged**, do not silently commit everything. Show the
  unstaged/untracked files and ask the user what to stage (or to confirm
  staging all). Only proceed once they answer.

## Write the message

Format: `<type>(<scope>): <subject>`

- Infer `type` and `scope` from the changed paths and the diff. Scope is the
  affected workspace/feature (`bpmn-webview`, `modeler-plugin`, `editor`,
  `diff`, `deployment`, `domain`, `deps`, `release`, …). Omit the scope only
  for genuinely repo-wide changes.
- Subject: imperative present tense, lowercase, no trailing period, ≤ ~72 chars.
- Add a body only when the *why* isn't obvious from the subject. Wrap at ~72.
- `$ARGUMENTS`, if provided, is a hint — a scope to prefer or extra context to
  weave into the body. Treat it as guidance, not the literal message.
- **No attribution trailers** — no `Co-Authored-By`, no "Generated with Claude
  Code". (Also disabled in `.claude/settings.json`.)

## Commit

- Show the proposed message, then commit with `git commit -m "…"` (use repeated
  `-m` flags for a body). Pass the message via a file or multiple `-m` flags —
  never embed unescaped newlines in a single shell string.
- **Do not push.** Stop after committing and report the new commit subject.
- If pre-commit hooks modify files or the commit fails, report what happened
  instead of forcing it through.
