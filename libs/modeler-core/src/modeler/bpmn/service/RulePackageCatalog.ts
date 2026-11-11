import { ActionNotice } from "../../../kernel/domain/actionNotice";
import {
    allowing,
    ApprovableArtifact,
    ApprovalNoticeAction,
    CodeApproval,
    approvalOutcome,
    declineKeyOf,
    declinedKeys,
    FollowedApprovalChange,
    followedApprovalChange,
    isLeftForView,
    notAskedAgain,
    pendingApprovals,
    ReviewAnswer,
    SessionAnswer,
} from "../../../kernel/domain/codeApproval";
import { approvalRowsOf } from "../../../kernel/domain/approvalRowKind";
import { ChoicePrompt } from "../../../kernel/domain/prompts";
import { parentWorkspacePath } from "../../../kernel/domain/workspacePath";
import { PluginApprovalStorePort } from "../../../kernel/port/approvalPorts";
import { LoggerPort } from "../../../kernel/port/hostPorts";
import { ApprovalCatalog } from "../../../kernel/service/ApprovalQuestion";
import { CarriedApprovalWriter } from "../../../kernel/service/CarriedApprovalWriter";
import {
    BlockedRulePackage,
    PendingRulePackage,
    RulePackage,
    rulePackageApprovalNotice,
    RULE_PACKAGE_CODE_TEXTS,
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
 * declines, so it reports such a package as declined rather than new. A
 * package left to a view is not asked about again either, but stays new.
 *
 * It follows the approval store and announces each change of the rule
 * package rows, whoever made it.
 */
export class RulePackageCatalog implements ApprovalCatalog<
    BlockedRulePackage,
    PendingRulePackage,
    RulePackage
> {
    private readonly answers = new Map<string, SessionAnswer>();
    private readonly seen = new Map<string, BlockedRulePackage>();
    private readonly loggedRefusals = new Set<string>();
    private readonly revoked = new Set<string>();
    private readonly lintConfigFolders = new Set<string>();
    private readonly listingListeners = new Set<() => void>();
    private readonly changeListeners = new Set<(followed: FollowedApprovalChange) => void>();
    private readonly approvalChanges: { dispose(): void };
    private readonly carriedApprovalWriter: CarriedApprovalWriter;
    private rulePackageRows: readonly CodeApproval[];

    constructor(
        private readonly approvals: PluginApprovalStorePort,
        private readonly fingerprints: Pick<PackageClosureFingerprinter, "fingerprint">,
        private readonly logger: LoggerPort,
    ) {
        this.carriedApprovalWriter = new CarriedApprovalWriter(
            approvals,
            logger,
            RULE_PACKAGE_CODE_TEXTS,
        );
        this.rulePackageRows = approvalRowsOf("rulePackage", approvals.read());
        this.approvalChanges = approvals.onDidChange(() => this.followApprovals());
    }

    /** `declineKeyOf` of each package declined this session. */
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

    /** By `declineKeyOf`: what the user answered this session about each content. */
    sessionAnswers(): ReadonlyMap<string, SessionAnswer> {
        return this.answers;
    }

    /** No notice asks about this package again this session, whatever its content; a view shows it. */
    leaveForView(artifact: ApprovableArtifact): void {
        this.answers.set(declineKeyOf(artifact), "leftForView");
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

    /** Stores a row where a package runs on another place's row of its content; never rejects. */
    recordCarried(found: readonly ApprovableArtifact[]): Promise<void> {
        return this.carriedApprovalWriter.record(found);
    }

    /** Revoked from a view, also at places whose code ran on another place's row. */
    noteRevoked(ids: readonly string[]): void {
        ids.forEach((id) => this.revoked.add(id));
    }

    onApprovalsChanged(listener: (followed: FollowedApprovalChange) => void): { dispose(): void } {
        this.changeListeners.add(listener);
        return { dispose: () => this.changeListeners.delete(listener) };
    }

    dispose(): void {
        this.approvalChanges.dispose();
    }

    /**
     * Hashed only now: while no rule package row exists the gate blocks a
     * package without reading it, and a package left to the view is not
     * hashed again at all.
     */
    stillPendingOf(found: readonly BlockedRulePackage[]): PendingRulePackage[] {
        const rulePackages = rulePackagesToAsk(found)
            .filter(({ id }) => !isLeftForView(id, this.answers))
            .flatMap((each) => this.rulePackageOf(each));
        return pendingApprovals(
            rulePackages,
            approvalRowsOf("rulePackage", this.approvals.read()),
            notAskedAgain(this.answers),
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
        answer: ReviewAnswer,
    ): Promise<readonly RulePackage[]> {
        const outcome = approvalOutcome(pending, answer);
        outcome.answers.forEach((each, key) => this.answers.set(key, each));
        if (outcome.answers.size > 0) this.notifyListing();
        if (outcome.allowed.length > 0) {
            await this.approvals.change(allowing(outcome.allowed));
            this.logger.logInfo(
                `Allowed bpmnlint rule package(s): ${outcome.allowed.map(({ name }) => name).join(", ")}`,
            );
        }
        return outcome.allowed;
    }

    private notifyListing(): void {
        this.listingListeners.forEach((listener) => listener());
    }

    private followApprovals(): void {
        const rows = approvalRowsOf("rulePackage", this.approvals.read());
        const followed = followedApprovalChange(this.rulePackageRows, rows);
        this.rulePackageRows = rows;
        const { allow, revoke } = followed.change;
        if (allow.length === 0 && revoke.length === 0) return;
        revoke.forEach((id) => this.revoked.add(id));
        this.changeListeners.forEach((listener) => listener(followed));
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
