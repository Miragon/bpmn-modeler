import { type ModdleElement, idOf, isType, moddleElements } from "@miragon/bpmn-modeler-diff";

/** A collaboration and a process one of its participants names: one root plane draws them. */
export type CollaborationProcess = readonly [collaboration: string, process: string];

/** A participant a pool draws, with the process it names, if any. */
interface Pool {
    readonly pool: string;
    readonly process?: string;
}

/** Each collaboration with the processes its pools name, in document order. */
export function collaborationProcessesOf(
    definitions: ModdleElement,
): readonly CollaborationProcess[] {
    return moddleElements(definitions.rootElements)
        .filter((root) => isType(root, "bpmn:Collaboration"))
        .flatMap((collaboration) => {
            const { id } = collaboration;
            if (id === undefined) return [];
            return poolsOf(collaboration).flatMap(({ process }) =>
                process === undefined ? [] : [[id, process] as const],
            );
        });
}

/**
 * The processes bpmn-js draws from a collaboration's plane: each one a participant names, with an id or
 * without, and every process with lanes, whose lanes that plane draws even without a pool. Wider than
 * `collaborationProcessesOf`, which names only the processes that share the collaboration's plane slot.
 */
export function processesReachedFrom(
    collaboration: ModdleElement,
    rootElements: unknown,
): ReadonlySet<string> {
    const named = moddleElements(collaboration.participants).map(({ processRef }) =>
        idOf(processRef),
    );
    const withLanes = moddleElements(rootElements)
        .filter((root) => moddleElements(root.laneSets).length > 0)
        .map(({ id }) => id);
    return new Set([...named, ...withLanes].filter((id) => id !== undefined));
}

export function poolsOf(collaboration: ModdleElement): readonly Pool[] {
    return moddleElements(collaboration.participants).flatMap(({ id, processRef }) => {
        if (id === undefined) return [];
        const process = idOf(processRef);
        return [process === undefined ? { pool: id } : { pool: id, process }];
    });
}
