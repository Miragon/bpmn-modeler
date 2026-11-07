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
    /** The files `key` names, in its order, so the delta can follow their renames; neither stored nor reported. */
    readonly paths?: readonly string[];
    /** Set when `key` names `paths` in code-unit order whatever they are, as an undirected pair does. */
    readonly pathOrder?: "code-unit";
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

// A checkout lives in a temporary directory; an absolute path would differ per run.
function isRelativeToRoot(path: string): boolean {
    return !path.startsWith("/") && !path.includes("\\");
}

/** The text of `key` before, between and after `paths`; undefined unless it names each of them in this order. */
export function keyAroundPaths(key: string, paths: readonly string[]): string[] | undefined {
    const around: string[] = [];
    let rest = key;
    for (const path of paths) {
        const at = rest.indexOf(path);
        if (at === -1) {
            return undefined;
        }
        around.push(rest.slice(0, at));
        rest = rest.slice(at + path.length);
    }
    return [...around, rest];
}

function isInCodeUnitOrder(paths: readonly string[]): boolean {
    return paths.every((path, index) => index === 0 || compareText(paths[index - 1], path) <= 0);
}

function pathsProblem(key: string, paths: unknown, pathOrder: unknown): string | undefined {
    if (paths === undefined) {
        return pathOrder === undefined ? undefined : "has a path order but no paths";
    }
    if (
        !Array.isArray(paths) ||
        paths.length === 0 ||
        !paths.every((path) => isNonBlankText(path) && isRelativeToRoot(path))
    ) {
        return "has paths that are no list of paths relative to the repository root";
    }
    if (keyAroundPaths(key, paths) === undefined) {
        return "has paths its key does not name in their order";
    }
    if (pathOrder === undefined) {
        return undefined;
    }
    if (pathOrder !== "code-unit") {
        return `has path order ${String(pathOrder)}, not code-unit`;
    }
    return isInCodeUnitOrder(paths) ? undefined : "has paths out of code-unit order";
}

function findingProblem(
    value: unknown,
    declared: DeclaredFindingFields | undefined,
): string | undefined {
    if (typeof value !== "object" || value === null) {
        return "is not an object";
    }
    const fields = value as Record<string, unknown>;
    const { key, path, line, message, group, values, rank, paths, pathOrder } = fields;
    if (!isNonBlankText(key)) {
        return "has no key";
    }
    if (!isNonBlankText(path)) {
        return "has no path";
    }
    if (!isRelativeToRoot(path)) {
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
        pathsProblem(key, paths, pathOrder) ??
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
            return { ...findingFields(candidate as Finding), ...pathFields(candidate as Finding) };
        }),
    );
}

// Sorted so a snapshot's text does not depend on the order a function filled the record in.
function sortedValues(values: Readonly<Record<string, number>>): Record<string, number> {
    return Object.fromEntries(
        Object.entries(values).sort(([left], [right]) => compareText(left, right)),
    );
}

function pathFields({ paths, pathOrder }: Finding): Pick<Finding, "paths" | "pathOrder"> {
    return {
        ...(paths === undefined ? {} : { paths: [...paths] }),
        ...(pathOrder === undefined ? {} : { pathOrder }),
    };
}

/** The fields a snapshot stores and the report shows. */
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
