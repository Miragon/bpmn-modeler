import { posix } from "path";

import { DeploymentTargetService } from "@miragon/bpmn-modeler-core";

import { VsCodeStatusBar } from "../../../shared/infrastructure/VsCodeStatusBar";
import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../modeler/editor-session/EditorSessionParticipant";

/**
 * Shows the active-deployment-target status bar item while a BPMN editor is
 * focused and hides it otherwise, mirroring the engine-version participant. The
 * displayed name follows the target file nearest the focused document.
 */
export class DeploymentTargetStatusBarParticipant implements EditorSessionParticipant {
    constructor(
        private readonly statusBar: VsCodeStatusBar,
        private readonly deploymentTargetService: DeploymentTargetService,
    ) {}

    onResolve(session: EditorSessionContext): void {
        const subscription = session.panel.onDidChangeViewState(() => {
            if (session.panel.active) {
                void this.deploymentTargetService.refreshStatusBar(posix.dirname(session.editorId));
            } else {
                this.statusBar.hideDeploymentTarget();
            }
        });
        session.addDisposable(subscription);

        session.onDispose(() => this.statusBar.hideDeploymentTarget());
    }
}
