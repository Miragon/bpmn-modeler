export interface FunctionMeasure {
    readonly name: string;
    readonly line: number;
    readonly complexity: number;
}

export interface FileMeasure {
    readonly path: string;
    /** cloc's definition: lines with at least one token that is not a comment. */
    readonly codeLines: number;
    /** ESLint's `complexity` per function, field initializer and static block, in source order. */
    readonly functions: readonly FunctionMeasure[];
    /** No statement other than imports and re-exports. */
    readonly barrel: boolean;
}

/** The first of the most complex, so a tie points at the one higher up. */
export function mostComplexFunction(file: FileMeasure): FunctionMeasure | undefined {
    return file.functions.reduce<FunctionMeasure | undefined>(
        (most, candidate) =>
            most === undefined || candidate.complexity > most.complexity ? candidate : most,
        undefined,
    );
}

export function complexityPhrase(file: FileMeasure): string {
    const most = mostComplexFunction(file);
    return most === undefined
        ? "no function"
        : `highest complexity ${most.complexity} (${most.name})`;
}

/** The finding points at the most complex function, or at the top of a file without one. */
export function findingLine(file: FileMeasure): number {
    return mostComplexFunction(file)?.line ?? 1;
}
