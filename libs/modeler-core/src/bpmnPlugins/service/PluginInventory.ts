import {
    ApprovableArtifact,
    CodeApproval,
    ListedCode,
    ListedPresence,
    SessionAnswer,
} from "../../kernel/domain/codeApproval";
import { isApprovalRowOf } from "../../kernel/domain/approvalRowKind";
import { lastWorkspacePathSegment } from "../../kernel/domain/workspacePath";
import { LoggerPort } from "../../kernel/port/hostPorts";
import { PLUGIN_CODE_TEXTS, WorkspacePlugin } from "../domain/pluginApproval";
import { configFolderOfPlugin, pluginsDirOf } from "../domain/pluginFolders";
import { BpmnPluginService } from "./BpmnPluginService";
import { PluginCatalog } from "./PluginCatalog";
import { PluginReading, WorkspacePluginLocator } from "./WorkspacePluginLocator";

const NONE_LOADED: ReadonlySet<string> = new Set();

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
        private readonly logger: LoggerPort,
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
        return isApprovalRowOf("plugin", approval);
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

    recordCarried(found: readonly ApprovableArtifact[]): Promise<void> {
        return this.catalog.recordCarried(found);
    }

    /** A revoked plugin's copy is no longer served, so it goes; the revoke stands if it cannot. */
    async afterRevoke(): Promise<void> {
        try {
            await this.service.pruneCache();
        } catch (error) {
            this.logger.logError(error instanceof Error ? error : new Error(String(error)));
        }
    }

    sessionAnswers(): ReadonlyMap<string, SessionAnswer> {
        return this.catalog.sessionAnswers();
    }

    /** A revoked plugin unloads at once: open editors reload without it. */
    stillLoadedAfterRevoke(): ReadonlySet<string> {
        return NONE_LOADED;
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
