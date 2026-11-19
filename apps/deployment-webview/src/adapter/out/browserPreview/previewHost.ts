import { MockHostApi, type DeploymentSidebarCommand, type Query } from "@miragon/bpmn-modeler-shared";

import type { WebviewState } from "../../../port/deploymentHost";
import { routePreviewCommand } from "./previewCommands";
import { PreviewTargets } from "./targetsPreview";

/**
 * The browser preview's host: answers the sidebar's commands with synthetic
 * `MessageEvent`s, as the command table in `previewCommands.ts` routes them.
 * Each answer lives in its feature's module beside this one.
 */
export class PreviewHost extends MockHostApi<WebviewState, DeploymentSidebarCommand> {
    private readonly targets = new PreviewTargets();

    override postMessage(message: DeploymentSidebarCommand): void {
        routePreviewCommand(message, { targets: this.targets, reply });
    }
}

function reply(...queries: readonly Query[]): void {
    for (const query of queries) {
        window.dispatchEvent(new MessageEvent("message", { data: query }));
    }
}
