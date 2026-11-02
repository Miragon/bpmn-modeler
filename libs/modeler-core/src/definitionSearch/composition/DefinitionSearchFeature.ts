import { DocumentPort, NotifierPort, WorkspacePort } from "../../kernel/port/hostPorts";
import { EditorContribution } from "../../editorSession/service/EditorContribution";
import { EditorSessionStore } from "../../editorSession/service/EditorSessionStore";
import { searchWorkspaceDefinitionsHandler } from "../adapter/in/definitionSearchMessageHandlers";
import { DefinitionSearchService } from "../service/DefinitionSearchService";
import { WorkspaceDefinitionIndex } from "../service/WorkspaceDefinitionIndex";
import { DefinitionSearchParticipant } from "../service/DefinitionSearchParticipant";

export interface DefinitionSearchHostPorts {
    readonly store: EditorSessionStore;
    readonly documents: DocumentPort;
    readonly workspace: WorkspacePort;
    readonly notifier: NotifierPort;
}

/**
 * The BPMN editor's search for messages, signals, errors and escalations that
 * other models of the workspace define, for every host.
 */
export class DefinitionSearchFeature {
    readonly editorContribution: EditorContribution<"SearchWorkspaceDefinitionsCommand">;

    private readonly definitionIndex: WorkspaceDefinitionIndex;

    constructor(ports: DefinitionSearchHostPorts) {
        this.definitionIndex = new WorkspaceDefinitionIndex(ports.workspace, ports.notifier);
        const search = new DefinitionSearchService(
            ports.store,
            ports.documents,
            ports.workspace,
            this.definitionIndex,
            ports.notifier,
        );
        this.editorContribution = {
            commandHandlers: {
                SearchWorkspaceDefinitionsCommand: searchWorkspaceDefinitionsHandler(search),
            },
            participant: new DefinitionSearchParticipant(search),
        };
    }

    dispose(): void {
        this.definitionIndex.dispose();
    }
}
