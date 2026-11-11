import { ActionNotice } from "../../kernel/domain/actionNotice";
import {
    AllowableCode,
    allowanceKeyOf,
    allowanceOutcome,
    allowingAllowances,
    pendingAllowances,
} from "../../kernel/domain/allowance";
import { notAskedAgain, ReviewAnswer, SessionAnswer } from "../../kernel/domain/codeApproval";
import { ChoicePrompt } from "../../kernel/domain/prompts";
import { askedInWorkspace, runsInWorkspace } from "../../kernel/domain/workspaceTrust";
import { LoggerPort, WorkspaceTrustPort } from "../../kernel/port/hostPorts";
import { ContentRows } from "../../kernel/service/ContentRowMigration";
import {
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
    readonly pending: readonly WorkspacePlugin[];
    /** Every plugin it may not load, including those no notice asks about again. */
    readonly withheld: readonly WorkspacePlugin[];
}

/**
 * Which workspace plugins a document may load, and the user's answers about
 * the others. Knows no editor and no webview, so every host that serves
 * plugins shares it.
 *
 * A plugin the user left unchecked, left to a view, or a notice the user
 * closed, is not asked about again for the catalog's lifetime, at any place
 * of its allowance and whatever its content becomes. In a workspace the user
 * did not trust, no plugin loads and none is asked about.
 */
export class PluginCatalog {
    private readonly answers = new Map<string, SessionAnswer>();
    private readonly answerListeners = new Set<() => void>();

    constructor(
        private readonly locator: WorkspacePluginLocator,
        private readonly approvals: PluginApprovalStorePort,
        private readonly contentRows: ContentRows,
        private readonly trust: Pick<WorkspaceTrustPort, "isTrusted">,
        private readonly logger: LoggerPort,
    ) {}

    async pluginsFor(documentPath: string): Promise<PluginSelection> {
        const discovered = await this.discover(documentPath);
        const selection = this.selectionOf(discovered);
        if (selection.pending.length === 0) {
            return selection;
        }
        // The start-up migration may be about to allow it, as in a second worktree.
        await this.contentRows.whenSettled();
        return this.selectionOf(discovered);
    }

    /** Those of `pending` that no answer settled since they were found. */
    stillPendingOf(pending: readonly WorkspacePlugin[]): readonly WorkspacePlugin[] {
        return askedInWorkspace(
            pendingAllowances(pending, this.approvals.read(), notAskedAgain(this.answers)),
            this.trust.isTrusted(),
        );
    }

    /** By `allowanceKeyOf`: what the user answered this session about each allowance. */
    sessionAnswers(): ReadonlyMap<string, SessionAnswer> {
        return this.answers;
    }

    /** No notice asks about this allowance again this session; a view shows it instead. */
    leaveForView(code: AllowableCode): void {
        this.answers.set(allowanceKeyOf(code.allowance), "leftForView");
        this.answerListeners.forEach((listener) => listener());
    }

    onDidAnswer(listener: () => void): { dispose(): void } {
        this.answerListeners.add(listener);
        return { dispose: () => this.answerListeners.delete(listener) };
    }

    reviewNotice(pending: readonly WorkspacePlugin[]): ActionNotice<PluginApprovalNoticeAction> {
        return pluginApprovalNotice(pending);
    }

    reviewPrompt(
        pending: readonly WorkspacePlugin[],
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
        pending: readonly WorkspacePlugin[],
        answer: ReviewAnswer,
    ): Promise<readonly WorkspacePlugin[]> {
        const outcome = allowanceOutcome(pending, answer);
        outcome.answers.forEach((each, key) => this.answers.set(key, each));
        if (outcome.answers.size > 0) {
            this.answerListeners.forEach((listener) => listener());
        }
        if (outcome.allowed.length > 0) {
            await this.approvals.change(allowingAllowances(outcome.allowed));
            this.logger.logInfo(
                `Allowed BPMN plugin(s): ${outcome.allowed.map((plugin) => plugin.name).join(", ")}`,
            );
        }
        return outcome.allowed;
    }

    private selectionOf(discovered: readonly DiscoveredPlugin[]): PluginSelection {
        const rows = this.approvals.read();
        const trusted = this.trust.isTrusted();
        const runs = (plugin: WorkspacePlugin) => runsInWorkspace(plugin, rows, trusted);
        const plugins = discovered.map(({ plugin }) => plugin);
        return {
            approved: discovered.filter(({ plugin }) => runs(plugin)),
            pending: this.stillPendingOf(plugins),
            withheld: plugins.filter((plugin) => !runs(plugin)),
        };
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
