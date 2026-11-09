import { ActionNotice } from "../../../kernel/domain/actionNotice";
import {
    allowing,
    ApprovalNoticeAction,
    approvalOutcome,
    pendingApprovals,
} from "../../../kernel/domain/codeApproval";
import { ChoicePrompt } from "../../../kernel/domain/prompts";
import { PluginApprovalStorePort } from "../../../kernel/port/approvalPorts";
import { LoggerPort } from "../../../kernel/port/hostPorts";
import { ApprovalCatalog } from "../../../kernel/service/ApprovalQuestion";
import {
    BlockedRulePackage,
    isRulePackageApproval,
    PendingRulePackage,
    RulePackage,
    rulePackageApprovalNotice,
    rulePackageApprovalPrompt,
    rulePackagesToAsk,
} from "../domain/rulePackageApproval";
import { refusedRuleModuleLogLine } from "../domain/rulePackageLog";
import { PackageClosureFingerprinter } from "./PackageClosureFingerprinter";

/**
 * Which blocked workspace rule packages to ask about, and the user's answers.
 * Knows no editor, so every host shares it.
 *
 * A package the user left unchecked, or a notice the user closed, is declined
 * for the catalog's lifetime, unless its content changes. The gate reads the
 * declines, so it reports such a package as declined rather than new.
 */
export class RulePackageCatalog implements ApprovalCatalog<
    BlockedRulePackage,
    PendingRulePackage,
    RulePackage
> {
    private readonly declined = new Set<string>();
    private readonly seen = new Map<string, BlockedRulePackage>();
    private readonly loggedRefusals = new Set<string>();

    constructor(
        private readonly approvals: PluginApprovalStorePort,
        private readonly fingerprints: Pick<PackageClosureFingerprinter, "fingerprint">,
        private readonly logger: LoggerPort,
    ) {}

    /** `declineKeyOf` of each package declined this session. */
    declinedThisSession(): ReadonlySet<string> {
        return this.declined;
    }

    /** Keeps the latest report of each package, also of those the bundle stood in for. */
    noteSeen(blocked: readonly BlockedRulePackage[]): void {
        blocked.forEach((each) => this.seen.set(each.id, each));
    }

    seenPackages(): readonly BlockedRulePackage[] {
        return [...this.seen.values()];
    }

    /** Hashed only now: the gate blocks a package it has no row for without reading it. */
    stillPendingOf(found: readonly BlockedRulePackage[]): PendingRulePackage[] {
        const rulePackages = rulePackagesToAsk(found).flatMap((each) => this.rulePackageOf(each));
        return pendingApprovals(
            rulePackages,
            this.approvals.read().filter(isRulePackageApproval),
            this.declined,
        );
    }

    reviewNotice(pending: readonly PendingRulePackage[]): ActionNotice<ApprovalNoticeAction> {
        return rulePackageApprovalNotice(pending);
    }

    reviewPrompt(
        pending: readonly PendingRulePackage[],
        workspaceFolders: readonly string[],
    ): ChoicePrompt<string> {
        return rulePackageApprovalPrompt(pending, workspaceFolders);
    }

    /** @returns the packages now allowed. */
    async applyAnswer(
        pending: readonly PendingRulePackage[],
        checkedIds: readonly string[],
    ): Promise<readonly RulePackage[]> {
        const outcome = approvalOutcome(pending, checkedIds);
        outcome.declineKeys.forEach((key) => this.declined.add(key));
        if (outcome.allowed.length > 0) {
            await this.approvals.change(allowing(outcome.allowed));
            this.logger.logInfo(
                `Allowed bpmnlint rule package(s): ${outcome.allowed.map(({ name }) => name).join(", ")}`,
            );
        }
        return outcome.allowed;
    }

    private rulePackageOf({ id, kind }: BlockedRulePackage): RulePackage[] {
        const fingerprint = this.fingerprints.fingerprint({ id, kind });
        if (fingerprint.kind === "fingerprinted") {
            return [fingerprint.rulePackage];
        }
        const { reason, memberDir } = fingerprint;
        const line = refusedRuleModuleLogLine({ kind: "closure", id, memberDir, reason });
        if (!this.loggedRefusals.has(line)) {
            this.loggedRefusals.add(line);
            this.logger.logWarning(line);
        }
        return [];
    }
}
