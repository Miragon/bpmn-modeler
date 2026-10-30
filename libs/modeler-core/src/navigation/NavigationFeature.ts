import { DocumentPort, NotifierPort, PickerPort, WorkspacePort } from "../kernel/domain/hostPorts";
import { EditorContribution } from "../editorSession/service/EditorContribution";
import { EditorSessionStore } from "../editorSession/service/EditorSessionStore";
import {
    getFormReferenceStatusHandler,
    navigateToReferencedModelHandler,
} from "./infrastructure/navigationMessageHandlers";
import { FormReferenceStatusService } from "./service/FormReferenceStatusService";
import { ModelNavigationService } from "./service/ModelNavigationService";
import { ReferencedModelLocator } from "./service/ReferencedModelLocator";
import { FormReferenceStatusParticipant } from "./session/FormReferenceStatusParticipant";

export interface NavigationHostPorts {
    readonly store: EditorSessionStore;
    readonly documents: DocumentPort;
    readonly workspace: WorkspacePort;
    readonly notifier: NotifierPort;
    readonly picker: PickerPort;
}

/**
 * Referenced-model navigation for every host: opens a called process, decision
 * or linked form, and tells the BPMN editor which linked forms resolve.
 */
export class NavigationFeature {
    readonly editorContribution: EditorContribution<
        "NavigateToReferencedModelCommand" | "GetFormReferenceStatusCommand"
    >;

    private readonly formReferenceStatus: FormReferenceStatusService;

    constructor(ports: NavigationHostPorts) {
        const locator = new ReferencedModelLocator(ports.workspace, ports.notifier);
        const navigation = new ModelNavigationService(locator, ports.notifier, ports.picker);
        this.formReferenceStatus = new FormReferenceStatusService(
            ports.store,
            ports.documents,
            ports.workspace,
            locator,
            ports.notifier,
        );
        this.editorContribution = {
            commandHandlers: {
                NavigateToReferencedModelCommand: navigateToReferencedModelHandler(
                    ports.store,
                    navigation,
                    ports.notifier,
                ),
                GetFormReferenceStatusCommand: getFormReferenceStatusHandler(
                    this.formReferenceStatus,
                ),
            },
            participant: new FormReferenceStatusParticipant(this.formReferenceStatus),
        };
    }

    dispose(): void {
        this.formReferenceStatus.dispose();
    }
}
