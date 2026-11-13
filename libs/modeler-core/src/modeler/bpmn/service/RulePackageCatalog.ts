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
    declinedKeys,
    notAskedAgain,
    ReviewAnswer,
    SessionAnswer,
} from "../../../kernel/domain/approvalAnswer";
import { approvalRowsOf } from "../../../kernel/domain/approvalRowKind";
import {
    approvalChangeBetween,
    CodeApproval,
    CodeApprovalChange,
} from "../../../kernel/domain/codeApproval";
import { ChoicePrompt } from "../../../kernel/domain/prompts";
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
 * the user did not trust, none is asked about. What a lint read and reported
 * for the add-on catalog is `RulePackageInventory`'s.
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
    private readonly revoked = new Set<string>();
    private readonly answerListeners = new Set<() => void>();
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

    /** By `allowanceKeyOf`: what the user answered this session about each allowance. */
    sessionAnswers(): ReadonlyMap<string, SessionAnswer> {
        return this.answers;
    }

    /** No notice asks about this allowance again this session; a view shows it. */
    leaveForView(code: AllowableCode): void {
        this.answers.set(allowanceKeyOf(code.allowance), "leftForView");
        this.notifyAnswered();
    }

    onDidAnswer(listener: () => void): { dispose(): void } {
        this.answerListeners.add(listener);
        return { dispose: () => this.answerListeners.delete(listener) };
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
        if (outcome.answers.size > 0) this.notifyAnswered();
        if (outcome.allowed.length > 0) {
            await this.approvals.change(allowingAllowances(outcome.allowed));
            this.logger.logInfo(
                `Allowed bpmnlint rule package(s): ${outcome.allowed.map(rulePackageLabelOf).join(", ")}`,
            );
        }
        return outcome.allowed;
    }

    private notifyAnswered(): void {
        this.answerListeners.forEach((listener) => listener());
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
