import { type ElementTemplate, templatesOfFile } from "@miragon/bpmn-modeler-types";

/** The templates parsed from one source: a template directory or the marketplace cache. */
export interface ElementTemplateSource {
    readonly fileCount: number;
    readonly templates: readonly ElementTemplate[];
}

export const EMPTY_TEMPLATE_SOURCE: ElementTemplateSource = { fileCount: 0, templates: [] };

/** Templates of all sources sorted by name; equal names keep their source order. */
export function mergeElementTemplates(
    sources: readonly ElementTemplateSource[],
): ElementTemplate[] {
    return sources
        .flatMap((source) => source.templates)
        .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
}

/** A blank file holds no templates yet: "New Element Template" creates one empty. */
export function templatesOfFileText(text: string): ElementTemplate[] {
    return text.trim() === "" ? [] : templatesOfFile(JSON.parse(text));
}
