import {
    type ModdleElement,
    isModdleElement,
    ownAttributeEntries,
} from "@miragon/bpmn-modeler-diff";

import type { DocumentFrame, MergeModdle } from "../domain/mergeSources";

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
