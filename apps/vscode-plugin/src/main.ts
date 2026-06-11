import { env, ExtensionContext, Uri, window } from "vscode";

import { setContext } from "./shared/infrastructure/extensionContext";
import { buildSharedDeps } from "./composition/sharedDeps";
import * as diffFeature from "./composition/diffFeature";
import * as scriptFeature from "./composition/scriptFeature";
import * as editorFeature from "./composition/editorFeature";
import * as compareFeature from "./composition/compareFeature";
import * as commandsFeature from "./composition/commandsFeature";
import * as deploymentFeature from "./composition/deploymentFeature";

/**
 * Activation is now pure composition: build the shared collaborators once, then
 * let each feature wire itself via its own `register()`. Adding a feature means
 * adding one file and one line here — no longer surgery on a 200-line body.
 *
 * The register order is observable (it is the order custom editors, providers,
 * and commands become available) and is preserved exactly: diff → script →
 * editor → compare → commands → deployment. Handles flow forward only:
 * the editor routes into diff's controller and script's service; compare and
 * commands reuse handles the earlier features returned.
 */
export function activate(context: ExtensionContext): void {
    notifyIfNewRelease(context);

    setContext(context);

    const deps = buildSharedDeps(context);
    const { diffController } = diffFeature.register(context, deps);
    const { scriptTaskSvc, scriptVariableStore } = scriptFeature.register(context, deps);
    const { bpmnService } = editorFeature.register(context, deps, {
        diffController,
        scriptTaskSvc,
        scriptVariableStore,
    });
    compareFeature.register(context, deps, { diffController });
    commandsFeature.register(context, deps, { bpmnService });
    deploymentFeature.register(context, deps);
}

const RELEASES_BASE = "https://github.com/Miragon/bpmn-modeler/releases/tag";
const LAST_NOTIFIED_KEY = "lastNotifiedVersion";

function notifyIfNewRelease(context: ExtensionContext): void {
    const current: string = context.extension.packageJSON.version;
    const last = context.globalState.get<string>(LAST_NOTIFIED_KEY);

    if (current === last) {
        return;
    }

    // Persist before showing so a crash/dismiss never re-triggers the prompt.
    context.globalState.update(LAST_NOTIFIED_KEY, current);

    window
        .showInformationMessage(
            `BPMN Modeler updated to v${current}. See what's new!`,
            "View Release Notes",
        )
        .then((selection) => {
            if (selection === "View Release Notes") {
                env.openExternal(Uri.parse(`${RELEASES_BASE}/v${current}`));
            }
        });
}
