import { relativeToRoot } from "./rootContainment";
import { joinWorkspacePath, parentWorkspacePath } from "./workspacePath";

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

/** The folder whose config folder `configDir` is, the inverse of {@link configFolderPath}; `undefined` when it is no folder's. */
export function folderOfConfigFolder(configDir: string, configFolder: string): string | undefined {
    for (
        let folder = parentWorkspacePath(configDir);
        folder !== undefined;
        folder = parentWorkspacePath(folder)
    ) {
        // `""` names the same folder, whatever trailing slash a `.camunda/` setting leaves.
        if (relativeToRoot(configDir, configFolderPath(folder, configFolder)) === "") {
            return folder;
        }
    }
    return undefined;
}

export interface ConfigArtifactLocation {
    readonly path: string;
    /** The document's path below the root, which `path` mirrors. */
    readonly documentBelowRoot: string;
}

/**
 * Mirrors the document's path below the root, so two same-named documents in
 * different folders get one artifact each. Throws for a document that is not
 * below the root: its relative path would climb out of the area with `../`.
 */
export function configArtifactLocation(artifact: ConfigArtifact): ConfigArtifactLocation {
    const { workspaceRoot, configFolder, area, documentPath, suffix } = artifact;
    const documentBelowRoot = relativeToRoot(documentPath, workspaceRoot);
    if (!documentBelowRoot) {
        throw new Error(
            `No config artifact for ${documentPath}: it is not below the workspace root ${workspaceRoot}.`,
        );
    }
    return {
        path: configFolderPath(workspaceRoot, configFolder, area, `${documentBelowRoot}${suffix}`),
        documentBelowRoot,
    };
}
