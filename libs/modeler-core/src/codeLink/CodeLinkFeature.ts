import { NotifierPort, PickerPort, SettingsPort, WorkspacePort } from "../kernel/domain/hostPorts";
import { ArtifactService } from "../kernel/service/ArtifactService";
import { EditorContribution } from "../editorSession/service/EditorContribution";
import { EditorSessionStore } from "../editorSession/service/EditorSessionStore";
import {
    navigateToImplementationHandler,
    syncActivitiesHandler,
} from "./infrastructure/codeLinkMessageHandlers";
import { CodeLinkMapService } from "./service/CodeLinkMapService";
import { ImplementationLocator } from "./service/ImplementationLocator";
import { ImplementationNavigationService } from "./service/ImplementationNavigationService";
import { SourceIndex } from "./service/SourceIndex";
import { CodeLinkParticipant } from "./session/CodeLinkParticipant";

export interface CodeLinkHostPorts {
    readonly store: EditorSessionStore;
    readonly workspace: WorkspacePort;
    readonly settings: SettingsPort;
    readonly notifier: NotifierPort;
    readonly picker: PickerPort;
    readonly artifacts: ArtifactService;
}

/**
 * Code-link for every host: one locator serves both the on-click "Go to
 * implementation" and the always-on activity→code map, which keeps the context
 * pad and live linking current off the source-file watcher.
 */
export class CodeLinkFeature {
    readonly editorContribution: EditorContribution<
        "NavigateToImplementationCommand" | "SyncActivitiesCommand"
    >;

    private readonly codeLinkMap: CodeLinkMapService;

    constructor(ports: CodeLinkHostPorts) {
        const locator = new ImplementationLocator(ports.workspace, ports.notifier);
        const navigation = new ImplementationNavigationService(
            locator,
            ports.notifier,
            ports.picker,
        );
        this.codeLinkMap = new CodeLinkMapService(
            ports.store,
            locator,
            new SourceIndex(ports.workspace, ports.notifier),
            ports.artifacts,
            ports.workspace,
            ports.settings,
            ports.notifier,
        );
        this.editorContribution = {
            commandHandlers: {
                NavigateToImplementationCommand: navigateToImplementationHandler(
                    ports.store,
                    navigation,
                    ports.notifier,
                ),
                SyncActivitiesCommand: syncActivitiesHandler(this.codeLinkMap),
            },
            participant: new CodeLinkParticipant(this.codeLinkMap),
        };
    }

    dispose(): void {
        this.codeLinkMap.dispose();
    }
}
