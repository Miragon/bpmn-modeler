---
name: commit
description: Create a single Conventional Commit when the user asks to commit changes in this repository. Preserve the user's staging and stop after committing without pushing.
---

# Commit changes

Follow the "Commit Conventions" section in the repository's `AGENTS.md`.
Only create a commit when the user requests one; loading this skill for
reference does not authorize a commit.

## Gather context

Run these in parallel and read the output:

- `git status --short`
- `git diff --staged` — the changes that will actually be committed
- `git log --format='%s' -15` — the existing type/scope vocabulary

## Decide what to commit

- If there are staged changes, commit only those; do not stage more.
- If nothing is staged, use any explicit staging instructions already given
  in this session. Otherwise, show the unstaged/untracked files and ask what
  to stage before proceeding. Do not silently stage everything.
- If there are no changes to commit, report that and stop.

## Write the message

- Use `<type>(<scope>): <subject>`, choosing the type and scope from the changes
  and the repository conventions. Omit the scope for repo-wide changes.
- Keep the subject imperative, lowercase, without a trailing period, and
  roughly 72 characters or fewer.
- Add a body when the reason is not clear from the subject. Wrap it at about
  72 characters.
- Treat any scope hint or extra user context as guidance, not literal message
  text.
- Add no `Co-Authored-By` or generated-by attribution for any agent or model.

## Commit

- Show the proposed message, then commit. Pass the message through a temporary
  file with `git commit --file <path>` or correctly shell-quoted `-m` arguments;
  preserve newlines and literal characters without shell expansion.
- Do not push. Report the new commit subject after committing.
- If a hook changes files or the commit fails, report what happened rather
  than bypassing hooks, forcing the commit, or staging additional files.
