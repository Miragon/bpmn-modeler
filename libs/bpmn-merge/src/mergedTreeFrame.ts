import {
    type ModdleElement,
    isModdleElement,
    ownAttributeEntries,
} from "@miragon/bpmn-modeler-diff";

import type { BuildNoteContent } from "./buildNotes";
import type { MergeModdle } from "./engineModdle";

/** What a file holds outside its elements: the definitions' attributes, extension elements and imports. */
export interface DocumentFrame {
    /** By name, namespace declarations left out: the build declares every namespace in use. */
    readonly attributes: Readonly<Record<string, string>>;
    readonly extensionElements: string;
    readonly imports: string;
}

export interface FrameMerge {
    /** The attributes the result takes from incoming; undefined removes one. */
    readonly takenFromIncoming: Readonly<Record<string, string | undefined>>;
    readonly notes: readonly BuildNoteContent[];
}

const FRAME_CONTENTS = ["extensionElements", "imports"] as const;

/**
 * Current's frame with each attribute only incoming changed taken from
 * incoming. An attribute both changed differently, and extension elements or
 * imports incoming changed, stay current's and are named. Without a base
 * every difference counts as changed by both.
 */
export function mergeFrames(frames: {
    readonly base?: DocumentFrame;
    readonly current: DocumentFrame;
    readonly incoming: DocumentFrame;
}): FrameMerge {
    const { base, current, incoming } = frames;
    const takenFromIncoming: Record<string, string | undefined> = {};
    const notes: BuildNoteContent[] = [];
    const names = new Set([
        ...Object.keys(current.attributes),
        ...Object.keys(incoming.attributes),
        ...Object.keys(base?.attributes ?? {}),
    ]);
    for (const attribute of names) {
        const incomingValue = incoming.attributes[attribute];
        if (current.attributes[attribute] === incomingValue) continue;
        const baseValue = base?.attributes[attribute];
        if (base !== undefined && current.attributes[attribute] === baseValue) {
            takenFromIncoming[attribute] = incomingValue;
        } else if (base === undefined || incomingValue !== baseValue) {
            notes.push({ kind: "frameDiffers", attribute });
        }
    }
    for (const content of FRAME_CONTENTS) {
        const changedByIncoming = incoming[content] !== (base ?? current)[content];
        if (changedByIncoming && incoming[content] !== current[content]) {
            notes.push({ kind: "frameDiffers", attribute: content });
        }
    }
    return { takenFromIncoming, notes };
}

export async function frameOf(mergeModdle: MergeModdle, xml: string): Promise<DocumentFrame> {
    return frameOfDefinitions(mergeModdle, (await mergeModdle.moddle.fromXML(xml)).rootElement);
}

export async function frameOfDefinitions(
    { moddle }: MergeModdle,
    definitions: ModdleElement,
): Promise<DocumentFrame> {
    const attributes: Record<string, string> = {};
    for (const { property, name, value } of ownAttributeEntries(definitions)) {
        // applyFrame writes a typed attribute back by its property's name.
        if (property?.isReference !== true) attributes[property?.name ?? name] = value;
    }
    const textOf = async (value: unknown) => {
        const elements = (Array.isArray(value) ? value : [value]).filter(isModdleElement);
        const texts = await Promise.all(
            elements.map(async (element) => (await moddle.toXML(element)).xml),
        );
        return texts.join("\n");
    };
    return {
        attributes,
        extensionElements: await textOf(definitions.extensionElements),
        imports: await textOf(definitions.imports),
    };
}

export function applyFrame(
    definitions: ModdleElement,
    takenFromIncoming: Readonly<Record<string, string | undefined>>,
): void {
    const typedAttributes = typedAttributesOf(definitions);
    for (const [name, value] of Object.entries(takenFromIncoming)) {
        const holder = typedAttributes.includes(name) ? definitions : (definitions.$attrs ??= {});
        if (value === undefined) delete holder[name];
        else holder[name] = value;
    }
}

/** The definitions' attributes its descriptors type, an engine's extension of `bpmn:Definitions` included; the rest are in `$attrs`. */
function typedAttributesOf(definitions: ModdleElement): string[] {
    return (definitions.$descriptor.properties ?? [])
        .filter((property) => property.isAttr === true && property.isReference !== true)
        .map((property) => property.name);
}
