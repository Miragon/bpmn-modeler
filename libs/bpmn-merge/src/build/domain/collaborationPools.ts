import {
    type ModdleElement,
    idOf,
    isType,
    moddleElements,
} from "@miragon/bpmn-modeler-diff/domain";

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
 * The roots bpmn-js draws from a root plane, its owner included. A process's plane draws only that
 * process; a collaboration's plane also draws each process a participant names, with an id or
 * without, and every process with lanes, whose lanes it draws even without a pool. Wider than
 * `collaborationProcessesOf`, which names only the processes that share the collaboration's plane slot.
 */
export function rootsReachedFrom(rootPlaneOwner: ModdleElement): ReadonlySet<string> {
    const reached = isType(rootPlaneOwner, "bpmn:Collaboration")
        ? processesReachedFrom(rootPlaneOwner)
        : [];
    return new Set([rootPlaneOwner.id, ...reached].filter((id) => id !== undefined));
}

function processesReachedFrom(collaboration: ModdleElement): readonly (string | undefined)[] {
    const named = moddleElements(collaboration.participants).map(({ processRef }) =>
        idOf(processRef),
    );
    const definitions = collaboration.$parent as ModdleElement | undefined;
    const withLanes = moddleElements(definitions?.rootElements)
        .filter((root) => moddleElements(root.laneSets).length > 0)
        .map(({ id }) => id);
    return [...named, ...withLanes];
}

export function poolsOf(collaboration: ModdleElement): readonly Pool[] {
    return moddleElements(collaboration.participants).flatMap(({ id, processRef }) => {
        if (id === undefined) return [];
        const process = idOf(processRef);
        return [process === undefined ? { pool: id } : { pool: id, process }];
    });
}
