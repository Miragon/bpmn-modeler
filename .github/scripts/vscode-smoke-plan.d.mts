export interface SmokeSuiteRule {
    paths: readonly string[];
    suites: readonly string[];
}

export interface SmokeSuiteRegistry {
    maxJobs: number;
    jobSeconds: number;
    suites: Readonly<Record<string, { seconds: number }>>;
    baseline: readonly string[];
    ignore: readonly string[];
    rules: readonly SmokeSuiteRule[];
}

export interface SmokeJob {
    id: string;
    name: string;
    files: string;
}

export const LISTED_FILES_LIMIT: number;
export function selectSuites(
    registry: SmokeSuiteRegistry,
    changedFiles: readonly string[],
): string[];
export function planJobs(registry: SmokeSuiteRegistry, suites: readonly string[]): SmokeJob[];
export function suiteFile(suite: string): string;
