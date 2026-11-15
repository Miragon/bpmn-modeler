import { MergeSession } from "../diff/service/MergeSessionStore";
import { MergeOfStages, mergeStages } from "../diff/service/mergeStages";

/** What Git and the opener said of a merge view, without the merge of its stages. */
export type MergeSessionFacts = Omit<MergeSession, keyof MergeOfStages>;

/** A merge view's session as the opener builds it: the facts plus the merge of their stages. */
export async function mergeSessionOf(facts: MergeSessionFacts): Promise<MergeSession> {
    return { ...facts, ...(await mergeStages(facts.stages)) };
}
