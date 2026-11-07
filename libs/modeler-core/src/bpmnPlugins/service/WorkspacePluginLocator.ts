import { DirectoryNotFound, FileNotFound } from "../../kernel/domain/errors";
import { joinWorkspacePath } from "../../kernel/domain/workspacePath";
import { NotifierPort, WorkspacePort } from "../../kernel/port/hostPorts";
import { ArtifactService } from "../../kernel/service/ArtifactService";
import { approvedContent, WorkspacePlugin } from "../domain/pluginApproval";
import {
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

/**
 * Finds the plugins in every `<configFolder>/plugins/` between a document and
 * its workspace root. Each subfolder is one plugin. A folder it cannot read
 * is logged and skipped, so one broken plugin never hides the others.
 */
export class WorkspacePluginLocator {
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
            for (const folder of await this.subfolders(pluginDir)) {
                const plugin = await this.readPlugin(folder.path, folder.name);
                if (plugin) {
                    discovered.push(plugin);
                }
            }
        }
        return discovered;
    }

    private async subfolders(directory: string): Promise<{ name: string; path: string }[]> {
        try {
            const entries = await this.workspace.readDirectory(directory);
            return entries
                .filter(([, type]) => type === "directory")
                .map(([name]) => ({ name, path: joinWorkspacePath(directory, name) }));
        } catch (error) {
            if (error instanceof DirectoryNotFound) {
                return [];
            }
            throw error;
        }
    }

    private async readPlugin(folder: string, folderName: string): Promise<DiscoveredPlugin | undefined> {
        const reading = await this.readManifest(folder, folderName);
        if (reading.kind === "unreadable") {
            this.notifier.logWarning(`Skipped BPMN plugin in ${folder}: ${reading.reason}`);
            return undefined;
        }
        try {
            return await this.withContent(folder, reading.manifest);
        } catch (error) {
            const reason = error instanceof FileNotFound ? "a file it names is missing" : String(error);
            this.notifier.logWarning(`Skipped BPMN plugin in ${folder}: ${reason}`);
            return undefined;
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
        return { kind: "unreadable", reason: `holds neither ${PLUGIN_MANIFEST_FILES.join(" nor ")}` };
    }

    private async withContent(folder: string, manifest: PluginManifest): Promise<DiscoveredPlugin> {
        const scriptPath = joinWorkspacePath(folder, manifest.script);
        const stylePath =
            manifest.style === undefined ? undefined : joinWorkspacePath(folder, manifest.style);
        const script = await this.workspace.readFile(scriptPath);
        const style = stylePath === undefined ? undefined : await this.workspace.readFile(stylePath);
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
