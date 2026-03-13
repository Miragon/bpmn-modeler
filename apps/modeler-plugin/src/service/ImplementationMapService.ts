/**
 * Core service that owns the per-editor implementation lookup map.
 *
 * After each BPMN sync, {@link update} re-parses the XML, diffs the
 * implementation references against the current map, and resolves new or
 * changed entries to workspace file paths. The resulting map is sent to
 * the webview as an {@link ImplementationMapQuery}.
 */
import { posix } from "path";
import { Disposable } from "vscode";

import { ImplementationLinkEntry, ImplementationMapQuery } from "@bpmn-modeler/shared";

import {
    ImplementationEntry,
    ImplementationKind,
    RawImplementationRef,
} from "../domain/implementation";
import { EditorStore } from "../infrastructure/EditorStore";
import { VsCodeFileResolver } from "../infrastructure/VsCodeFileResolver";
import { VsCodeUI } from "../infrastructure/VsCodeUI";
import { extractImplementationRefs } from "./bpmnXmlParser";

/**
 * Manages implementation-link maps for all open BPMN editors.
 *
 * Responsibilities:
 * - Builds and maintains `Map<activityId, ImplementationEntry>` per editor
 * - Resolves identifiers to workspace file paths
 * - Watches the file system for renames/deletes of resolved files
 * - Sends simplified map data to the webview for overlay display
 * - Handles navigation requests by opening the resolved file
 */
export class ImplementationMapService {
    /** Per-editor lookup maps: editorId → (activityId → ImplementationEntry). */
    private readonly maps: Map<string, Map<string, ImplementationEntry>> = new Map();

    /** File system watcher disposables per editor. */
    private readonly watchers: Map<string, Disposable[]> = new Map();

    /** Tracks all resolved file paths per editor for quick invalidation. */
    private readonly lastXml: Map<string, string> = new Map();

    /**
     * @param editorStore Central registry for open editor panels and messaging.
     * @param fileResolver VS Code file search and open adapter.
     * @param vsUI User-facing message and logging helper.
     */
    constructor(
        private readonly editorStore: EditorStore,
        private readonly fileResolver: VsCodeFileResolver,
        private readonly vsUI: VsCodeUI,
    ) {}

    /**
     * Re-parses the BPMN XML, diffs against the current map, resolves new or
     * changed entries, and sends the updated map to the webview.
     *
     * @param editorId Document URI path of the target editor.
     * @param bpmnXml Current BPMN XML content.
     */
    async update(editorId: string, bpmnXml: string): Promise<void> {
        // Skip if the XML has not changed since the last update.
        if (this.lastXml.get(editorId) === bpmnXml) {
            return;
        }
        this.lastXml.set(editorId, bpmnXml);

        try {
            const currentRefs = extractImplementationRefs(bpmnXml);
            const existingMap = this.maps.get(editorId) ?? new Map();
            const newMap = new Map<string, ImplementationEntry>();

            for (const ref of currentRefs) {
                const existing = existingMap.get(ref.activityId);

                if (existing && existing.identifier === ref.identifier) {
                    // Unchanged — keep existing resolution.
                    newMap.set(ref.activityId, existing);
                } else {
                    // New or changed — resolve to file path.
                    const entry = await this.resolve(ref);
                    newMap.set(ref.activityId, entry);
                }
            }

            this.maps.set(editorId, newMap);
            await this.sendMapToWebview(editorId, newMap);
            this.updateWatchers(editorId, newMap);
        } catch (error) {
            this.vsUI.logError(
                new Error(`Failed to update implementation map: ${(error as Error).message}`),
            );
        }
    }

    /**
     * Opens the implementation file for the given activity in the VS Code editor.
     *
     * If the entry has multiple candidate files, shows a quick-pick dialog.
     *
     * @param editorId Document URI path of the requesting editor.
     * @param activityId BPMN element ID whose implementation file to open.
     */
    async navigate(editorId: string, activityId: string): Promise<void> {
        const map = this.maps.get(editorId);
        const entry = map?.get(activityId);

        if (!entry) {
            this.vsUI.showInfo("No implementation reference found for this element.");
            return;
        }

        if (!entry.resolved || !entry.filePath) {
            this.vsUI.showInfo(
                `Implementation "${entry.identifier}" could not be resolved to a file.`,
            );
            return;
        }

        try {
            await this.fileResolver.openFile(entry.filePath);
        } catch (error) {
            this.vsUI.showError(
                `Failed to open implementation file: ${(error as Error).message}`,
            );
        }
    }

    /**
     * Disposes all watchers and map state for a closed editor.
     *
     * @param editorId Document URI path of the editor being closed.
     */
    dispose(editorId: string): void {
        this.maps.delete(editorId);
        this.lastXml.delete(editorId);
        const disposables = this.watchers.get(editorId);
        if (disposables) {
            for (const d of disposables) {
                d.dispose();
            }
            this.watchers.delete(editorId);
        }
    }

