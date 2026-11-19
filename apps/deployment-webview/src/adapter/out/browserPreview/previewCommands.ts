import type {
    DeploymentSidebarCommand,
    DeploymentSidebarCommandType,
    MessageOfType,
    Query,
} from "@miragon/bpmn-modeler-shared";

import { storedCredentialsOf } from "./credentialsPreview";
import { noAdditionalFiles, previewFormDefaults, succeededDeployment } from "./deployPreview";
import { noPayloadFile, previewProcessDefinitionKey, startedInstance } from "./startInstancePreview";
import type { PreviewTargets } from "./targetsPreview";

/** The preview's state a command acts on, and the way back to the webview. */
export interface PreviewSession {
    readonly targets: PreviewTargets;
    /** Sends each query in order. */
    reply(...queries: readonly Query[]): void;
}

/** What the preview does with a command, or why it drops it. */
export type PreviewRoute<TType extends DeploymentSidebarCommandType> =
    | ((command: MessageOfType<TType>, preview: PreviewSession) => void)
    | { readonly ignored: string };

/** A row per sidebar command: a command without one fails to compile. */
type PreviewCommandTable = {
    readonly [TType in DeploymentSidebarCommandType]: PreviewRoute<TType>;
};

const PREVIEW_COMMANDS: PreviewCommandTable = {
    LogInfoCommand: ({ message }) => console.info(message),
    LogErrorCommand: ({ message }) => console.error(message),
    RequestFormDefaultsCommand: (_, preview) =>
        preview.reply(previewFormDefaults(), previewProcessDefinitionKey(), preview.targets.list()),
    DeployCommand: (command, preview) => {
        console.debug("[DEBUG] DeployCommand", command);
        preview.reply(succeededDeployment());
    },
    RequestAdditionalFilesCommand: (_, preview) => preview.reply(noAdditionalFiles()),
    RequestStoredCredentialsCommand: (command, preview) =>
        preview.reply(storedCredentialsOf(preview.targets, command)),
    SelectTargetCommand: ({ name }, preview) => preview.reply(preview.targets.select(name)),
    SaveTargetCommand: ({ target, previousName }, preview) =>
        preview.reply(...preview.targets.save(target, previousName)),
    CreateTargetCommand: ({ target }, preview) => preview.reply(...preview.targets.create(target)),
    DeleteTargetCommand: ({ name }, preview) => preview.reply(...preview.targets.delete(name)),
    OpenTargetsFileCommand: { ignored: "the preview has no editor to open the targets file in" },
    StartInstanceCommand: (command, preview) => {
        console.debug("[DEBUG] StartInstanceCommand", command);
        preview.reply(startedInstance());
    },
    RequestPayloadFilesCommand: (_, preview) => preview.reply(noPayloadFile()),
};

/** The row of a command type, or undefined for a type without one, an inherited object member's included. */
export function previewRouteOf(
    type: string,
): PreviewRoute<DeploymentSidebarCommandType> | undefined {
    if (!Object.hasOwn(PREVIEW_COMMANDS, type)) {
        return undefined;
    }
    return PREVIEW_COMMANDS[
        type as DeploymentSidebarCommandType
    ] as PreviewRoute<DeploymentSidebarCommandType>;
}

export function routePreviewCommand(
    command: DeploymentSidebarCommand,
    preview: PreviewSession,
): void {
    const route = previewRouteOf(command.type);
    if (!route) {
        console.debug("[DEBUG] Unhandled message type:", command.type);
        return;
    }
    if ("ignored" in route) {
        console.debug(`[DEBUG] ${command.type} ignored: ${route.ignored}`, command);
        return;
    }
    // Sound because the table hands each row only commands of its own key's type.
    (route as (command: DeploymentSidebarCommand, preview: PreviewSession) => void)(
        command,
        preview,
    );
}
