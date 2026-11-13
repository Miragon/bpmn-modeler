export interface Violation {
    readonly from: string;
    readonly to: string;
}

/**
 * A violation the code still needs, named with the issue that removes it.
 * `from` and `to` name a file, a folder, a feature or a declaration
 * (`<form> <name>`); `*` matches anything.
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

const DISABLE_DIRECTIVE = /^eslint-disable(?:-next-line|-line)?(?=\s|$)/;
const DESCRIPTION_SEPARATOR = /\s--/;
const ISSUE_AND_REASON = /^#\d+:\s*\S/;

interface DisableDirective {
    readonly ruleList: string;
    readonly description: string;
}

/** The comments that disable `rule` without a `-- #<issue>: <reason>` description. */
export function directivesWithoutIssue(comments: readonly string[], rule: string): string[] {
    return comments.filter((comment) => {
        const directive = parseDisableDirective(commentBody(comment));
        if (!directive) {
            return false;
        }
        return disables(directive, rule) && !ISSUE_AND_REASON.test(directive.description);
    });
}

// A directive that names no rule turns off every rule.
function disables(directive: DisableDirective, rule: string): boolean {
    const ruleNames = directive.ruleList.split(",").map((name) => name.trim());
    return ruleNames.every((name) => name === "") || ruleNames.includes(rule);
}

// One regex over rule list and description backtracks quadratically on long whitespace runs.
function parseDisableDirective(body: string): DisableDirective | undefined {
    const keyword = DISABLE_DIRECTIVE.exec(body);
    if (!keyword) {
        return undefined;
    }
    const rest = body.slice(keyword[0].length);
    const separator = DESCRIPTION_SEPARATOR.exec(rest);
    if (!separator) {
        return { ruleList: rest, description: "" };
    }
    return {
        ruleList: rest.slice(0, separator.index),
        description: rest.slice(separator.index + separator[0].length).trim(),
    };
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
