import {
    ELEMENT_TEMPLATE_FOLDER_NAME,
    type ElementTemplate,
    type ElementTemplateRef,
    elementTemplateRefKey,
    elementTemplateRefOf,
    elementTemplateVersionOf,
    templateEngineOf,
    templatesOfFile,
} from "@miragon/bpmn-modeler-types";

import { configFolderPath } from "../../../kernel/domain/configArtifacts";
import { ListedTemplate, TemplateFileReading } from "../../../kernel/domain/templateListing";
import {
    isTemplateOffered,
    TemplatePreferencesByScope,
    TemplateSourceRef,
} from "../../../kernel/domain/templatePreferences";

/** The templates parsed from one source: a template directory or one registered marketplace. */
export interface ElementTemplateSource {
    readonly fileCount: number;
    readonly templates: readonly ElementTemplate[];
    /** Where the user's switches for it live; absent for a source that has none. */
    readonly source?: TemplateSourceRef;
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

/**
 * The templates the user's switches keep out of new choices. The page tells
 * templates apart only by id and version, so a ref is hidden only when every
 * loaded copy of it comes from a source that does not offer it; a source
 * without switches offers all it holds. Ordered by {@link elementTemplateRefKey},
 * so equal sets compare equal.
 */
export function hiddenElementTemplateRefs(
    sources: readonly ElementTemplateSource[],
    preferences: TemplatePreferencesByScope,
): ElementTemplateRef[] {
    const offeredByKey = new Map<string, { ref: ElementTemplateRef; offered: boolean }>();
    for (const { templates, source } of sources) {
        for (const template of templates) {
            const ref = elementTemplateRefOf(template);
            if (ref === undefined) continue;
            const key = elementTemplateRefKey(ref);
            const offered = source === undefined || isTemplateOffered(ref.id, source, preferences);
            offeredByKey.set(key, { ref, offered: offered || !!offeredByKey.get(key)?.offered });
        }
    }
    return [...offeredByKey.keys()].sort().flatMap((key) => {
        const { ref, offered } = offeredByKey.get(key)!;
        return offered ? [] : [ref];
    });
}

/** A blank file holds no templates yet: "New Element Template" creates one empty. */
export function templatesOfFileText(text: string): ElementTemplate[] {
    return text.trim() === "" ? [] : templatesOfFile(JSON.parse(text));
}

/** What the add-on catalog lists of one template file, read by the loader's rule. */
export function templateFileReadingOf(text: string): TemplateFileReading {
    let templates: ElementTemplate[];
    try {
        templates = templatesOfFileText(text);
    } catch (error) {
        return { kind: "unreadable", reason: (error as Error).message };
    }
    return {
        kind: "read",
        templates: templates.map((template) => listedTemplateOf(template, templates)),
    };
}

export function templatesDirOf(dir: string, configFolder: string): string {
    return configFolderPath(dir, configFolder, ELEMENT_TEMPLATE_FOLDER_NAME);
}

// Read as the modeler indexes templates, so a ref built from a listing names the same template.
function listedTemplateOf(template: unknown, templates: readonly unknown[]): ListedTemplate {
    const id = elementTemplateRefOf(template)?.id;
    const version = elementTemplateVersionOf(template);
    const { name } = (typeof template === "object" && template !== null ? template : {}) as {
        name?: unknown;
    };
    const engine = templateEngineOf(template, templates);
    return {
        ...(id !== undefined && { id }),
        ...(typeof name === "string" && { name }),
        ...(version !== undefined && { version }),
        ...(engine && { engine }),
    };
}
