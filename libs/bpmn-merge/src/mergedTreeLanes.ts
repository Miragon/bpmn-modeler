import type { MergeResolution } from "./mergeDecisions";
import { type ElementVersion, type MergeResult, chosenVersionOf } from "./mergeResult";

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
        if (element.type === "bpmn:Lane" && chosenVersions.has(element.id)) {
            members.set(element.id, new Set());
        }
    }
    for (const [id, version] of chosenVersions) {
        for (const lane of version.lanes) members.get(lane)?.add(id);
    }
    return members;
}
