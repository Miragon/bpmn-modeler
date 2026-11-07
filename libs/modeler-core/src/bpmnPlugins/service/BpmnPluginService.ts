import { BpmnPluginAsset, BpmnPluginsQuery } from "@miragon/bpmn-modeler-shared";

import { NotifierPort, PickerPort, WorkspacePort } from "../../kernel/port/hostPorts";
import { EditorSessionStore } from "../../editorSession/service/EditorSessionStore";
import {
    approvalOutcome,
    approvalsAllowing,
    approvedPlugins,
    cachedPluginFiles,
    pendingApprovals,
    pluginApprovalPrompt,
    WorkspacePlugin,
} from "../domain/pluginApproval";
import { PluginApprovalStorePort } from "../port/pluginPorts";
import { DiscoveredPlugin, WorkspacePluginLocator } from "./WorkspacePluginLocator";

/**
 * Answers a BPMN editor's plugin request with the approved plugins and asks
 * about the others afterwards, so the editor never waits on the user. An
 * approval reloads the editor, because modules are fixed once it is built.
 */
export class BpmnPluginService {
    // Kept for the extension host's lifetime, so a tab switch does not ask again.
    private readonly declinedThisSession = new Set<string>();
    private approvalPrompt: Promise<void> | undefined;
    private approvalSettled: Promise<void> = Promise.resolve();

    /** @param cacheRoot The host's plugin cache, a folder the webview may load files from. */
    constructor(
        private readonly store: EditorSessionStore,
        private readonly workspace: WorkspacePort,
        private readonly locator: WorkspacePluginLocator,
        private readonly approvals: PluginApprovalStorePort,
        private readonly picker: PickerPort,
        private readonly notifier: NotifierPort,
        private readonly cacheRoot: string,
    ) {}

    async answerPluginRequest(editorId: string): Promise<void> {
        const handle = this.store.requireHandle(editorId);
        if (handle.webviewUrlOf === undefined) {
            this.notifier.logDebug("BPMN plugins: this host's webview cannot load plugin files.");
            await this.store.postMessage(editorId, new BpmnPluginsQuery([]));
            return;
        }
        const webviewUrlOf = (path: string) => handle.webviewUrlOf!(path);
        const discovered = await this.discover(handle.documentPath());
        const byId = new Map(discovered.map((each) => [each.plugin.id, each]));
        const plugins = discovered.map(({ plugin }) => plugin);
        const assets: BpmnPluginAsset[] = [];
        for (const plugin of approvedPlugins(plugins, this.approvals.read())) {
            const asset = await this.serve(byId.get(plugin.id)!, webviewUrlOf);
            if (asset) {
                assets.push(asset);
            }
        }
        await this.store.postMessage(editorId, new BpmnPluginsQuery(assets));
        // Not awaited: the router runs this editor's commands in order, and a
        // question left open would hold back its document syncs.
        this.approvalSettled = this.askForApprovals(editorId, plugins).catch((error: unknown) =>
            this.notifier.logError(error instanceof Error ? error : new Error(String(error))),
        );
    }

    /** Resolves once the approval question this service last raised is answered. */
    whenApprovalSettled(): Promise<void> {
        return this.approvalSettled;
    }

    private async discover(documentPath: string): Promise<DiscoveredPlugin[]> {
        try {
            return await this.locator.pluginsFor(documentPath);
        } catch (error) {
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            return [];
        }
    }

    /** Copies the approved bytes into the cache and returns where the webview loads them. */
    private async serve(
        discovered: DiscoveredPlugin,
        webviewUrlOf: (path: string) => string,
    ): Promise<BpmnPluginAsset | undefined> {
        const files = cachedPluginFiles(this.cacheRoot, discovered.plugin);
        try {
            await this.workspace.writeFile(files.script, discovered.script);
            if (files.style !== undefined && discovered.style !== undefined) {
                await this.workspace.writeFile(files.style, discovered.style);
            }
        } catch (error) {
            this.notifier.logWarning(
                `BPMN plugin "${discovered.plugin.name}" left out: its copy could not be written (${String(error)})`,
            );
            return undefined;
        }
        return {
            name: discovered.plugin.name,
            scriptUrl: webviewUrlOf(files.script),
            ...(files.style === undefined ? {} : { styleUrl: webviewUrlOf(files.style) }),
        };
    }

    private async askForApprovals(editorId: string, plugins: readonly WorkspacePlugin[]): Promise<void> {
        // A second editor opening while the question is open would ask the same again.
        if (this.approvalPrompt !== undefined) {
            return;
        }
        const pending = pendingApprovals(plugins, this.approvals.read(), this.declinedThisSession);
        if (pending.length === 0) {
            return;
        }
        this.approvalPrompt = this.ask(editorId, pending);
        try {
            await this.approvalPrompt;
        } finally {
            this.approvalPrompt = undefined;
        }
    }

    private async ask(
        editorId: string,
        pending: Parameters<typeof pluginApprovalPrompt>[0],
    ): Promise<void> {
        const checked = await this.picker.chooseMany(pluginApprovalPrompt(pending));
        const outcome = approvalOutcome(pending, checked);
        outcome.declineKeys.forEach((key) => this.declinedThisSession.add(key));
        if (outcome.allowed.length === 0) {
            return;
        }
        await this.approvals.write(approvalsAllowing(this.approvals.read(), outcome.allowed));
        this.notifier.logInfo(
            `Allowed BPMN plugin(s): ${outcome.allowed.map((plugin) => plugin.name).join(", ")}`,
        );
        if (this.store.hasEditor(editorId)) {
            this.store.reload(editorId);
        }
    }
}
