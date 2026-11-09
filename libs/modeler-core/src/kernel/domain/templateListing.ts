import type { Engine } from "@miragon/bpmn-modeler-types";

/** One template as the template owner read it. */
export interface ListedTemplate {
    readonly id?: string;
    readonly name?: string;
    readonly version?: number;
    readonly engine?: Engine;
}

export type TemplateFileReading =
    | { readonly kind: "read"; readonly templates: readonly ListedTemplate[] }
    | { readonly kind: "unreadable"; readonly reason: string };

/** One template file as the template owner read it. */
export interface TemplateFileListing {
    readonly path: string;
    readonly reading: TemplateFileReading;
}

export interface FolderTemplateFileListing extends TemplateFileListing {
    /** The config folder whose templates folder holds the file. */
    readonly sourceDir: string;
}
