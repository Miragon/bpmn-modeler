import {
    type ModdleElement,
    idOf,
    isModdleElement,
    isType,
    moddleElements,
} from "@miragon/bpmn-modeler-diff";

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

/**
 * The processes the document draws from a collaboration's plane though no pool of that
 * collaboration names them: each process with lanes, and each only a participant without an id
 * names. Such a process has no plane of its own there, yet that plane draws it.
 */
export function processesDrawnWithoutAPool(definitions: ModdleElement): ReadonlySet<string> {
    const drawnCollaborations = moddleElements(definitions.diagrams)
        .map((diagram) => (diagram.plane as ModdleElement | undefined)?.bpmnElement)
        .filter(
            (owner): owner is ModdleElement =>
                isModdleElement(owner) && isType(owner, "bpmn:Collaboration"),
        );
    return new Set(
        drawnCollaborations.flatMap((collaboration) => {
            const pooled = new Set(poolsOf(collaboration).map(({ process }) => process));
            return [...rootsReachedFrom(collaboration)].filter(
                (root) => root !== collaboration.id && !pooled.has(root),
            );
        }),
    );
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
