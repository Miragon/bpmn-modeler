import { reviewOrChecklist } from "../../../kernel/adapter/out/ListReview";
import { trustOrTrusted } from "../../../kernel/adapter/out/TrustedWorkspace";
import { ApprovalReviewPort, PluginApprovalStorePort } from "../../../kernel/port/approvalPorts";
import {
    ActionNotifierPort,
    NotifierPort,
    PickerPort,
    WorkspacePort,
    WorkspaceTrustPort,
} from "../../../kernel/port/hostPorts";
import { AllowanceLocator } from "../../../kernel/service/AllowanceLocator";
import { ApprovalQuestion } from "../../../kernel/service/ApprovalQuestion";
import { ContentRows } from "../../../kernel/service/ContentRowMigration";
import { QuestionQueue } from "../../../kernel/service/QuestionQueue";
import { InstalledPackagesPort } from "../port/installedPackagesPort";
import { NodeBpmnLinter } from "../adapter/out/bpmnlint/NodeBpmnLinter";
import { RulePackageApprovals } from "../service/BpmnLintConfigService";
import { RulePackageCatalog } from "../service/RulePackageCatalog";
import { RulePackageInventory } from "../service/RulePackageInventory";

/** What a host wires so that the workspace bpmnlint rule packages the user allowed run. */
export interface BpmnRulePackagePorts {
    /** The host's one approval list, which the plugin approvals share. */
    readonly approvals: PluginApprovalStorePort;
    readonly installedPackages: InstalledPackagesPort;
    /** The host process's one locator, so plugins, rule packages and the view agree on each allowance. */
    readonly allowances: AllowanceLocator;
    /** What a question about a rule package waits for, so the start-up migration is not asked about. */
    readonly contentRows: ContentRows;
    readonly actionNotifier: ActionNotifierPort;
    /** Shared with the host's other approval questions, so two notices never stand side by side. */
    readonly questions: QuestionQueue;
    /** Where "Review…" takes the user, as {@link reviewOrChecklist} defaults it. */
    readonly review?: ApprovalReviewPort;
    /** Absent: the host has no trust feature, and the workspace counts as trusted. */
    readonly workspaceTrust?: WorkspaceTrustPort;
}

/** The host ports rule package linting shares with the rest of the BPMN editor. */
export interface RulePackageLintingHost {
    readonly notifier: NotifierPort;
    readonly picker: PickerPort;
    readonly workspace: WorkspacePort;
}

/** The parts of host linting that decide which workspace rule packages run. */
export interface RulePackageLinting {
    readonly linter: NodeBpmnLinter;
    /** Absent without {@link BpmnRulePackagePorts}. */
    readonly approvals?: RulePackageApprovals;
    /** What the add-on catalog lists of the rule packages; absent without {@link BpmnRulePackagePorts}. */
    readonly inventory?: RulePackageInventory;
    /** Stops following the approval store. */
    dispose(): void;
}

/** Without {@link BpmnRulePackagePorts}, the linter builds no workspace resolver and runs only the bundled rules. */
export function rulePackageLinting(
    rulePackages: BpmnRulePackagePorts | undefined,
    host: RulePackageLintingHost,
): RulePackageLinting {
    if (rulePackages === undefined) {
        return { linter: new NodeBpmnLinter(), dispose: () => undefined };
    }
    const {
        approvals,
        installedPackages,
        allowances,
        contentRows,
        actionNotifier,
        questions,
        review,
    } = rulePackages;
    const trust = trustOrTrusted(rulePackages.workspaceTrust);
    const catalog = new RulePackageCatalog(approvals, trust, host.notifier);
    const question = new ApprovalQuestion(
        catalog,
        reviewOrChecklist(review, host.picker),
        actionNotifier,
        host.workspace,
        questions,
    );
    const inventory = new RulePackageInventory(catalog, installedPackages, allowances);
    return {
        approvals: { catalog, question, inventory, contentRows, trust },
        inventory,
        linter: new NodeBpmnLinter({
            approvals,
            packages: installedPackages,
            allowances,
            declinedThisSession: () => catalog.declinedThisSession(),
            trust,
        }),
        dispose: () => catalog.dispose(),
    };
}
