import { DirectoryNotFound, FileNotFound } from "../../kernel/domain/errors";
import { EVERY_PATH_GLOB } from "../../kernel/domain/watchedFiles";
import { joinWorkspacePath, lastWorkspacePathSegment } from "../../kernel/domain/workspacePath";
import { NotifierPort, WorkspacePort } from "../../kernel/port/hostPorts";
import { ArtifactService } from "../../kernel/service/ArtifactService";
import { approvedContent, WorkspacePlugin } from "../domain/pluginApproval";
import { isPluginFolderName, pluginFolderChangedBy } from "../domain/pluginFolders";
import {
    MISSING_FILE_REASON,
    NO_MANIFEST_REASON,
    PLUGIN_MANIFEST_FILES,
    PluginManifest,
    PluginManifestReading,
    readPluginManifest,
} from "../domain/pluginManifest";
import { ContentHasherPort } from "../port/pluginPorts";

const PLUGINS_AREA = "plugins";

/** A plugin with the exact text its hash covers, so what gets served is what was hashed. */
export interface DiscoveredPlugin {
    readonly plugin: WorkspacePlugin;
    readonly script: string;
    readonly style?: string;
}

/** One plugin folder as last read. */
export type PluginReading =
    | { readonly kind: "found"; readonly discovered: DiscoveredPlugin }
    | { readonly kind: "unreadable"; readonly folder: string; readonly reason: string }
    | { readonly kind: "gone"; readonly folder: string };

/**
 * Finds the plugins in every `<configFolder>/plugins/` between a document and
 * its workspace root. Each subfolder is one plugin. A folder it cannot read
 * is logged and skipped, so one broken plugin never hides the others.
 *
 * Each plugin folder is read and hashed once, with its bytes kept, until a
 * watcher on its plugins folder reports a change below it; so opening an
 * editor does not reread every bundle, and the bytes served are the bytes
 * hashed.
 */
export class WorkspacePluginLocator {
    private readonly readings = new Map<string, Promise<PluginReading>>();
    private readonly watchers = new Map<string, { dispose(): void }>();
    private readonly listeners = new Set<() => void>();

    constructor(
        private readonly artifacts: ArtifactService,
        private readonly workspace: WorkspacePort,
        private readonly hasher: ContentHasherPort,
        private readonly notifier: NotifierPort,
    ) {}

    async pluginsFor(documentPath: string): Promise<DiscoveredPlugin[]> {
        const documentDir = this.workspace.getDocumentDirectory(documentPath);
        const pluginDirs = await this.artifacts.getConfigAreaDirs(documentDir, PLUGINS_AREA);
        const discovered: DiscoveredPlugin[] = [];
        for (const pluginDir of pluginDirs) {
            for (const reading of await this.pluginsInDir(pluginDir)) {
                if (reading.kind === "found") {
                    discovered.push(reading.discovered);
                }
            }
        }
        return discovered;
    }

    /** Every plugin folder of one plugins folder, as last read; the folder is watched from then on. */
    async pluginsInDir(pluginDir: string): Promise<PluginReading[]> {
        this.watch(pluginDir);
        const readings: PluginReading[] = [];
        for (const folder of await this.subfolders(pluginDir)) {
            readings.push(await this.memoizedReading(folder.path, folder.name));
        }
        return readings;
    }

    /** The plugins folders looked in so far. */
    knownPluginDirs(): string[] {
        return [...this.watchers.keys()];
    }

    /** Read and hashed now, past what it remembered. */
    async readFresh(folder: string): Promise<PluginReading> {
        try {
            await this.workspace.readDirectory(folder);
        } catch (error) {
            if (error instanceof DirectoryNotFound) {
                return { kind: "gone", folder };
            }
            throw error;
        }
        return this.readPlugin(folder, lastWorkspacePathSegment(folder));
    }

    /** After a change below a plugins folder it watches. */
    onDidChange(listener: () => void): { dispose(): void } {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
    }

    dispose(): void {
        this.watchers.forEach((watcher) => watcher.dispose());
        this.watchers.clear();
        this.readings.clear();
        this.listeners.clear();
    }

    private watch(pluginDir: string): void {
        if (this.watchers.has(pluginDir)) {
            return;
        }
        const forget = (path: string) => this.forget(path, pluginDir);
        this.watchers.set(
            pluginDir,
            this.workspace.createWatcher(pluginDir, EVERY_PATH_GLOB, {
                onCreate: forget,
                onChange: forget,
                onDelete: forget,
            }),
        );
    }

    private forget(path: string, pluginDir: string): void {
        const change = pluginFolderChangedBy(path, pluginDir);
        if (change.kind === "folder") {
            this.readings.delete(change.folder);
        } else if (change.kind === "everyFolder") {
            [...this.readings.keys()]
                .filter((folder) => pluginFolderChangedBy(folder, pluginDir).kind === "folder")
                .forEach((folder) => this.readings.delete(folder));
        } else {
            return;
        }
        this.listeners.forEach((listener) => listener());
    }

    private memoizedReading(folder: string, folderName: string): Promise<PluginReading> {
        let reading = this.readings.get(folder);
        if (reading === undefined) {
            reading = this.readPlugin(folder, folderName).then((read) => {
                if (read.kind === "unreadable") {
                    this.notifier.logWarning(`Skipped BPMN plugin in ${folder}: ${read.reason}`);
                }
                return read;
            });
            this.readings.set(folder, reading);
        }
        return reading;
    }

    private async subfolders(directory: string): Promise<{ name: string; path: string }[]> {
        try {
            const entries = await this.workspace.readDirectory(directory);
            return entries
                .filter(([name, kind]) => kind === "directory" && isPluginFolderName(name))
                .map(([name]) => ({ name, path: joinWorkspacePath(directory, name) }));
        } catch (error) {
            if (error instanceof DirectoryNotFound) {
                return [];
            }
            throw error;
        }
    }

    private async readPlugin(folder: string, folderName: string): Promise<PluginReading> {
        try {
            const reading = await this.readManifest(folder, folderName);
            if (reading.kind === "unreadable") {
                return { kind: "unreadable", folder, reason: reading.reason };
            }
            return { kind: "found", discovered: await this.withContent(folder, reading.manifest) };
        } catch (error) {
            const reason = error instanceof FileNotFound ? MISSING_FILE_REASON : String(error);
            return { kind: "unreadable", folder, reason };
        }
    }

    private async readManifest(folder: string, folderName: string): Promise<PluginManifestReading> {
        for (const file of PLUGIN_MANIFEST_FILES) {
            try {
                const text = await this.workspace.readFile(joinWorkspacePath(folder, file));
                return readPluginManifest(file, text, folderName);
            } catch (error) {
                if (!(error instanceof FileNotFound)) {
                    throw error;
                }
            }
        }
        return { kind: "unreadable", reason: NO_MANIFEST_REASON };
    }

    private async withContent(folder: string, manifest: PluginManifest): Promise<DiscoveredPlugin> {
        const scriptPath = joinWorkspacePath(folder, manifest.script);
        const stylePath =
            manifest.style === undefined ? undefined : joinWorkspacePath(folder, manifest.style);
        const script = await this.workspace.readFile(scriptPath);
        const style =
            stylePath === undefined ? undefined : await this.workspace.readFile(stylePath);
        const plugin: WorkspacePlugin = {
            id: folder,
            name: manifest.name,
            scriptPath,
            ...(stylePath === undefined ? {} : { stylePath }),
            contentHash: this.hasher.sha256(approvedContent(script, style)),
        };
        return { plugin, script, ...(style === undefined ? {} : { style }) };
    }
}
