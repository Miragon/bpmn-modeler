import type { MergeResolution } from "../../decide/domain/mergeDecisions";
import {
    type ElementVersion,
    type MergeResult,
    chosenVersionOf,
    isLane,
} from "../../kernel/domain/mergeResult";

/** Every lane of the result with the nodes its `flowNodeRef` must list: lane membership is each node's decision. */
export function laneMembersOf(
    result: MergeResult,
    resolution: MergeResolution,
): Map<string, Set<string>> {
    const chosenVersions = new Map<string, ElementVersion>();
    for (const element of result.elements) {
        const version = chosenVersionOf(element, (id) => resolution.elements[id]);
        if (version) chosenVersions.set(element.id, version);
    }
    const members = new Map<string, Set<string>>();
    for (const element of result.elements) {
        if (isLane(element) && chosenVersions.has(element.id)) {
            members.set(element.id, new Set());
        }
    }
    for (const [id, version] of chosenVersions) {
        for (const lane of version.lanes) members.get(lane)?.add(id);
    }
    return members;
}
