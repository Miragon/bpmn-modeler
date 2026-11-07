import {
    ActionNotifierPort,
    NotifierPort,
    PickerPort,
    WorkspacePort,
} from "../../kernel/port/hostPorts";
import { ArtifactService } from "../../kernel/service/ArtifactService";
import { EditorContribution } from "../../editorSession/service/EditorContribution";
import { EditorSessionStore } from "../../editorSession/service/EditorSessionStore";
import { getBpmnPluginsHandler } from "../adapter/in/pluginMessageHandlers";
import { ContentHasherPort, PluginApprovalStorePort } from "../port/pluginPorts";
import { BpmnPluginService } from "../service/BpmnPluginService";
import { BpmnPluginsParticipant } from "../service/BpmnPluginsParticipant";
import { PluginCatalog } from "../service/PluginCatalog";
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
}

/**
 * User-supplied bpmn-js plugins from `<configFolder>/plugins/`: discovery,
 * per-user approval by content hash, and serving the approved bytes to the
 * BPMN webview. A host that wires it hands its contribution to the BPMN editor.
 */
export class BpmnPluginsFeature {
    readonly editorContribution: EditorContribution<"GetBpmnPluginsCommand">;
    readonly catalog: PluginCatalog;
    readonly service: BpmnPluginService;

    private readonly locator: WorkspacePluginLocator;

    constructor(ports: BpmnPluginsHostPorts) {
        this.locator = new WorkspacePluginLocator(
            ports.artifacts,
            ports.workspace,
            ports.hasher,
            ports.notifier,
        );
        this.catalog = new PluginCatalog(this.locator, ports.approvals, ports.notifier);
        this.service = new BpmnPluginService(
            ports.store,
            ports.workspace,
            this.catalog,
            ports.picker,
            ports.actionNotifier,
            ports.notifier,
            ports.cacheRoot,
        );
        this.editorContribution = {
            commandHandlers: { GetBpmnPluginsCommand: getBpmnPluginsHandler(this.service) },
            participant: new BpmnPluginsParticipant(this.service),
        };
    }

    dispose(): void {
        this.locator.dispose();
    }
}
