import { allowanceKeyOf } from "../../../kernel/domain/allowance";
import { CodeApprovalChange } from "../../../kernel/domain/codeApproval";
import { NotifierPort, WorkspaceTrustPort } from "../../../kernel/port/hostPorts";
import { ApprovalQuestion } from "../../../kernel/service/ApprovalQuestion";
import { ContentRows } from "../../../kernel/service/ContentRowMigration";
import { Negotiation } from "../domain/LintSession";
import {
    BlockedRulePackage,
    editorsToRelint,
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
import { RulePackageInventory } from "./RulePackageInventory";

/** Absent: no workspace rule package runs, so there is nothing to ask about. */
export interface RulePackageApprovals {
    readonly catalog: RulePackageCatalog;
    readonly question: ApprovalQuestion<BlockedRulePackage, BlockedRulePackage, RulePackage>;
    /** Keeps the lint configs read and the packages the gate reported, which the add-on catalog lists. */
    readonly inventory: Pick<RulePackageInventory, "noteLintConfig" | "noteSeen">;
    /** A question waits for it, so the start-up migration is not asked about. */
    readonly contentRows: ContentRows;
    /** The linter reads it too: a change lints every host-linted editor again. */
    readonly trust: WorkspaceTrustPort;
}

/**
 * What follows a host lint that skipped or refused workspace rule packages:
 * the output channel lines and the question. Each change of the rule package
 * approvals, whoever made it, lints again the editors it makes stale, and a
 * change of the workspace's trust every editor linted on the host.
 */
export class RulePackageFollowUp {
    private readonly blockedByEditor = new Map<string, readonly string[]>();
    /** A lint runs on every edit; one queued question per allowance is enough until it is answered. */
    private readonly queuedAllowanceKeys = new Set<string>();
    /** Lines logged once per config version, so a relint on every edit repeats none of them. */
    private readonly loggedOncePerConfig = new Set<string>();
    private settled: Promise<void> = Promise.resolve();
    private readonly subscriptions: readonly { dispose(): void }[];

    constructor(
        private readonly notifier: NotifierPort,
        private readonly relint: (editorId: string) => Promise<unknown>,
        private readonly hostLintedEditors: () => readonly string[],
        private readonly approvals?: RulePackageApprovals,
    ) {
        this.subscriptions = approvals
            ? [
                  approvals.catalog.onApprovalsChanged((change) => this.relintAfter(change)),
                  approvals.trust.onDidChange(() => this.relintEditors(this.hostLintedEditors())),
              ]
            : [];
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
        this.subscriptions.forEach((each) => each.dispose());
    }

    log(negotiation: Negotiation, { blocked, refused }: LintRun): void {
        this.approvals?.inventory.noteLintConfig(negotiation.configPath);
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
     * it, and the editor's lints must go on meanwhile. A lint during the
     * migration may be blocked; the migration's change lints it again.
     */
    ask(editorId: string, blocked: readonly BlockedRulePackage[]): void {
        if (this.approvals === undefined) return;
        const { inventory, question, contentRows } = this.approvals;
        this.blockedByEditor.set(
            editorId,
            blocked.map(({ id }) => id),
        );
        inventory.noteSeen(blocked);
        const toAsk = rulePackagesToAsk(blocked, this.queuedAllowanceKeys);
        if (toAsk.length === 0) return;
        const keys = toAsk.map(({ allowance }) => allowanceKeyOf(allowance));
        keys.forEach((key) => this.queuedAllowanceKeys.add(key));
        const asking = contentRows
            .whenSettled()
            .then(() => question.ask(toAsk))
            .finally(() => keys.forEach((key) => this.queuedAllowanceKeys.delete(key)))
            .catch((error: unknown) => this.logError(error));
        this.settle(asking);
    }

    /** A closed editor is never linted again on an allow. */
    release(editorId: string): void {
        this.blockedByEditor.delete(editorId);
    }

    private relintAfter(change: CodeApprovalChange): void {
        this.relintEditors(editorsToRelint(this.blockedByEditor, this.hostLintedEditors(), change));
    }

    private relintEditors(editorIds: readonly string[]): void {
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
