export interface Violation {
    readonly from: string;
    readonly to: string;
}

/**
 * A violation the code still needs, named with the issue that removes it.
 * `from` and `to` name a file, a folder or a feature; `*` matches anything.
 */
export interface KnownException extends Violation {
    readonly until: string;
}

const ISSUE_REFERENCE = /#\d+/;

export function unexcusedViolations<V extends Violation>(
    violations: readonly V[],
    exceptions: readonly KnownException[],
): V[] {
    return violations.filter(
        (violation) => !exceptions.some((exception) => excuses(exception, violation)),
    );
}

/** An exception nothing needs any more fails the gate, so the lists only shrink. */
export function staleExceptions(
    violations: readonly Violation[],
    exceptions: readonly KnownException[],
): KnownException[] {
    return exceptions.filter(
        (exception) => !violations.some((violation) => excuses(exception, violation)),
    );
}

export function exceptionsWithoutIssue(exceptions: readonly KnownException[]): KnownException[] {
    return exceptions.filter(({ until }) => !ISSUE_REFERENCE.test(until));
}

const DISABLE_DIRECTIVE = /^eslint-disable(?:-next-line|-line)?\s+(.*?)(?:\s+--\s*(.*))?$/s;
const ISSUE_AND_REASON = /^#\d+:\s*\S/;

/** The comments that disable `rule` without a `-- #<issue>: <reason>` description. */
export function directivesWithoutIssue(comments: readonly string[], rule: string): string[] {
    return comments.filter((comment) => {
        const directive = DISABLE_DIRECTIVE.exec(commentBody(comment));
        if (!directive) {
            return false;
        }
        const [, ruleList, description = ""] = directive;
        const disablesRule = ruleList.split(",").some((name) => name.trim() === rule);
        return disablesRule && !ISSUE_AND_REASON.test(description);
    });
}

function commentBody(comment: string): string {
    const body = comment.startsWith("//") ? comment.slice(2) : comment.slice(2, -2);
    return body.trim();
}

function excuses(exception: KnownException, violation: Violation): boolean {
    return inScope(exception.from, violation.from) && inScope(exception.to, violation.to);
}

function inScope(scope: string, path: string): boolean {
    return scope === "*" || path === scope || path.startsWith(`${scope}/`);
}
