/**
 * Thin adapter around VS Code's workspace search and file-opening APIs.
 *
 * Used by {@link ImplementationMapService} to locate implementation files
 * and open them in the editor.
 */
import {
    FileSystemWatcher,
    GlobPattern,
    Position,
    Range,
    Selection,
    Uri,
    window,
    workspace,
} from "vscode";

/** A single content-search hit: file path and line number. */
export interface ContentSearchResult {
    /** Absolute file system path of the matching file. */
    readonly path: string;
    /** Zero-based line number of the match. */
    readonly line: number;
}

/**
 * Provides workspace file search, content search, file opening, and
 * file system watching capabilities backed by the VS Code API.
 */
export class VsCodeFileResolver {
    /**
     * Glob-based file search within the workspace.
     *
     * @param pattern Glob pattern (e.g. `"** /MyDelegate.java"`).
     * @param maxResults Maximum number of results to return.
     * @returns Array of absolute file paths matching the pattern.
     */
    async findFiles(pattern: GlobPattern, maxResults?: number): Promise<string[]> {
        const uris = await workspace.findFiles(pattern, "**/node_modules/**", maxResults);
        return uris.map((uri) => uri.fsPath);
    }

    /**
     * Content-based search across workspace files.
     *
     * Finds files matching the include glob, then reads each file to check
     * for the query string. Returns the first match found.
     *
     * @param query Text to search for in file contents.
     * @param includeGlob Optional glob to restrict which files are searched.
     * @returns Array of search results with file path and line number.
     */
    async searchInFiles(
        query: string,
        includeGlob?: string,
    ): Promise<ContentSearchResult[]> {
        const pattern = includeGlob ?? "**/*";
        const uris = await workspace.findFiles(pattern, "**/node_modules/**", 200);
        const results: ContentSearchResult[] = [];

        for (const uri of uris) {
            try {
                const doc = await workspace.openTextDocument(uri);
                const text = doc.getText();
                const idx = text.indexOf(query);
                if (idx !== -1) {
                    const pos = doc.positionAt(idx);
                    results.push({ path: uri.fsPath, line: pos.line });
                    // Return early after first match for performance.
                    break;
                }
            } catch {
                // File may be binary or too large — skip it.
            }
        }

        return results;
    }

    /**
     * Opens a file in the VS Code editor, optionally positioning the cursor
     * at a specific line.
     *
     * @param filePath Absolute file system path.
     * @param line Optional zero-based line number to navigate to.
     */
    async openFile(filePath: string, line?: number): Promise<void> {
        const doc = await workspace.openTextDocument(Uri.file(filePath));
        const editor = await window.showTextDocument(doc);
        if (line !== undefined) {
            const position = new Position(line, 0);
            editor.selection = new Selection(position, position);
            editor.revealRange(new Range(position, position));
        }
    }

    /**
     * Creates a file system watcher for the given glob pattern.
     *
     * @param glob Glob pattern to watch (e.g. `"** /*.java"`).
     * @returns A VS Code FileSystemWatcher disposable.
     */
    createWatcher(glob: GlobPattern): FileSystemWatcher {
        return workspace.createFileSystemWatcher(glob);
    }

    /**
     * Picks one item from a list using the VS Code quick-pick UI.
     *
     * @param items Label-value pairs to present.
     * @param title Title for the quick-pick dialog.
     * @returns The selected value, or `undefined` if cancelled.
     */
    async quickPick(
        items: Array<{ label: string; value: string }>,
        title: string,
    ): Promise<string | undefined> {
        const picked = await window.showQuickPick(
            items.map((i) => ({ label: i.label, description: i.value })),
            { title },
        );
        return picked?.description;
    }
}
