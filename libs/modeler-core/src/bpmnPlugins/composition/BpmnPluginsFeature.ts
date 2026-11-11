import {
    ActionNotifierPort,
    NotifierPort,
    PickerPort,
    WorkspacePort,
    WorkspaceTrustPort,
} from "../../kernel/port/hostPorts";
import { reviewOrChecklist } from "../../kernel/adapter/out/ListReview";
import { trustOrTrusted } from "../../kernel/adapter/out/TrustedWorkspace";
import { ApprovalReviewPort } from "../../kernel/port/approvalPorts";
import { AllowanceLocator } from "../../kernel/service/AllowanceLocator";
import { ArtifactService } from "../../kernel/service/ArtifactService";
import { ContentRows } from "../../kernel/service/ContentRowMigration";
import { ApprovalQuestion } from "../../kernel/service/ApprovalQuestion";
import { QuestionQueue } from "../../kernel/service/QuestionQueue";
import { EditorContribution } from "../../editorSession/service/EditorContribution";
import { EditorSessionStore } from "../../editorSession/service/EditorSessionStore";
import { getBpmnPluginsHandler } from "../adapter/in/pluginMessageHandlers";
import { ContentHasherPort, PluginApprovalStorePort } from "../port/pluginPorts";
import { BpmnPluginService } from "../service/BpmnPluginService";
import { BpmnPluginsParticipant } from "../service/BpmnPluginsParticipant";
import { PluginCatalog } from "../service/PluginCatalog";
import { PluginInventory } from "../service/PluginInventory";
import { WorkspacePluginLocator } from "../service/WorkspacePluginLocator";

export interface BpmnPluginsHostPorts {
    readonly store: EditorSessionStore;
    readonly workspace: WorkspacePort;
    readonly artifacts: ArtifactService;
    readonly notifier: NotifierPort;
    readonly picker: PickerPort;
    readonly actionNotifier: ActionNotifierPort;
    readonly approvals: PluginApprovalStorePort;
    /** A folder outside every workspace that the host's BPMN webview may load files from. */
    readonly cacheRoot: string;
    /** SHA-256 needs a host's crypto; the core imports no host module. */
    readonly hasher: ContentHasherPort;
    /** The host process's one locator, so plugins, rule packages and the view agree on each allowance. */
    readonly allowances: AllowanceLocator;
    /** What a question about a plugin waits for, so the start-up migration is not asked about. */
    readonly contentRows: ContentRows;
    /** The host's one queue for every approval question: a queue of its own would show two notices at once. */
    readonly questions: QuestionQueue;
    /** Where "Review…" takes the user, as {@link reviewOrChecklist} defaults it. */
    readonly review?: ApprovalReviewPort;
    /** Absent: the host has no trust feature, and the workspace counts as trusted. */
    readonly workspaceTrust?: WorkspaceTrustPort;
    /** The clock the plugin cache records last use by; `Date.now` unless a spec passes one. */
    readonly now?: () => number;
}

/**
 * User-supplied bpmn-js plugins from `<configFolder>/plugins/`: discovery,
 * per-user allowance by repository and add-on, and serving the allowed bytes to the
 * BPMN webview. A host that wires it hands its contribution to the BPMN editor.
 */
export class BpmnPluginsFeature {
    readonly editorContribution: EditorContribution<"GetBpmnPluginsCommand">;
    readonly catalog: PluginCatalog;
    readonly service: BpmnPluginService;
    /** What the add-on catalog lists of the plugins. */
    readonly inventory: PluginInventory;

    private readonly locator: WorkspacePluginLocator;
    private readonly notifier: NotifierPort;
    private readonly runnableChanges: readonly { dispose(): void }[];

    constructor(ports: BpmnPluginsHostPorts) {
        this.notifier = ports.notifier;
        const trust = trustOrTrusted(ports.workspaceTrust);
        this.locator = new WorkspacePluginLocator(
            ports.artifacts,
            ports.workspace,
            ports.hasher,
            ports.allowances,
            ports.notifier,
        );
        this.catalog = new PluginCatalog(
            this.locator,
            ports.approvals,
            ports.contentRows,
            trust,
            ports.notifier,
        );
        this.service = new BpmnPluginService(
            ports.store,
            ports.workspace,
            this.catalog,
            new ApprovalQuestion(
                this.catalog,
                reviewOrChecklist(ports.review, ports.picker),
                ports.actionNotifier,
                ports.workspace,
                ports.questions,
            ),
            ports.notifier,
            ports.cacheRoot,
            ports.now,
        );
        this.inventory = new PluginInventory(this.locator, this.catalog, this.service);
        const runnableChanged = () =>
            this.service.runnablePluginsChanged(ports.approvals.read(), trust.isTrusted());
        this.runnableChanges = [
            ports.approvals.onDidChange(runnableChanged),
            trust.onDidChange(runnableChanged),
        ];
        this.editorContribution = {
            commandHandlers: { GetBpmnPluginsCommand: getBpmnPluginsHandler(this.service) },
            participant: new BpmnPluginsParticipant(this.service),
        };
    }

    /** For a host's start-up; never rejects, so a host can run it without awaiting it. */
    async pruneIdleCopies(): Promise<void> {
        try {
            await this.service.pruneIdleCopies();
        } catch (error) {
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
        }
    }

    dispose(): void {
        this.runnableChanges.forEach((each) => each.dispose());
        this.locator.dispose();
    }
}
