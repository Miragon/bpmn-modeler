import { compareText, type Finding, parseFindings } from "./finding";
import type { FitnessFunction } from "./fitnessFunction";

export type Measurement =
    { readonly findings: readonly Finding[] } | { readonly unmeasurable: string };

export type SnapshotEntry = Measurement & { readonly version: number };

export interface Snapshot {
    readonly schemaVersion: 1;
    readonly commit: string;
    readonly entries: Readonly<Record<string, SnapshotEntry>>;
}

export function snapshotPath(commit: string): string {
    return `snapshots/${commit}.json`;
}

export function isMeasured(
    measurement: Measurement,
): measurement is { readonly findings: readonly Finding[] } {
    return "findings" in measurement;
}

export function emptySnapshot(commit: string): Snapshot {
    return { schemaVersion: 1, commit, entries: {} };
}

export function usableEntry(
    snapshot: Snapshot | undefined,
    fitnessFunction: Pick<FitnessFunction, "id" | "version">,
): SnapshotEntry | undefined {
    if (snapshot === undefined || !Object.hasOwn(snapshot.entries, fitnessFunction.id)) {
        return undefined;
    }
    const entry = snapshot.entries[fitnessFunction.id];
    return entry.version === fitnessFunction.version ? entry : undefined;
}

function normalizedEntry(entry: SnapshotEntry): SnapshotEntry {
    return isMeasured(entry)
        ? {
              version: entry.version,
              findings: entry.findings.map(({ key, path, line, message }) => ({
                  key,
                  path,
                  line,
                  message,
              })),
          }
        : { version: entry.version, unmeasurable: entry.unmeasurable };
}

function withSortedEntries(commit: string, entries: [string, SnapshotEntry][]): Snapshot {
    return {
        schemaVersion: 1,
        commit,
        entries: Object.fromEntries(
            entries
                .sort(([left], [right]) => compareText(left, right))
                .map(([id, entry]) => [id, normalizedEntry(entry)]),
        ),
    };
}

export function withEntry(snapshot: Snapshot, id: string, entry: SnapshotEntry): Snapshot {
    return withSortedEntries(snapshot.commit, [
        ...Object.entries(snapshot.entries).filter(([storedId]) => storedId !== id),
        [id, entry],
    ]);
}

export function serializeSnapshot(snapshot: Snapshot): string {
    return `${JSON.stringify(withSortedEntries(snapshot.commit, Object.entries(snapshot.entries)), null, 2)}\n`;
}

function parseEntry(source: string, value: unknown): SnapshotEntry {
    const { version, findings, unmeasurable } = (value ?? {}) as Record<string, unknown>;
    if (!Number.isInteger(version) || (version as number) < 1) {
        throw new Error(`${source} has no positive integer version`);
    }
    if (typeof unmeasurable === "string" && unmeasurable.trim() !== "") {
        return { version: version as number, unmeasurable };
    }
    return { version: version as number, findings: parseFindings(source, findings) };
}

/** Throws on a corrupt snapshot: silently dropping it would turn its findings into new ones. */
export function parseSnapshot(commit: string, text: string): Snapshot {
    const source = `snapshot ${commit}`;
    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch (error) {
        throw new Error(`${source} is no JSON: ${(error as Error).message}`, { cause: error });
    }
    const {
        schemaVersion,
        commit: storedCommit,
        entries,
    } = (value ?? {}) as Record<string, unknown>;
    if (schemaVersion !== 1) {
        throw new Error(`${source} has schema version ${String(schemaVersion)}, expected 1`);
    }
    if (storedCommit !== commit) {
        throw new Error(`${source} names commit ${String(storedCommit)}`);
    }
    if (typeof entries !== "object" || entries === null || Array.isArray(entries)) {
        throw new Error(`${source} has no entries`);
    }
    return withSortedEntries(
        commit,
        Object.entries(entries).map(([id, entry]) => [
            id,
            parseEntry(`${source} entry ${id}`, entry),
        ]),
    );
}