    // ─── Private resolution strategies ──────────────────────────────────────

    /**
     * Resolves a raw implementation reference to an {@link ImplementationEntry}
     * by searching the workspace for matching files.
     *
     * @param ref The raw reference extracted from BPMN XML.
     * @returns A fully populated entry with resolution status.
     */
    private async resolve(ref: RawImplementationRef): Promise<ImplementationEntry> {
        const label = this.computeLabel(ref.kind, ref.identifier);
        let filePath: string | undefined;

        try {
            filePath = await this.resolveFilePath(ref.kind, ref.identifier);
        } catch (error) {
            this.vsUI.logWarning(
                `Could not resolve ${ref.kind} "${ref.identifier}": ${(error as Error).message}`,
            );
        }

        return {
            kind: ref.kind,
            identifier: ref.identifier,
            filePath,
            label,
            resolved: filePath !== undefined,
        };
    }

    /**
     * Attempts to find a workspace file for the given implementation reference.
     *
     * @param kind The implementation kind.
     * @param identifier The raw identifier value.
     * @returns Absolute file path, or `undefined` if no match found.
     */
    private async resolveFilePath(
        kind: ImplementationKind,
        identifier: string,
    ): Promise<string | undefined> {
        switch (kind) {
            case "javaClass":
                return this.resolveJavaClass(identifier);
            case "delegateExpression":
                return this.resolveDelegateExpression(identifier);
            case "expression":
                return this.resolveExpression(identifier);
            case "externalTask":
                return this.resolveContentSearch(identifier);
            case "jobType":
                return this.resolveContentSearch(identifier);
        }
    }

    /**
     * Resolves a fully-qualified Java class name to a source file.
     *
     * Converts the FQN to a glob path pattern (e.g. `com.example.Foo` →
     * `** /com/example/Foo.{java,kt,groovy,scala}`). Falls back to searching
     * by simple class name if the full path yields no results.
     *
     * @param fqn Fully-qualified class name.
     * @returns Absolute file path, or `undefined`.
     */
    private async resolveJavaClass(fqn: string): Promise<string | undefined> {
        const pathFromFqn = fqn.replace(/\./g, "/");
        const extensions = "{java,kt,groovy,scala}";

        // Try full path first.
        const fullGlob = `**/${pathFromFqn}.${extensions}`;
        let results = await this.fileResolver.findFiles(fullGlob, 1);
        if (results.length > 0) {
            return results[0];
        }

        // Fallback: simple class name only.
        const simpleName = fqn.split(".").pop();
        if (simpleName) {
            const simpleGlob = `**/${simpleName}.${extensions}`;
            results = await this.fileResolver.findFiles(simpleGlob, 1);
            if (results.length > 0) {
                return results[0];
            }
        }

        return undefined;
    }

    /**
     * Resolves a delegate expression (e.g. `${myBean}`) to a source file.
     *
     * Extracts the bean name, capitalizes the first letter, and searches
     * for a matching class file. Falls back to content search.
     *
     * @param expr The delegate expression string.
     * @returns Absolute file path, or `undefined`.
     */
    private async resolveDelegateExpression(expr: string): Promise<string | undefined> {
        const beanName = extractBeanName(expr);
        if (!beanName) return undefined;

        const className = beanName.charAt(0).toUpperCase() + beanName.slice(1);
        const extensions = "{java,kt}";
        const glob = `**/${className}.${extensions}`;

        const results = await this.fileResolver.findFiles(glob, 1);
        if (results.length > 0) {
            return results[0];
        }

        // Fallback: content search for the bean name.
        return this.resolveContentSearch(beanName);
    }

    /**
     * Resolves an expression (e.g. `${svc.run()}`) to a source file.
     *
     * Extracts the bean name before the first `.` and resolves like a
     * delegate expression.
     *
     * @param expr The expression string.
     * @returns Absolute file path, or `undefined`.
     */
    private async resolveExpression(expr: string): Promise<string | undefined> {
        const beanName = extractBeanName(expr);
        if (!beanName) return undefined;

        // Take the part before the first dot as the bean name.
        const rootBean = beanName.split(".")[0];
        const className = rootBean.charAt(0).toUpperCase() + rootBean.slice(1);
        const extensions = "{java,kt}";
        const glob = `**/${className}.${extensions}`;

        const results = await this.fileResolver.findFiles(glob, 1);
        if (results.length > 0) {
            return results[0];
        }

        return this.resolveContentSearch(rootBean);
    }

