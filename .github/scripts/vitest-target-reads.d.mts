export interface UncoveredRead {
    path: string;
    kind: "file" | "directory";
}

export interface TargetCoverage {
    targetDir: string;
    repoFiles: readonly string[];
    isTriggered: (path: string) => boolean;
}

export function readPathCandidates(sourceText: string, filePath: string): string[];
export function uncoveredReads(
    candidates: readonly string[],
    coverage: TargetCoverage,
): UncoveredRead[];
export function withoutQuery(specifier: string): string;
