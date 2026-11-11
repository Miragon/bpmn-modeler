import { AllowableCode } from "../../kernel/domain/allowance";
import { SessionAnswer } from "../../kernel/domain/codeApproval";
import { ListedPresence } from "../../kernel/domain/listedCode";
import { lastWorkspacePathSegment } from "../../kernel/domain/workspacePath";
import { PLUGIN_CODE_TEXTS } from "../domain/pluginApproval";
import { configFolderOfPlugin, pluginsDirOf } from "../domain/pluginFolders";
import { BpmnPluginService } from "./BpmnPluginService";
import { PluginCatalog } from "./PluginCatalog";
import { PluginReading, WorkspacePluginLocator } from "./WorkspacePluginLocator";

const NONE_LOADED: ReadonlySet<string> = new Set();

/**
 * The plugins as the add-on catalog lists them: found, located and answered
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

    sessionAnswers(): ReadonlyMap<string, SessionAnswer> {
        return this.catalog.sessionAnswers();
    }

    /** A revoked plugin unloads at once: open editors reload without it. */
    stillLoadedAfterRevoke(): ReadonlySet<string> {
        return NONE_LOADED;
    }

    leaveForView(code: AllowableCode): void {
        this.catalog.leaveForView(code);
    }

    pruneCache(): Promise<{ readonly removed: number }> {
        return this.service.pruneUnusedCopies();
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
            const { id, name, allowance } = reading.discovered.plugin;
            return { kind: "found", artifact: { id, name, allowance }, name };
        }
        case "unreadable":
            return {
                kind: "unreadable",
                id: reading.folder,
                name: lastWorkspacePathSegment(reading.folder),
                reason: reading.reason,
                allowance: reading.allowance,
            };
        case "gone":
            return {
                kind: "gone",
                id: reading.folder,
                name: lastWorkspacePathSegment(reading.folder),
            };
    }
}
