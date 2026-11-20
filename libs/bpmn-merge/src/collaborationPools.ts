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

export function poolsOf(collaboration: ModdleElement): readonly Pool[] {
    return moddleElements(collaboration.participants).flatMap(({ id, processRef }) => {
        if (id === undefined) return [];
        const process = idOf(processRef);
        return [process === undefined ? { pool: id } : { pool: id, process }];
    });
}
