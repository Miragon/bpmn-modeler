import { NotifierPort } from "../../../kernel/port/hostPorts";
import { ApprovalQuestion } from "../../../kernel/service/ApprovalQuestion";
import { Negotiation } from "../domain/LintSession";
import { FollowedApprovalChange } from "../../../kernel/domain/codeApproval";
import {
    BlockedRulePackage,
    editorsToRelint,
    PendingRulePackage,
    RulePackage,
    rulePackagesToAsk,
} from "../domain/rulePackageApproval";
import {
    neededRulePackageLogLines,
    refusedRuleModuleLogLine,
    shadowedRulePackageLogLine,
} from "../domain/rulePackageLog";
import { LintRun } from "../port/bpmnPorts";
import { RulePackageCatalog } from "./RulePackageCatalog";

/** Absent: no workspace rule package runs, so there is nothing to ask about. */
export interface RulePackageApprovals {
    readonly catalog: RulePackageCatalog;
    readonly question: ApprovalQuestion<BlockedRulePackage, PendingRulePackage, RulePackage>;
}

/**
 * What follows a host lint that skipped or refused workspace rule packages:
 * the output channel lines and the question. Each change of the rule package
 * approvals, whoever made it, lints again the editors it makes stale.
 */
export class RulePackageFollowUp {
    private readonly blockedByEditor = new Map<string, readonly string[]>();
    /** A lint runs on every edit; one queued question per package is enough until it is answered. */
    private readonly queuedRulePackageIds = new Set<string>();
    /** Lines logged once per config version, so a relint on every edit repeats none of them. */
    private readonly loggedOncePerConfig = new Set<string>();
    private settled: Promise<void> = Promise.resolve();
    private readonly approvalChanges?: { dispose(): void };

    constructor(
        private readonly notifier: NotifierPort,
        private readonly relint: (editorId: string) => Promise<unknown>,
        private readonly hostLintedEditors: () => readonly string[],
        private readonly approvals?: RulePackageApprovals,
    ) {
        this.approvalChanges = approvals?.catalog.onApprovalsChanged((followed) =>
            this.relintAfter(followed),
        );
    }

    /** Resolves once every question raised so far is answered and the relints its answer caused ran. */
    async whenSettled(): Promise<void> {
        let settling: Promise<void>;
        do {
            settling = this.settled;
            await settling;
        } while (settling !== this.settled);
    }

    dispose(): void {
        this.approvalChanges?.dispose();
    }

    log(negotiation: Negotiation, { blocked, refused }: LintRun): void {
        this.approvals?.catalog.noteLintConfig(negotiation.configPath);
        neededRulePackageLogLines(blocked).forEach((line) => this.notifier.logWarning(line));
        const configVersion = `${negotiation.configPath}\0${negotiation.rawConfig}`;
        const logOnce = (line: string, log: (line: string) => void) => {
            const key = `${configVersion}\0${line}`;
            if (!this.loggedOncePerConfig.has(key)) {
                this.loggedOncePerConfig.add(key);
                log(line);
            }
        };
        refused
            .map(refusedRuleModuleLogLine)
            .forEach((line) => logOnce(line, (once) => this.notifier.logWarning(once)));
        const shadowed = shadowedRulePackageLogLine(blocked);
        if (shadowed !== undefined) {
            logOnce(shadowed, (once) => this.notifier.logInfo(once));
        }
    }

    /**
     * Not awaited: the question may stay open for as long as the user leaves
     * it, and the editor's lints must go on meanwhile.
     */
    ask(editorId: string, blocked: readonly BlockedRulePackage[]): void {
        if (this.approvals === undefined) return;
        const { catalog, question } = this.approvals;
        this.blockedByEditor.set(
            editorId,
            blocked.map(({ id }) => id),
        );
        catalog.noteSeen(blocked);
        const toAsk = rulePackagesToAsk(blocked, this.queuedRulePackageIds);
        if (toAsk.length === 0) return;
        toAsk.forEach(({ id }) => this.queuedRulePackageIds.add(id));
        const asking = question
            .ask(toAsk)
            .finally(() => toAsk.forEach(({ id }) => this.queuedRulePackageIds.delete(id)))
            .catch((error: unknown) => this.logError(error));
        this.settle(asking);
    }

    /** A closed editor is never linted again on an allow. */
    release(editorId: string): void {
        this.blockedByEditor.delete(editorId);
    }

    private relintAfter(followed: FollowedApprovalChange): void {
        const editorIds = editorsToRelint(this.blockedByEditor, this.hostLintedEditors(), followed);
        this.settle(
            Promise.all(editorIds.map((editorId) => this.relint(editorId))).catch(
                (error: unknown) => this.logError(error),
            ),
        );
    }

    private settle(work: Promise<unknown>): void {
        this.settled = Promise.all([this.settled, work]).then(() => undefined);
    }

    private logError(error: unknown): void {
        this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
    }
}
