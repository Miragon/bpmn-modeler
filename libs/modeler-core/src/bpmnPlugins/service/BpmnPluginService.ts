import { BpmnPluginAsset, BpmnPluginsQuery } from "@miragon/bpmn-modeler-shared";

import { NotifierPort } from "../../kernel/port/hostPorts";
import { ApprovalQuestion } from "../../kernel/service/ApprovalQuestion";
import { answerWithoutPlugins } from "../../editorSession/service/answerWithoutPlugins";
import { EditorSessionStore, PostOutcome } from "../../editorSession/service/EditorSessionStore";
import {
    CachedPluginFiles,
    contentServedByEditors,
    editorsToReload,
    OfferedPlugins,
    withheldByEditors,
    WorkspacePlugin,
} from "../domain/pluginApproval";
import { CodeApproval } from "../../kernel/domain/codeApproval";
import { PluginCache } from "./PluginCache";
import { PluginCatalog } from "./PluginCatalog";
import { DiscoveredPlugin } from "./WorkspacePluginLocator";

/**
 * Answers a BPMN editor's plugin request with the approved plugins and asks
 * about the others afterwards, so the editor never waits on the user. Any
 * change of the approvals or of the workspace's trust, whoever made it,
 * reloads every open editor whose plugins it changes, because modules are
 * fixed once a modeler is built.
 */
export class BpmnPluginService {
    /** Dropped on a reload until the editor asks again, so one change reloads it once. */
    private readonly offeredByEditor = new Map<string, OfferedPlugins>();
    private approvalSettled: Promise<void> = Promise.resolve();

    constructor(
        private readonly store: EditorSessionStore,
        private readonly catalog: PluginCatalog,
        private readonly question: ApprovalQuestion<
            WorkspacePlugin,
            WorkspacePlugin,
            WorkspacePlugin
        >,
        private readonly cache: PluginCache,
        private readonly notifier: NotifierPort,
    ) {}

    async answerPluginRequest(editorId: string): Promise<void> {
        const handle = this.store.requireHandle(editorId);
        const webviewUrlOf = handle.webviewUrlOf?.bind(handle);
        if (webviewUrlOf === undefined) {
            this.notifier.logDebug("BPMN plugins: this host's webview cannot load plugin files.");
            this.logUnsent(editorId, await answerWithoutPlugins(this.store, editorId));
            return;
        }
        const { approved, pending, withheld } = await this.catalog.pluginsFor(
            handle.documentPath(),
        );
        this.offeredByEditor.set(editorId, {
            served: approved.map(({ plugin }) => plugin),
            withheld,
        });
        const assets: BpmnPluginAsset[] = [];
        for (const discovered of approved) {
            const asset = await this.serve(discovered, webviewUrlOf);
            if (asset) {
                assets.push(asset);
            }
        }
        const outcome = await this.store.postUnlessHidden(editorId, new BpmnPluginsQuery(assets));
        if (outcome !== "sent") {
            this.logUnsent(editorId, outcome);
            return;
        }
        // Not awaited: the router runs this editor's commands in order, and a
        // question left open would hold back its document syncs.
        this.askAbout(pending);
    }

    /** The content hashes the open editors are served, which no prune removes. */
    servedContent(): ReadonlySet<string> {
        return contentServedByEditors(this.offeredByEditor);
    }

    releaseEditor(editorId: string): void {
        this.offeredByEditor.delete(editorId);
    }

    /** After a change of the approvals or of the workspace's trust, whoever made it. */
    runnablePluginsChanged(approvals: readonly CodeApproval[], trusted: boolean): void {
        for (const editorId of editorsToReload(this.offeredByEditor, approvals, trusted)) {
            this.offeredByEditor.delete(editorId);
            this.reload(editorId);
        }
    }

    /**
     * After a change of the workspace's trust. An editor that asked while the
     * workspace was untrusted was asked nothing, so a grant asks about what the
     * editors it does not reload withhold; a reloaded one asks on its request.
     */
    trustChanged(approvals: readonly CodeApproval[], trusted: boolean): void {
        this.runnablePluginsChanged(approvals, trusted);
        // Asked while untrusted, the request did not wait for the start-up migration.
        this.askAbout(withheldByEditors(this.offeredByEditor), this.catalog.whenRowsSettled());
    }

    /** Resolves once every approval question raised so far is answered. */
    whenApprovalSettled(): Promise<void> {
        return this.approvalSettled;
    }

    private askAbout(found: readonly WorkspacePlugin[], after = Promise.resolve()): void {
        const asking = after
            .then(() => this.question.ask(found))
            .catch((error: unknown) =>
                this.notifier.logError(error instanceof Error ? error : new Error(String(error))),
            );
        this.approvalSettled = Promise.all([this.approvalSettled, asking]).then(() => undefined);
    }

    private logUnsent(editorId: string, outcome: PostOutcome): void {
        if (outcome === "hidden") {
            // Shown again, the webview restarts and asks for its plugins itself.
            this.notifier.logDebug(`BPMN plugins not sent to hidden editor: ${editorId}`);
        } else if (outcome === "undelivered") {
            this.notifier.logWarning(`BPMN plugins could not be sent to editor: ${editorId}`);
        }
    }

    private async serve(
        discovered: DiscoveredPlugin,
        webviewUrlOf: (path: string) => string,
    ): Promise<BpmnPluginAsset | undefined> {
        let files: CachedPluginFiles;
        try {
            files = await this.cache.servedCopyOf(discovered);
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

    private reload(editorId: string): void {
        if (!this.store.hasEditor(editorId)) {
            return;
        }
        try {
            this.store.reload(editorId);
        } catch (error) {
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
        }
    }
}
