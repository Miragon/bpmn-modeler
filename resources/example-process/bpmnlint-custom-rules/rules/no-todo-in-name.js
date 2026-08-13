/**
 * Custom bpmnlint rule: flags any BPMN element whose name still contains "TODO".
 *
 * A stand-in for a project convention the built-in rules can't cover — the kind
 * of team-specific check that benefits most from being flagged while modeling
 * rather than in review (issue #1304). Kept dependency-free (no `bpmnlint-utils`)
 * so the example plugin is trivial to read.
 *
 * A bpmnlint rule is a factory that returns a visitor: `check` runs on every
 * element, and `reporter.report(elementId, message)` records a violation.
 */
module.exports = function () {
    function check(node, reporter) {
        const name = node.name;
        if (typeof name === "string" && /todo/i.test(name)) {
            reporter.report(
                node.id,
                'Element name must not contain "TODO" — resolve it before committing.',
            );
        }
    }

    return { check };
};
