import { env, ExtensionContext, Uri, window } from "vscode";

import { LoggerPort } from "@miragon/bpmn-modeler-core";
import { setContext } from "./shared/infrastructure/extensionContext";
import { buildSharedDeps } from "./composition/sharedDeps";
import * as diffFeature from "./composition/diffFeature";
import * as scriptFeature from "./composition/scriptFeature";
import * as codeLinkFeature from "./composition/codeLinkFeature";
import * as editorFeature from "./composition/editorFeature";
import * as compareFeature from "./composition/compareFeature";
import * as commandsFeature from "./composition/commandsFeature";
import * as deploymentFeature from "./composition/deploymentFeature";
import * as templateMarketplaceFeature from "./composition/templateMarketplaceFeature";

/**
 * Activation is now pure composition: build the shared collaborators once, then
 * let each feature wire itself via its own `register()`. Adding a feature means
 * adding one file and one line here — no longer surgery on a 200-line body.
 *
 * The register order is observable (it is the order custom editors, providers,
 * and commands become available) and is preserved exactly: diff → script →
 * codeLink → marketplace (service) → editor → marketplace (commands) → compare →
 * commands → deployment. Handles flow forward only: the editor routes into
 * diff's controller, script's service, code-link's handles, and the marketplace
 * service; the marketplace commands and compare/commands reuse handles the
 * earlier features returned.
 */
export function activate(context: ExtensionContext): void {
    setContext(context);

    const deps = buildSharedDeps(context);
    // Below buildSharedDeps so the release check can log through the notifier.
    notifyIfNewRelease(context, deps.notifier);
    const { diffController } = diffFeature.register(context, deps);
    const { scriptTaskSvc, scriptVariableStore, scriptManifestParticipant } =
        scriptFeature.register(context, deps);
    const codeLink = codeLinkFeature.register(context, deps);
    // The marketplace service must exist before the editor feature so the
    // template service can merge its cache; its commands are wired afterwards
    // because they re-run that same template service.
    const { marketplaceSvc } = templateMarketplaceFeature.register(context, deps);
    const { bpmnService, templatesSvc } = editorFeature.register(context, deps, {
        diffController,
        scriptTaskSvc,
        scriptVariableStore,
        scriptManifestParticipant,
        codeLink,
        marketplaceSvc,
    });
    templateMarketplaceFeature.registerCommands(context, deps, { marketplaceSvc, templatesSvc });
    compareFeature.register(context, deps, { diffController });
    commandsFeature.register(context, deps, { bpmnService });
    deploymentFeature.register(context, deps);
}

const RELEASES_BASE = "https://github.com/Miragon/bpmn-modeler/releases/tag";
const LAST_NOTIFIED_KEY = "lastNotifiedVersion";

function notifyIfNewRelease(context: ExtensionContext, logger: LoggerPort): void {
    const current: string = context.extension.packageJSON.version;
    const last = context.globalState.get<string>(LAST_NOTIFIED_KEY);

    if (current === last) {
        return;
    }

    // Persist before showing so a crash/dismiss never re-triggers the prompt.
    // A rejected update means the prompt may repeat next launch — log it rather
    // than let the write float away silently.
    Promise.resolve(context.globalState.update(LAST_NOTIFIED_KEY, current)).catch((error) => {
        logger.logError(error instanceof Error ? error : new Error(String(error)));
    });

    window
        .showInformationMessage(
            `BPMN Modeler updated to v${current}. See what's new!`,
            "View Release Notes",
        )
        .then((selection) => {
            if (selection === "View Release Notes") {
                return env.openExternal(Uri.parse(`${RELEASES_BASE}/v${current}`));
            }
            return undefined;
        })
        .then(undefined, (error) => {
            logger.logError(error instanceof Error ? error : new Error(String(error)));
        });
}
