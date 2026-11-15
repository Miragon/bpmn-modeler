import {
    computeMerge,
    MergeDecisions,
    mergeNavigationOrder,
    prepareMergeSources,
} from "@miragon/bpmn-modeler-merge";

import { ResolvableStages } from "../domain/conflictReading";
import { MergeSession } from "./MergeSessionStore";

/** What a merge view holds of the merge of its stages. */
export type MergeOfStages = Pick<MergeSession, "decisions" | "sources" | "navigationOrder">;

/** Merges Git's stages; rejects, naming the side, a stage the merge cannot read. */
export async function mergeStages(stages: ResolvableStages): Promise<MergeOfStages> {
    const [result, sources] = await Promise.all([
        computeMerge(stages),
        prepareMergeSources(stages),
    ]);
    return {
        decisions: MergeDecisions.from(result),
        sources,
        navigationOrder: await mergeNavigationOrder(result, sources),
    };
}
