import {
    buildMerged,
    computeMerge,
    MergeDecisions,
    prepareMergeSources,
} from "@miragon/bpmn-modeler-merge";
import type {
    MergedDocument,
    MergeSide,
    MergeSources,
    MergeVersions,
} from "@miragon/bpmn-modeler-merge";

/** What taking one side for every open conflict did. */
export interface TakeSideOutcome {
    readonly picked: readonly string[];
    readonly blocked: readonly string[];
    readonly openConflicts: number;
}

/** A pick can reopen an automatic resolution, so the sweep runs again until nothing changes. */
const MAX_SWEEPS = 10;

/**
 * SPIKE (epic #2459 step 3, phase B): the merge of one conflicted file, from the three stage
 * texts to a built file. Stands in for #2454's `MergeSession` and #2456's `MergeBuildService`.
 */
export class MergeSession {
    private constructor(
        readonly fileUri: string,
        private readonly decisions: MergeDecisions,
        private readonly sources: MergeSources,
    ) {}

    static async start(fileUri: string, versions: MergeVersions): Promise<MergeSession> {
        const [result, sources] = await Promise.all([
            computeMerge(versions),
            prepareMergeSources(versions),
        ]);
        return new MergeSession(fileUri, MergeDecisions.from(result), sources);
    }

    get openConflictCount(): number {
        return this.decisions.openConflicts.length;
    }

    get openConflictIds(): readonly string[] {
        return this.decisions.openConflicts.map((conflict) => conflict.id);
    }

    takeSideForEveryOpenConflict(side: MergeSide): TakeSideOutcome {
        const picked: string[] = [];
        const blocked = new Set<string>();
        for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
            const open = this.decisions.openConflicts.filter(({ id }) => !blocked.has(id));
            if (open.length === 0) break;
            for (const { id } of open) {
                if (this.decisions.pick(id, side).applied) picked.push(id);
                else blocked.add(id);
            }
        }
        return { picked, blocked: [...blocked], openConflicts: this.openConflictCount };
    }

    /** Throws while a conflict is open or the result fails its checks. */
    build(): Promise<MergedDocument> {
        return buildMerged(this.sources, this.decisions);
    }
}
