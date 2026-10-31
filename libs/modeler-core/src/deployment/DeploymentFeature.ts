import { posix } from "path";

import { Command, Query } from "@miragon/bpmn-modeler-shared";

import {
    DocumentPort,
    NotifierPort,
    PickerPort,
    SettingsPort,
    StatusBarPort,
    WorkspacePort,
} from "../kernel/domain/hostPorts";
import { UserCancelledError } from "../kernel/domain/errors";
import { EditorSessionStore } from "../editorSession/service/EditorSessionStore";
import { ArtifactService } from "../kernel/service/ArtifactService";
import { PendingEditsFlush } from "../editorSession/service/PendingEditsFlush";
import { DeploymentPickerPort, DeploymentStatePort, SecretStorePort } from "./domain/ports";
import { HttpClient } from "../kernel/domain/http";
import { AuthHeaderResolver } from "./infrastructure/camunda/AuthHeaderResolver";
import { Camunda7RestClient } from "./infrastructure/camunda/Camunda7RestClient";
import { Camunda8RestClient } from "./infrastructure/camunda/Camunda8RestClient";
import { CamundaEngineRouter } from "./infrastructure/camunda/CamundaEngineRouter";
import { FetchHttpClient } from "../kernel/infrastructure/FetchHttpClient";
import { CredentialApprovalService } from "./service/CredentialApprovalService";
import { DeployActiveDiagramService } from "./service/DeployActiveDiagramService";
import { DeployFilesService } from "./service/DeployFilesService";
import { DeploymentMessageDispatcher } from "./service/DeploymentMessageDispatcher";
import { DeploymentService } from "./service/DeploymentService";
import { DeploymentStatusService } from "./service/DeploymentStatusService";
import { DeploymentTargetService } from "./service/DeploymentTargetService";
import { DeploymentVerificationService } from "./service/DeploymentVerificationService";
import { EnvValueResolver } from "./service/EnvValueResolver";
import { SaveBeforeDeploy } from "./service/SaveBeforeDeploy";
import { StartInstanceService } from "./service/StartInstanceService";
import { DeploymentStatusParticipant } from "./session/DeploymentStatusParticipant";

export interface DeploymentHostPorts {
    store: EditorSessionStore;
    documents: DocumentPort;
    workspace: WorkspacePort;
    settings: SettingsPort;
    notifier: NotifierPort;
    picker: PickerPort & DeploymentPickerPort;
    statusBar: StatusBarPort;
    artifacts: ArtifactService;
    secrets: SecretStorePort;
    state: DeploymentStatePort;
    pendingEdits: Pick<PendingEditsFlush, "flushIntoDocument">;
    http?: HttpClient;
}

/** The host's deployment panel, as the feature drives it. */
export interface DeploymentPanel {
    handle(message: Command): Promise<void>;
    setVisible(visible: boolean): void;
    dispose(): void;
}

/**
 * Deployment for every host: builds the whole service graph from the host's
 * ports, runs the deployment commands, and drives the deployment panel and the
 * status-bar participant. A host only maps its command and panel surface onto
 * this; the flows themselves exist once.
 */
export class DeploymentFeature {
    readonly statusParticipant: DeploymentStatusParticipant;

    private readonly targets: DeploymentTargetService;
    private readonly status: DeploymentStatusService;
    private readonly verification: DeploymentVerificationService;
    private readonly deployActiveDiagram: DeployActiveDiagramService;
    private readonly deployFilesService: DeployFilesService;
    private readonly createDispatcher: (
        post: (message: Query) => void,
    ) => DeploymentMessageDispatcher;
    private openPanel: DeploymentMessageDispatcher | undefined;

