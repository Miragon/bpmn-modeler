import { ActionNotice } from "../../kernel/domain/actionNotice";
import { ChoicePrompt } from "../../kernel/domain/prompts";
import { LoggerPort } from "../../kernel/port/hostPorts";
import { allowing } from "../../kernel/domain/codeApproval";
import {
    approvalOutcome,
    approvedPlugins,
    PendingApproval,
    pendingApprovals,
    PluginApprovalNoticeAction,
    pluginApprovalNotice,
    pluginApprovalPrompt,
    WorkspacePlugin,
} from "../domain/pluginApproval";
import { PluginApprovalStorePort } from "../port/pluginPorts";
import { DiscoveredPlugin, WorkspacePluginLocator } from "./WorkspacePluginLocator";

/** The plugins of one document: those it may load now, and those the user has not decided on. */
export interface PluginSelection {
    readonly approved: readonly DiscoveredPlugin[];
    readonly pending: readonly PendingApproval[];
}

/**
 * Which workspace plugins a document may load, and the user's answers about
 * the others. Knows no editor and no webview, so every host that serves
 * plugins shares it.
 *
 * A plugin the user left unchecked, or a notice the user closed, is not asked
 * about again for the catalog's lifetime, unless its content changes.
 */
export class PluginCatalog {
    private readonly declinedThisSession = new Set<string>();

    constructor(
        private readonly locator: WorkspacePluginLocator,
        private readonly approvals: PluginApprovalStorePort,
        private readonly logger: LoggerPort,
    ) {}

    async pluginsFor(documentPath: string): Promise<PluginSelection> {
        const discovered = await this.discover(documentPath);
        const plugins = discovered.map(({ plugin }) => plugin);
        const approvedIds = new Set(
            approvedPlugins(plugins, this.approvals.read()).map((plugin) => plugin.id),
        );
        return {
            approved: discovered.filter(({ plugin }) => approvedIds.has(plugin.id)),
            pending: this.stillPending(plugins),
        };
    }

    /** Those of `pending` that no answer settled since they were found. */
    stillPendingOf(pending: readonly PendingApproval[]): PendingApproval[] {
        return this.stillPending(pending.map(({ artifact }) => artifact));
    }

    reviewNotice(pending: readonly PendingApproval[]): ActionNotice<PluginApprovalNoticeAction> {
        return pluginApprovalNotice(pending);
    }

    reviewPrompt(
        pending: readonly PendingApproval[],
        workspaceFolders: readonly string[],
    ): ChoicePrompt<string> {
        return pluginApprovalPrompt(pending, workspaceFolders);
    }

    /**
     * Allows the checked plugins and declines the rest for this session; no
     * checked id is a decline of every pending plugin.
     *
     * @returns the plugins now allowed.
     */
    async applyAnswer(
        pending: readonly PendingApproval[],
        checkedIds: readonly string[],
    ): Promise<readonly WorkspacePlugin[]> {
        const outcome = approvalOutcome(pending, checkedIds);
        outcome.declineKeys.forEach((key) => this.declinedThisSession.add(key));
        if (outcome.allowed.length > 0) {
            await this.approvals.change(allowing(outcome.allowed));
            this.logger.logInfo(
                `Allowed BPMN plugin(s): ${outcome.allowed.map((plugin) => plugin.name).join(", ")}`,
            );
        }
        return outcome.allowed;
    }

    private stillPending(plugins: readonly WorkspacePlugin[]): PendingApproval[] {
        return pendingApprovals(plugins, this.approvals.read(), this.declinedThisSession);
    }

    private async discover(documentPath: string): Promise<DiscoveredPlugin[]> {
        try {
            return await this.locator.pluginsFor(documentPath);
        } catch (error) {
            this.logger.logError(error instanceof Error ? error : new Error(String(error)));
            return [];
        }
    }
}
