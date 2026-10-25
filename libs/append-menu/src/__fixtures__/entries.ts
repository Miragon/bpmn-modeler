import type { ElementTemplate } from "@miragon/bpmn-modeler-element-template-chooser";

import type { BpmnElementGroup, EnrichedTemplateEntry, PopupMenuEntry } from "../types";

interface TemplateEntryOptions {
    appliesTo?: string[];
    category?: { id: string; name: string };
    search?: PopupMenuEntry["search"];
    description?: string;
    template?: Partial<ElementTemplate>;
    presetId?: string;
}

export function templateEntry(
    id: string,
    label: string,
    options: TemplateEntryOptions = {},
): EnrichedTemplateEntry {
    return {
        id: `append.template-${id}`,
        entry: {
            label,
            description: options.description,
            search: options.search,
            action: () => {},
        },
        template: {
            id,
            name: label,
            appliesTo: options.appliesTo ?? [],
            category: options.category,
            properties: [],
            ...options.template,
        },
        presetId: options.presetId,
    };
}

export function group(
    id: string,
    name: string,
    entries: [entryId: string, label: string, extra?: Partial<PopupMenuEntry>][],
): BpmnElementGroup {
    return {
        id,
        name,
        entries: entries.map(([entryId, label, extra]) => ({
            id: entryId,
            entry: { label, action: () => {}, ...extra },
        })),
    };
}
