# 0029 — Compare execution properties with isolated moddle descriptors

- Status: accepted (#1487)
- Date: 2026-09-09
- Category: bpmn-webview

## Context

The public `computeDiff` data layer established by ADR 0008 parsed BPMN without
engine descriptors. Camunda 7 execution attributes and Camunda 8 extension
elements were consequently generic or absent from the typed comparison, so
execution-property edits could produce an empty diff.

Registering the installed Camunda 7 and Zeebe descriptors on one `bpmn-moddle`
instance is not viable. Both extend BPMN elements with `modelerTemplate`; moddle
rejects the duplicate property and its lax XML reader can skip the complete
process while returning only a warning.

## Decision

`computeDiff` parses both revisions twice: one pair with
`camunda-bpmn-moddle`, and one with `zeebe-bpmn-moddle`. Before each comparison,
the other engine's extension elements and attributes are removed from that
pair. The two `bpmn-js-differ` results are merged and deduplicated without
changing the public signature or result shape.

Unknown namespaced attributes retained by moddle are compared in an additional
textual pass. Containment traversal assigns a nested attribute to the nearest
tracked BPMN owner and preserves the differ's process-to-participant mapping.
References and parent links are not traversed. Parser warnings that report
skipped XML content are promoted to failures.

The private diff library owns both descriptor runtime dependencies. The public
package inlines only their JSON resources as lazy JavaScript chunks; the parser
and other npm dependencies remain external.

## Alternatives considered / rejected

**Register both descriptors together.** Rejected because the
`modelerTemplate` collision makes valid mixed-engine input parse incompletely.

**Compare execution properties as generic XML only.** Rejected because generic
comparison loses descriptor defaults and creates textual false positives for
typed values.

## Consequences

Camunda 7, Camunda 8, and mixed-engine documents retain engine semantics in
diffs, while custom attributes have explicit textual semantics. Existing flow
ordering, structural categories, serialization, and caller configuration stay
unchanged.

Each diff now performs four XML parses and two comparisons. The parser and
descriptors remain lazy, but callers that invoke `computeDiff` accept the added
CPU and allocation cost.