    constructor(private readonly ports: DeploymentHostPorts) {
        const http = ports.http ?? new FetchHttpClient();
        const auth = new AuthHeaderResolver(http);
        const c7Client = new Camunda7RestClient(http, auth);
        const engines = new CamundaEngineRouter(
            c7Client,
            new Camunda8RestClient(http, auth, ports.settings.getC8ApiVersion()),
        );

        this.targets = new DeploymentTargetService(
            ports.artifacts,
            ports.settings,
            ports.workspace,
            ports.secrets,
            ports.state,
            ports.picker,
            ports.notifier,
        );
        const envResolver = new EnvValueResolver(ports.workspace);
        const credentialApproval = new CredentialApprovalService(ports.secrets, ports.picker);
        const startInstance = new StartInstanceService(
            ports.documents,
            ports.workspace,
            engines,
            ports.notifier,
            ports.picker,
            ports.artifacts,
            envResolver,
            credentialApproval,
        );
        this.status = new DeploymentStatusService(
            ports.store,
            ports.documents,
            this.targets,
            ports.state,
            ports.statusBar,
            ports.picker,
            ports.notifier,
            envResolver,
            ports.settings,
        );
        this.verification = new DeploymentVerificationService(
            ports.store,
            ports.documents,
            this.targets,
            this.status,
            c7Client,
            ports.notifier,
            envResolver,
            credentialApproval,
        );
        const deployment = new DeploymentService(
            ports.documents,
            ports.workspace,
            ports.state,
            engines,
            ports.notifier,
            ports.picker,
            ports.secrets,
            this.status,
            envResolver,
            credentialApproval,
        );
        const saveBeforeDeploy = new SaveBeforeDeploy(ports.documents, ports.pendingEdits);
        this.deployActiveDiagram = new DeployActiveDiagramService(
            ports.store,
            ports.documents,
            this.targets,
            deployment,
            ports.notifier,
            saveBeforeDeploy,
        );
        this.deployFilesService = new DeployFilesService(
            this.targets,
            deployment,
            ports.workspace,
            ports.picker,
            ports.notifier,
        );
        this.createDispatcher = (post) =>
            new DeploymentMessageDispatcher(
                ports.store,
                ports.documents,
                deployment,
                startInstance,
                this.targets,
                saveBeforeDeploy,
                ports.notifier,
                post,
            );
        this.statusParticipant = new DeploymentStatusParticipant(this.status);
        this.targets.onDidChange((event) => this.status.targetsChanged(event));
    }

    /**
     * Connects the host's deployment panel; `post` delivers to its webview. The
     * form follows the active editor while the panel is visible, and target
     * changes made by a command show up in it.
     */
    attachPanel(post: (message: Query) => void, visible: boolean): DeploymentPanel {
        const dispatcher = this.createDispatcher(post);
        this.openPanel = dispatcher;
        let panelVisible = visible;
        const activeEditorSubscription = this.ports.store.onDidChangeActiveEditor(() => {
            if (panelVisible) dispatcher.sendFormDefaults();
        });
        const targetsSubscription = this.targets.onDidChange(() => dispatcher.targetsChanged());
        return {
            handle: (message) => dispatcher.handle(message),
            setVisible: (nowVisible) => {
                panelVisible = nowVisible && this.openPanel === dispatcher;
                if (panelVisible) dispatcher.sendFormDefaults();
            },
            dispose: () => {
                panelVisible = false;
                activeEditorSubscription.dispose();
                targetsSubscription.dispose();
                if (this.openPanel === dispatcher) this.openPanel = undefined;
            },
        };
    }

    /** QuickPick → persist → status bar → an open panel mirrors the new active target. */
    switchTarget(documentDir = this.activeDocumentDir()): Promise<void> {
        return this.run(() => this.targets.switchActiveTarget(documentDir));
    }

    verify(documentDir = this.activeDocumentDir()): Promise<void> {
        return this.run(() => this.verification.verifyActive(documentDir));
    }

    /** The status-bar click: switch the target or verify the deployment. */
    statusMenu(documentDir = this.activeDocumentDir()): Promise<void> {
        return this.run(async () => {
            const action = await this.status.pickStatusBarAction(documentDir);
            if (action === "switch") {
                await this.targets.switchActiveTarget(documentDir);
            } else if (action === "verify") {
                await this.verification.verifyActive(documentDir);
            }
        });
    }

    deployFiles(documentDir = this.activeDocumentDir()): Promise<void> {
        return this.run(() => this.deployFilesService.deployFiles(documentDir));
    }

    /** Saves and deploys the active diagram; the target picker may run first. */
    deployActive(documentDir = this.activeDocumentDir()): Promise<void> {
        return this.run(() => this.deployActiveDiagram.deployActive(documentDir));
    }

    /** Directory of the active editor's document; commands also work with no diagram open. */
    activeDocumentDir(): string | undefined {
        try {
            return posix.dirname(
                this.ports.documents.getFilePath(this.ports.store.getActiveEditorId()),
            );
        } catch {
            return undefined;
        }
    }

    private async run(command: () => Promise<void>): Promise<void> {
        try {
            await command();
        } catch (error) {
            if (error instanceof UserCancelledError) return;
            this.ports.notifier.notifyError(
                "Deployment command failed",
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }
}
