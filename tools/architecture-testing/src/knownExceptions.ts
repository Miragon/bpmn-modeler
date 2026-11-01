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

function excuses(exception: KnownException, violation: Violation): boolean {
    return inScope(exception.from, violation.from) && inScope(exception.to, violation.to);
}

function inScope(scope: string, path: string): boolean {
    return scope === "*" || path === scope || path.startsWith(`${scope}/`);
}
