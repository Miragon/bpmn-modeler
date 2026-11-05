/** `key` names what the finding is about, never its line, so it survives moved code. */
export interface Finding {
    readonly key: string;
    readonly path: string;
    readonly line: number;
    readonly message: string;
    /** One of the groups its fitness function declares; set exactly when it declares any. */
    readonly group?: string;
    /** Per value its fitness function declares; a value that does not apply is left out. */
    readonly values?: Readonly<Record<string, number>>;
    /** Orders the report's table before the path does; 1 comes first. */
    readonly rank?: number;
}

export interface DeclaredFindingFields {
    readonly groups: readonly string[];
    readonly values: readonly string[];
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

function isPositiveInteger(value: unknown): boolean {
    return Number.isInteger(value) && (value as number) >= 1;
}

function findingProblem(
    value: unknown,
    declared: DeclaredFindingFields | undefined,
): string | undefined {
    if (typeof value !== "object" || value === null) {
        return "is not an object";
    }
    const { key, path, line, message, group, values, rank } = value as Record<string, unknown>;
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
    if (!isPositiveInteger(line)) {
        return `has line ${String(line)}, not a positive integer`;
    }
    if (!isNonBlankText(message)) {
        return "has no message";
    }
    if (rank !== undefined && !isPositiveInteger(rank)) {
        return `has rank ${String(rank)}, not a positive integer`;
    }
    return (
        valuesProblem(values, declared?.values) ??
        (declared === undefined ? undefined : groupProblem(group, declared.groups))
    );
}

function groupProblem(group: unknown, declaredGroups: readonly string[]): string | undefined {
    if (group === undefined) {
        return declaredGroups.length === 0 ? undefined : "has no group";
    }
    return declaredGroups.includes(group as string)
        ? undefined
        : `has group ${String(group)}, which the function does not declare`;
}

function valuesProblem(
    values: unknown,
    declaredValues: readonly string[] | undefined,
): string | undefined {
    if (values === undefined) {
        return undefined;
    }
    if (typeof values !== "object" || values === null || Array.isArray(values)) {
        return "has values that are no record of numbers";
    }
    for (const [id, number] of Object.entries(values)) {
        if (declaredValues !== undefined && !declaredValues.includes(id)) {
            return `has value ${id}, which the function does not declare`;
        }
        if (typeof number !== "number" || !Number.isFinite(number)) {
            return `has value ${id} ${String(number)}, not a finite number`;
        }
    }
    return undefined;
}

/**
 * Throws on broken output: a fitness function that returns garbage is broken input, not a finding.
 * `declared` is unset for a stored snapshot, whose groups and values were checked when it was measured.
 */
export function parseFindings(
    source: string,
    value: unknown,
    declared?: DeclaredFindingFields,
): Finding[] {
    if (!Array.isArray(value)) {
        throw new Error(`${source} returned no list of findings`);
    }
    return sortFindings(
        value.map((candidate: unknown, index) => {
            const problem = findingProblem(candidate, declared);
            if (problem !== undefined) {
                throw new Error(`${source}: finding ${index} ${problem}`);
            }
            return findingFields(candidate as Finding);
        }),
    );
}

// Sorted so a snapshot's text does not depend on the order a function filled the record in.
function sortedValues(values: Readonly<Record<string, number>>): Record<string, number> {
    return Object.fromEntries(
        Object.entries(values).sort(([left], [right]) => compareText(left, right)),
    );
}

export function findingFields({ key, path, line, message, group, values, rank }: Finding): Finding {
    return {
        key,
        path,
        line,
        message,
        ...(group === undefined ? {} : { group }),
        ...(values === undefined ? {} : { values: sortedValues(values) }),
        ...(rank === undefined ? {} : { rank }),
    };
}
