import type { MutationTally } from "./mutationTally";

/** The workspace Stryker mutates; its report names files relative to it. */
export const MUTATED_WORKSPACE_DIR = "libs/modeler-core";

export interface MutationRun {
    readonly schemaVersion: 1;
    readonly runId: string;
    readonly commit: string;
    /** Keyed by the domain folder's path relative to the repository root. */
    readonly contexts: Readonly<Record<string, MutationTally>>;
}

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mutationRunPath(runId: string): string {
    return `mutation/${runId}.json`;
}

export function serializeMutationRun(run: MutationRun): string {
    return `${JSON.stringify(run, null, 2)}\n`;
}

function isCount(value: unknown): value is number {
    return Number.isInteger(value) && (value as number) >= 0;
}

function parseTally(source: string, folder: string, value: unknown): MutationTally {
    const { detected, undetected } = isJsonRecord(value) ? value : {};
    if (!isCount(detected) || !isCount(undetected)) {
        throw new Error(`${source} has no counts for ${folder}`);
    }
    return { detected, undetected };
}

/** Throws on a corrupt run: dropping it would silently shorten the series. */
export function parseMutationRun(runId: string, text: string): MutationRun {
    const source = `mutation run ${runId}`;
    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch (error) {
        throw new Error(`${source} is no JSON: ${(error as Error).message}`, { cause: error });
    }
    const {
        schemaVersion,
        runId: storedRunId,
        commit,
        contexts,
    } = isJsonRecord(value) ? value : {};
    if (schemaVersion !== 1) {
        throw new Error(`${source} has schema version ${String(schemaVersion)}, expected 1`);
    }
    if (storedRunId !== runId) {
        throw new Error(`${source} names run ${String(storedRunId)}`);
    }
    if (typeof commit !== "string" || commit.trim() === "") {
        throw new Error(`${source} names no commit`);
    }
    if (!isJsonRecord(contexts)) {
        throw new Error(`${source} has no contexts`);
    }
    return {
        schemaVersion: 1,
        runId,
        commit,
        contexts: Object.fromEntries(
            Object.entries(contexts).map(([folder, tally]) => [
                folder,
                parseTally(source, folder, tally),
            ]),
        ),
    };
}
