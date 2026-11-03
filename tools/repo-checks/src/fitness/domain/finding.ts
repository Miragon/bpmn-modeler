/** `key` names what the finding is about, never its line, so it survives moved code. */
export interface Finding {
    readonly key: string;
    readonly path: string;
    readonly line: number;
    readonly message: string;
    /** One of the groups its fitness function declares; set exactly when it declares any. */
    readonly group?: string;
}

// Code-unit order, not localeCompare: the report must not depend on the machine's locale.
export function compareText(left: string, right: string): number {
    if (left < right) {
        return -1;
    }
    return left > right ? 1 : 0;
}

function compareFindings(left: Finding, right: Finding): number {
    return (
        compareText(left.path, right.path) ||
        left.line - right.line ||
        compareText(left.key, right.key) ||
        compareText(left.message, right.message)
    );
}

export function sortFindings(findings: readonly Finding[]): Finding[] {
    return [...findings].sort(compareFindings);
}

function isNonBlankText(value: unknown): value is string {
    return typeof value === "string" && value.trim() !== "";
}

function findingProblem(
    value: unknown,
    declaredGroups: readonly string[] | undefined,
): string | undefined {
    if (typeof value !== "object" || value === null) {
        return "is not an object";
    }
    const { key, path, line, message, group } = value as Record<string, unknown>;
    if (!isNonBlankText(key)) {
        return "has no key";
    }
    if (!isNonBlankText(path)) {
        return "has no path";
    }
    // A checkout lives in a temporary directory; an absolute path would differ per run.
    if (path.startsWith("/") || path.includes("\\")) {
        return `has path ${path}, not one relative to the repository root with forward slashes`;
    }
    if (!Number.isInteger(line) || (line as number) < 1) {
        return `has line ${String(line)}, not a positive integer`;
    }
    if (!isNonBlankText(message)) {
        return "has no message";
    }
    return declaredGroups === undefined ? undefined : groupProblem(group, declaredGroups);
}

function groupProblem(group: unknown, declaredGroups: readonly string[]): string | undefined {
    if (group === undefined) {
        return declaredGroups.length === 0 ? undefined : "has no group";
    }
    return declaredGroups.includes(group as string)
        ? undefined
        : `has group ${String(group)}, which the function does not declare`;
}

/**
 * Throws on broken output: a fitness function that returns garbage is broken input, not a finding.
 * `declaredGroups` is unset for a stored snapshot, whose groups were checked when it was measured.
 */
export function parseFindings(
    source: string,
    value: unknown,
    declaredGroups?: readonly string[],
): Finding[] {
    if (!Array.isArray(value)) {
        throw new Error(`${source} returned no list of findings`);
    }
    return sortFindings(
        value.map((candidate: unknown, index) => {
            const problem = findingProblem(candidate, declaredGroups);
            if (problem !== undefined) {
                throw new Error(`${source}: finding ${index} ${problem}`);
            }
            return findingFields(candidate as Finding);
        }),
    );
}

export function findingFields({ key, path, line, message, group }: Finding): Finding {
    return group === undefined ? { key, path, line, message } : { key, path, line, message, group };
}
