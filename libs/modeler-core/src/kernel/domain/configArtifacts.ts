import { relativeToRoot } from "./rootContainment";
import { joinWorkspacePath } from "./workspacePath";

/** A file the modeler generates for one document, kept under `<configFolder>/<area>/`. */
export interface ConfigArtifact {
    readonly workspaceRoot: string;
    readonly configFolder: string;
    readonly area: string;
    readonly documentPath: string;
    readonly suffix: string;
}

export function configFolderPath(
    directory: string,
    configFolder: string,
    ...entryPath: string[]
): string {
    return joinWorkspacePath(directory, configFolder, ...entryPath);
}

/**
 * Mirrors the document's path below the root, so two same-named documents in
 * different folders get one artifact each. Throws for a document that is not
 * below the root: its relative path would climb out of the area with `../`.
 */
export function configArtifactPath(artifact: ConfigArtifact): string {
    const { workspaceRoot, configFolder, area, documentPath, suffix } = artifact;
    const documentBelowRoot = relativeToRoot(documentPath, workspaceRoot);
    if (!documentBelowRoot) {
        throw new Error(
            `No config artifact for ${documentPath}: it is not below the workspace root ${workspaceRoot}.`,
        );
    }
    return configFolderPath(workspaceRoot, configFolder, area, `${documentBelowRoot}${suffix}`);
}
