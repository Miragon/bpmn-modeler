import { ShownCode } from "./addOnCatalog";

const DEFAULT_LIMIT = 16;

/** Room for this many builds a millisecond before a later process's first revision. */
const REVISIONS_PER_MILLISECOND = 1000;

/** From the clock, so a view kept across a respawn never names a revision the new process showed. */
export function firstRevisionOf(nowMilliseconds: number): number {
    return nowMilliseconds * REVISIONS_PER_MILLISECOND;
}

/**
 * What the last published revisions showed, so an allow is checked against
 * what the user saw. A view may answer a revision or two behind, never more.
 */
export class ShownRevisions {
    private constructor(
        private readonly limit: number,
        private readonly revisions: readonly (readonly [number, ReadonlyMap<string, ShownCode>])[],
    ) {}

    static empty(limit = DEFAULT_LIMIT): ShownRevisions {
        return new ShownRevisions(limit, []);
    }

    recorded(revision: number, shown: ReadonlyMap<string, ShownCode>): ShownRevisions {
        return new ShownRevisions(
            this.limit,
            [...this.revisions, [revision, shown] as const].slice(-this.limit),
        );
    }

    shownAt(revision: number): ReadonlyMap<string, ShownCode> | undefined {
        return this.revisions.find(([recorded]) => recorded === revision)?.[1];
    }

    latest(): ReadonlyMap<string, ShownCode> {
        return this.revisions[this.revisions.length - 1]?.[1] ?? new Map();
    }
}
