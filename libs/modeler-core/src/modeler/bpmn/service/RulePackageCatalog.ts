import { ActionNotice } from "../../../kernel/domain/actionNotice";
import {
    AllowableCode,
    allowanceKeyOf,
    allowanceOutcome,
    allowingAllowances,
    pendingAllowances,
} from "../../../kernel/domain/allowance";
import {
    ApprovalNoticeAction,
    approvalChangeBetween,
    CodeApproval,
    CodeApprovalChange,
    declinedKeys,
    notAskedAgain,
    ReviewAnswer,
    SessionAnswer,
} from "../../../kernel/domain/codeApproval";
import { approvalRowsOf } from "../../../kernel/domain/approvalRowKind";
import { ChoicePrompt } from "../../../kernel/domain/prompts";
import { parentWorkspacePath } from "../../../kernel/domain/workspacePath";
import { askedInWorkspace } from "../../../kernel/domain/workspaceTrust";
import { PluginApprovalStorePort } from "../../../kernel/port/approvalPorts";
import { LoggerPort, WorkspaceTrustPort } from "../../../kernel/port/hostPorts";
import { ApprovalCatalog } from "../../../kernel/service/ApprovalQuestion";
import {
    BlockedRulePackage,
    RulePackage,
    rulePackageApprovalNotice,
    rulePackageApprovalPrompt,
    rulePackageLabelOf,
    rulePackagesToAsk,
} from "../domain/rulePackageApproval";

/**
 * Which blocked workspace rule packages to ask about, and the user's answers.
 * Knows no editor, so every host shares it.
 *
 * A package the user left unchecked, or a notice the user closed, is declined
 * by its allowance for the catalog's lifetime. The gate reads the declines,
 * so it reports such a package as declined rather than new. A package left
 * to a view is not asked about again either, but stays new. In a workspace
 * the user did not trust, none is asked about.
 *
 * It follows the approval store and announces each change of the rule
 * package rows, whoever made it.
 */
export class RulePackageCatalog implements ApprovalCatalog<
    BlockedRulePackage,
    BlockedRulePackage,
    RulePackage
> {
    private readonly answers = new Map<string, SessionAnswer>();
    private readonly seen = new Map<string, BlockedRulePackage>();
    private readonly revoked = new Set<string>();
    private readonly lintConfigFolders = new Set<string>();
    private readonly listingListeners = new Set<() => void>();
    private readonly changeListeners = new Set<(change: CodeApprovalChange) => void>();
    private readonly approvalChanges: { dispose(): void };
    private rulePackageRows: readonly CodeApproval[];

    constructor(
        private readonly approvals: PluginApprovalStorePort,
        private readonly trust: Pick<WorkspaceTrustPort, "isTrusted">,
        private readonly logger: LoggerPort,
    ) {
        this.rulePackageRows = approvalRowsOf("rulePackage", approvals.read());
        this.approvalChanges = approvals.onDidChange(() => this.followApprovals());
    }

    /** `allowanceKeyOf` of each package declined this session. */
    declinedThisSession(): ReadonlySet<string> {
        return declinedKeys(this.answers);
    }

    /** Keeps the latest report of each package, also of those the bundle stood in for. */
    noteSeen(blocked: readonly BlockedRulePackage[]): void {
        const before = this.seen.size;
        const restated = blocked.filter(({ id, kind, state }) => {
            const known = this.seen.get(id);
            return known !== undefined && (known.kind !== kind || known.state !== state);
        });
        blocked.forEach((each) => this.seen.set(each.id, each));
        if (this.seen.size !== before || restated.length > 0) this.notifyListing();
    }

    /** The folders of the lint configs read so far, whose `node_modules` the add-on catalog lists. */
    noteLintConfig(configPath: string): void {
        const configDir = parentWorkspacePath(configPath);
        if (configDir === undefined || this.lintConfigFolders.has(configDir)) return;
        this.lintConfigFolders.add(configDir);
        this.notifyListing();
    }

    lintConfigDirs(): readonly string[] {
        return [...this.lintConfigFolders];
    }

    /** By `allowanceKeyOf`: what the user answered this session about each allowance. */
    sessionAnswers(): ReadonlyMap<string, SessionAnswer> {
        return this.answers;
    }

    /** No notice asks about this allowance again this session; a view shows it. */
    leaveForView(code: AllowableCode): void {
        this.answers.set(allowanceKeyOf(code.allowance), "leftForView");
        this.notifyListing();
    }

    /** After an answer, a lint config read anew, or a package or state the gate had not reported. */
    onDidChangeListing(listener: () => void): { dispose(): void } {
        this.listingListeners.add(listener);
        return { dispose: () => this.listingListeners.delete(listener) };
    }

    seenPackages(): readonly BlockedRulePackage[] {
        return [...this.seen.values()];
    }

    /** Code a package ran before its revoke stays loaded until the process restarts. */
    revokedThisSession(): ReadonlySet<string> {
        return this.revoked;
    }

    onApprovalsChanged(listener: (change: CodeApprovalChange) => void): { dispose(): void } {
        this.changeListeners.add(listener);
        return { dispose: () => this.changeListeners.delete(listener) };
    }

    dispose(): void {
        this.approvalChanges.dispose();
    }

    stillPendingOf(found: readonly BlockedRulePackage[]): readonly BlockedRulePackage[] {
        return askedInWorkspace(
            pendingAllowances(
                rulePackagesToAsk(found),
                this.approvals.read(),
                notAskedAgain(this.answers),
            ),
            this.trust.isTrusted(),
        );
    }

    reviewNotice(pending: readonly BlockedRulePackage[]): ActionNotice<ApprovalNoticeAction> {
        return rulePackageApprovalNotice(pending);
    }

    reviewPrompt(
        pending: readonly BlockedRulePackage[],
        workspaceFolders: readonly string[],
    ): ChoicePrompt<string> {
        return rulePackageApprovalPrompt(pending, workspaceFolders);
    }

    /** @returns the packages now allowed. */
    async applyAnswer(
        pending: readonly BlockedRulePackage[],
        answer: ReviewAnswer,
    ): Promise<readonly RulePackage[]> {
        const outcome = allowanceOutcome(pending, answer);
        outcome.answers.forEach((each, key) => this.answers.set(key, each));
        if (outcome.answers.size > 0) this.notifyListing();
        if (outcome.allowed.length > 0) {
            await this.approvals.change(allowingAllowances(outcome.allowed));
            this.logger.logInfo(
                `Allowed bpmnlint rule package(s): ${outcome.allowed.map(rulePackageLabelOf).join(", ")}`,
            );
        }
        return outcome.allowed;
    }

    private notifyListing(): void {
        this.listingListeners.forEach((listener) => listener());
    }

    private followApprovals(): void {
        const rows = approvalRowsOf("rulePackage", this.approvals.read());
        const change = approvalChangeBetween(this.rulePackageRows, rows);
        this.rulePackageRows = rows;
        if (change.allow.length === 0 && change.revoke.length === 0) return;
        change.revoke.forEach((id) => this.revoked.add(id));
        this.changeListeners.forEach((listener) => listener(change));
    }
}
