import {
    ELEMENT_TEMPLATE_FOLDER_NAME,
    type ElementTemplate,
    templateEngineOf,
    templatesOfFile,
} from "@miragon/bpmn-modeler-types";

import { configFolderPath } from "../../../kernel/domain/configArtifacts";
import { ListedTemplate, TemplateFileReading } from "../../../kernel/domain/templateListing";
import { parentWorkspacePath } from "../../../kernel/domain/workspacePath";

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

export function configFolderOfTemplatesDir(templatesDir: string): string {
    return parentWorkspacePath(templatesDir) ?? templatesDir;
}

function listedTemplateOf(template: unknown, templates: readonly unknown[]): ListedTemplate {
    const { id, name, version } = (
        typeof template === "object" && template !== null ? template : {}
    ) as Record<string, unknown>;
    const engine = templateEngineOf(template, templates);
    return {
        ...(typeof id === "string" && { id }),
        ...(typeof name === "string" && { name }),
        ...(typeof version === "number" && { version }),
        ...(engine && { engine }),
    };
}
