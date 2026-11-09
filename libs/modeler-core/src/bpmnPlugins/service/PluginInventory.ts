import {
    ApprovableArtifact,
    CodeApproval,
    ListedCode,
    ListedPresence,
    SessionAnswer,
} from "../../kernel/domain/codeApproval";
import { lastWorkspacePathSegment } from "../../kernel/domain/workspacePath";
import { isPluginApproval, PLUGIN_CODE_TEXTS, WorkspacePlugin } from "../domain/pluginApproval";
import { configFolderOfPlugin, pluginsDirOf } from "../domain/pluginFolders";
import { BpmnPluginService } from "./BpmnPluginService";
import { PluginCatalog } from "./PluginCatalog";
import { PluginReading, WorkspacePluginLocator } from "./WorkspacePluginLocator";

/**
 * The plugins as the add-on catalog lists them: found, hashed and answered
 * for by the plugin feature's own locator and catalog, which keep the rules.
 */
export class PluginInventory {
    readonly texts = PLUGIN_CODE_TEXTS;

    constructor(
        private readonly locator: WorkspacePluginLocator,
        private readonly catalog: PluginCatalog,
        private readonly service: BpmnPluginService,
    ) {}

    async pluginsIn(pluginDirs: readonly string[]): Promise<readonly ListedPresence[]> {
        const listed: ListedPresence[] = [];
        for (const pluginDir of new Set(pluginDirs)) {
            for (const reading of await this.locator.pluginsInDir(pluginDir)) {
                listed.push(presenceOf(reading));
            }
        }
        return listed;
    }

    ownsApproval(approval: CodeApproval): boolean {
        return isPluginApproval(approval);
    }

    knownPluginDirs(): readonly string[] {
        return this.locator.knownPluginDirs();
    }

    pluginsDirOf(dir: string, configFolder: string): string {
        return pluginsDirOf(dir, configFolder);
    }

    configFolderOf(pluginId: string): string {
        return configFolderOfPlugin(pluginId);
    }

    async current(pluginId: string): Promise<ListedPresence> {
        return presenceOf(await this.locator.readFresh(pluginId));
    }

    /** A revoked plugin's copy is no longer served, so it goes. */
    async afterRevoke(): Promise<void> {
        await this.service.pruneCache();
    }

    sessionAnswers(): ReadonlyMap<string, SessionAnswer> {
        return this.catalog.sessionAnswers();
    }

    leaveForView(artifact: ApprovableArtifact): void {
        this.catalog.leaveForView(artifact);
    }

    pruneCache(): Promise<{ readonly removed: number }> {
        return this.service.pruneCache();
    }

    onDidChange(listener: () => void): { dispose(): void } {
        const subscriptions = [
            this.locator.onDidChange(listener),
            this.catalog.onDidAnswer(listener),
        ];
        return { dispose: () => subscriptions.forEach((each) => each.dispose()) };
    }
}

function presenceOf(reading: PluginReading): ListedPresence {
    switch (reading.kind) {
        case "found": {
            const artifact = listedPluginOf(reading.discovered.plugin);
            return { kind: "found", artifact, name: artifact.name };
        }
        case "unreadable":
            return {
                kind: "unreadable",
                id: reading.folder,
                name: lastWorkspacePathSegment(reading.folder),
                reason: reading.reason,
            };
        case "gone":
            return {
                kind: "gone",
                id: reading.folder,
                name: lastWorkspacePathSegment(reading.folder),
            };
    }
}

function listedPluginOf({
    id,
    name,
    contentHash,
    scriptPath,
    stylePath,
}: WorkspacePlugin): ListedCode {
    return {
        id,
        name,
        contentHash,
        files: stylePath === undefined ? [scriptPath] : [scriptPath, stylePath],
    };
}
