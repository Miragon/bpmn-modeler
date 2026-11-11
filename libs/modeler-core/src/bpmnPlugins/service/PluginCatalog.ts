import { ActionNotice } from "../../kernel/domain/actionNotice";
import { ChoicePrompt } from "../../kernel/domain/prompts";
import { LoggerPort } from "../../kernel/port/hostPorts";
import { CarriedApprovalWriter } from "../../kernel/service/CarriedApprovalWriter";
import {
    allowing,
    ApprovableArtifact,
    declineKeyOf,
    notAskedAgain,
    ReviewAnswer,
    SessionAnswer,
} from "../../kernel/domain/codeApproval";
import {
    approvalOutcome,
    approvedPlugins,
    PendingApproval,
    pendingApprovals,
    PLUGIN_CODE_TEXTS,
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
    /** Every plugin it may not load, including those no notice asks about again. */
    readonly withheld: readonly WorkspacePlugin[];
}

/**
 * Which workspace plugins a document may load, and the user's answers about
 * the others. Knows no editor and no webview, so every host that serves
 * plugins shares it.
 *
 * A plugin the user left unchecked, left to a view, or a notice the user
 * closed, is not asked about again for the catalog's lifetime, unless its
 * content changes.
 */
export class PluginCatalog {
    private readonly answers = new Map<string, SessionAnswer>();
    private readonly answerListeners = new Set<() => void>();
    private readonly carriedApprovalWriter: CarriedApprovalWriter;

    constructor(
        private readonly locator: WorkspacePluginLocator,
        private readonly approvals: PluginApprovalStorePort,
        private readonly logger: LoggerPort,
    ) {
        this.carriedApprovalWriter = new CarriedApprovalWriter(
            approvals,
            logger,
            PLUGIN_CODE_TEXTS,
        );
    }

    async pluginsFor(documentPath: string): Promise<PluginSelection> {
        const discovered = await this.discover(documentPath);
        const plugins = discovered.map(({ plugin }) => plugin);
        // Awaited, so each place is written once before the editor is answered; it never rejects.
        await this.carriedApprovalWriter.record(plugins);
        const approvedIds = new Set(
            approvedPlugins(plugins, this.approvals.read()).map((plugin) => plugin.id),
        );
        return {
            approved: discovered.filter(({ plugin }) => approvedIds.has(plugin.id)),
            pending: this.stillPending(plugins),
            withheld: plugins.filter((plugin) => !approvedIds.has(plugin.id)),
        };
    }

    /** Stores a row where a plugin is allowed only by another place's row of its content; never rejects. */
    recordCarried(found: readonly ApprovableArtifact[]): Promise<void> {
        return this.carriedApprovalWriter.record(found);
    }

    /** Those of `pending` that no answer settled since they were found. */
    stillPendingOf(pending: readonly PendingApproval[]): PendingApproval[] {
        return this.stillPending(pending.map(({ artifact }) => artifact));
    }

    /** By `declineKeyOf`: what the user answered this session about each content. */
    sessionAnswers(): ReadonlyMap<string, SessionAnswer> {
        return this.answers;
    }

    /** No notice asks about this content again this session; a view shows it instead. */
    leaveForView(artifact: ApprovableArtifact): void {
        this.answers.set(declineKeyOf(artifact), "leftForView");
        this.answerListeners.forEach((listener) => listener());
    }

    onDidAnswer(listener: () => void): { dispose(): void } {
        this.answerListeners.add(listener);
        return { dispose: () => this.answerListeners.delete(listener) };
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
        answer: ReviewAnswer,
    ): Promise<readonly WorkspacePlugin[]> {
        const outcome = approvalOutcome(pending, answer);
        outcome.answers.forEach((each, key) => this.answers.set(key, each));
        if (outcome.answers.size > 0) {
            this.answerListeners.forEach((listener) => listener());
        }
        if (outcome.allowed.length > 0) {
            await this.approvals.change(allowing(outcome.allowed));
            this.logger.logInfo(
                `Allowed BPMN plugin(s): ${outcome.allowed.map((plugin) => plugin.name).join(", ")}`,
            );
        }
        return outcome.allowed;
    }

    private stillPending(plugins: readonly WorkspacePlugin[]): PendingApproval[] {
        return pendingApprovals(plugins, this.approvals.read(), notAskedAgain(this.answers));
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
