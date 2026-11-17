import { MERGE_SIDES, type MergeElement } from "./mergeResult";
import { isProcessReference } from "./referenceRules";

/** Everything inside the container in current or incoming: its children, their children, a lane's flow nodes and a participant's process. */
export function descendantsOf(
    containerId: string,
    elements: readonly MergeElement[],
): readonly string[] {
    const contents = contentsByContainer(elements);
    const found = new Set<string>();
    const pending = [containerId];
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
        for (const content of contents.get(next) ?? []) {
            if (content !== containerId && !found.has(content)) {
                found.add(content);
                pending.push(content);
            }
        }
    }
    return elements.map((element) => element.id).filter((id) => found.has(id));
}

// An activity holds its data associations and a pool its process too, but only these keep everything inside with one pick.
const PICK_CONTAINER_TYPES: ReadonlySet<string> = new Set([
    "bpmn:SubProcess",
    "bpmn:Transaction",
    "bpmn:AdHocSubProcess",
    "bpmn:Participant",
    "bpmn:Lane",
    "bpmn:Process",
    "bpmn:Collaboration",
]);

/** Every sub-process, pool, lane, process or collaboration something lies inside, in current or incoming. */
export function containersOf(elements: readonly MergeElement[]): ReadonlySet<string> {
    const contents = contentsByContainer(elements);
    return new Set(
        elements
            .filter(({ id, type }) => PICK_CONTAINER_TYPES.has(type) && contents.has(id))
            .map(({ id }) => id),
    );
}

function contentsByContainer(
    elements: readonly MergeElement[],
): ReadonlyMap<string, ReadonlySet<string>> {
    const contents = new Map<string, Set<string>>();
    const contain = (container: string, content: string) => {
        contents.set(container, (contents.get(container) ?? new Set()).add(content));
    };
    for (const element of elements) {
        for (const side of MERGE_SIDES) {
            const version = element.versions[side];
            if (version === undefined) {
                continue;
            }
            if (version.parent !== undefined) {
                contain(version.parent, element.id);
            }
            for (const lane of version.lanes) {
                contain(lane, element.id);
            }
            for (const reference of version.references) {
                if (isProcessReference(reference)) {
                    contain(element.id, reference.target);
                }
            }
        }
    }
    return contents;
}
