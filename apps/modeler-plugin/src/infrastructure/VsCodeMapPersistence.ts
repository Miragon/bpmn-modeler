/**
 * Infrastructure adapter for reading and writing persisted implementation maps.
 *
 * Uses the VS Code workspace filesystem API to persist maps as formatted JSON
 * files under the config folder.
 */
import { Uri, workspace } from "vscode";

import { PersistedProcessMap } from "../domain/persistedMap";

const fs = workspace.fs;

/**
 * Reads and writes {@link PersistedProcessMap} JSON files via the VS Code
 * workspace filesystem API.
 */
export class VsCodeMapPersistence {
    /**
     * Writes the map as formatted JSON.
     *
     * Creates parent directories automatically (VS Code `workspace.fs.writeFile`
     * creates intermediate directories).
     *
     * @param filePath Absolute path to the JSON file.
     * @param map The persisted process map to write.
     */
    async writeMap(filePath: string, map: PersistedProcessMap): Promise<void> {
        const content = JSON.stringify(map, null, 2) + "\n";
        const encoded = Buffer.from(content, "utf-8");
        await fs.writeFile(Uri.file(filePath), encoded);
    }

    /**
     * Reads and deserialises a persisted process map.
     *
     * @param filePath Absolute path to the JSON file.
     * @returns The deserialised map, or `undefined` if the file does not exist.
     */
    async readMap(filePath: string): Promise<PersistedProcessMap | undefined> {
        try {
            const buffer = await fs.readFile(Uri.file(filePath));
            const content = buffer.toString();
            return JSON.parse(content) as PersistedProcessMap;
        } catch {
            return undefined;
        }
    }
}

/**
 * Converts an absolute file path to a workspace-relative path.
 *
 * @param absolutePath Absolute file system path.
 * @param workspaceRoot Absolute path to the workspace root.
 * @returns The workspace-relative path (without leading separator).
 */
export function toRelativePath(absolutePath: string, workspaceRoot: string): string {
    if (absolutePath.startsWith(workspaceRoot + "/")) {
        return absolutePath.slice(workspaceRoot.length + 1);
    }
    return absolutePath;
}

/**
 * Converts a workspace-relative path to an absolute path.
 *
 * @param relativePath Workspace-relative path.
 * @param workspaceRoot Absolute path to the workspace root.
 * @returns The absolute file system path.
 */
export function toAbsolutePath(relativePath: string, workspaceRoot: string): string {
    if (relativePath.startsWith("/")) {
        return relativePath;
    }
    return `${workspaceRoot}/${relativePath}`;
}
