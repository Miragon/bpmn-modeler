# 0038 — Bind deployment actions and credentials to the selected saved target

- Status: accepted
- Date: 2026-09-17
- Category: cross-cutting

## Context

Named targets share editable connection fields with ad-hoc deployment. Target
switches and secret-store reads complete asynchronously. A delayed credential
reply can populate a different connection, while unsaved connection changes can
write credentials and deployment history under the original target's identity.

## Decision

Require saved target connection changes to be saved before Deploy or Start
Instance. Credential-only edits remain executable. Both actions share the form's
readiness state and remain unavailable while switching targets or loading secrets.
The core independently resolves the submitted target name in the captured document
context and rejects missing targets or mismatching operation settings before
execution or persistence.

Correlate private credential requests and replies with a monotonically increasing
request ID and the requested target name. Clear secrets when switching targets or
authentication methods, and ignore superseded replies, including failures. Target
list messages carry their document directory so a same-named target in another
document context cannot retain a credential draft. Returning to ad-hoc mode restores
its complete connection defaults and clears named-target URL overrides.

This refines the execution contract introduced in [0036](0036-deployment-targets-file-and-endpoint-overrides.md).
The targets-file format, secret keys, ledger format, and published browser APIs
remain unchanged.

## Alternatives considered

Allow unsaved target connections to deploy as temporary ad-hoc connections. This
would require a separate destination identity and credential-persistence policy.
Requiring Save makes the connection used for an operation reviewable in the target
file and was explicitly chosen for this workflow.

## Consequences

Users must save connection edits before executing against a named target, but can
still enter or replace credentials without saving connection metadata. Private
message producers and consumers must echo correlation fields; uncorrelated replies
cannot complete a current form lookup. Both hosts and the standalone preview use
the same protocol. Deployment-webview regression tests exercise delayed replies,
readiness, and draft preservation; core dispatcher tests enforce target matching.