    /**
     * Resolves an identifier by searching file contents for the string.
     *
     * Used for external task topics and Zeebe job types where there is no
     * direct filename convention.
     *
     * @param query The string to search for in workspace files.
     * @returns Absolute file path of the first match, or `undefined`.
     */
    private async resolveContentSearch(query: string): Promise<string | undefined> {
        const includeGlob = "**/*.{java,kt,groovy,scala,ts,js,py}";
        const results = await this.fileResolver.searchInFiles(
            `"${query}"`,
            includeGlob,
        );
        if (results.length > 0) {
            return results[0].path;
        }
        return undefined;
    }

    /**
     * Computes a human-readable label for the overlay from the raw identifier.
     *
     * @param kind The implementation kind.
     * @param identifier The raw identifier value.
     * @returns A short display label.
     */
    private computeLabel(kind: ImplementationKind, identifier: string): string {
        switch (kind) {
            case "javaClass": {
                // Show simple class name: "com.example.Foo" → "Foo"
                const parts = identifier.split(".");
                return parts[parts.length - 1];
            }
            case "delegateExpression":
            case "expression": {
                const bean = extractBeanName(identifier);
                return bean ?? identifier;
            }
            case "externalTask":
            case "jobType":
                return identifier;
        }
    }

    // ─── Webview communication ──────────────────────────────────────────────

    /**
     * Converts the internal map to the simplified format and posts it to
     * the webview.
     *
     * @param editorId Target editor.
     * @param map The current implementation map.
     */
    private async sendMapToWebview(
        editorId: string,
        map: Map<string, ImplementationEntry>,
    ): Promise<void> {
        const entries: Record<string, ImplementationLinkEntry> = {};
        for (const [activityId, entry] of map) {
            entries[activityId] = { label: entry.label, resolved: entry.resolved };
        }

        try {
            await this.editorStore.postMessage(
                editorId,
                new ImplementationMapQuery(entries),
            );
        } catch {
            // Editor may be hidden — silently ignore.
        }
    }

    // ─── File system watchers ───────────────────────────────────────────────

    /**
     * Sets up file system watchers for all resolved file paths in the map.
     *
     * On file change/delete/create events, triggers re-resolution of affected
     * entries.
     *
     * @param editorId Target editor.
     * @param map The current implementation map.
     */
    private updateWatchers(
        editorId: string,
        map: Map<string, ImplementationEntry>,
    ): void {
        // Dispose existing watchers.
        const existing = this.watchers.get(editorId);
        if (existing) {
            for (const d of existing) {
                d.dispose();
            }
        }

        const disposables: Disposable[] = [];
        const watchedDirs = new Set<string>();

        for (const entry of map.values()) {
            if (entry.filePath) {
                const dir = posix.dirname(entry.filePath);
                if (!watchedDirs.has(dir)) {
                    watchedDirs.add(dir);
                    const watcher = this.fileResolver.createWatcher(
                        `${dir}/**/*.{java,kt,groovy,scala,ts,js,py}`,
                    );

                    const handler = () => {
                        // Invalidate the XML cache so the next update re-resolves.
                        this.lastXml.delete(editorId);
                        const xml = this.lastXml.get(editorId);
                        if (!xml) {
                            // Force re-resolution by re-parsing with the entries we have.
                            this.reResolveUnresolved(editorId);
                        }
                    };

                    watcher.onDidChange(handler);
                    watcher.onDidDelete(handler);
                    watcher.onDidCreate(handler);

                    disposables.push(watcher);
                }
            }
        }

        this.watchers.set(editorId, disposables);
    }

    /**
     * Re-resolves all entries in the map for the given editor.
     *
     * Called when a file system event is detected that may have invalidated
     * previously resolved paths.
     *
     * @param editorId Target editor.
     */
    private async reResolveUnresolved(editorId: string): Promise<void> {
        const map = this.maps.get(editorId);
        if (!map) return;

        let changed = false;
        for (const [activityId, entry] of map) {
            const filePath = await this.resolveFilePath(entry.kind, entry.identifier);
            const resolved = filePath !== undefined;

            if (entry.resolved !== resolved || entry.filePath !== filePath) {
                map.set(activityId, { ...entry, filePath, resolved });
                changed = true;
            }
        }

        if (changed) {
            await this.sendMapToWebview(editorId, map);
        }
    }
}

// ─── Utility functions ──────────────────────────────────────────────────────

/**
 * Extracts the bean name from a `${...}` expression.
 *
 * @param expr Expression string like `"${myBean}"` or `"${svc.run()}"`.
 * @returns The inner content without `${ }`, or `undefined` if not an expression.
 */
function extractBeanName(expr: string): string | undefined {
    const match = expr.match(/^\$\{(.+)\}$/);
    if (!match) return undefined;
    // Strip method calls: "svc.run()" → "svc.run()" (caller can split on '.')
    return match[1].replace(/\(.*\)$/, "");
}
