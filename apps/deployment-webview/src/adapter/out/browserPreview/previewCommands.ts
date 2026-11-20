import type {
    DeploymentSidebarCommandType,
    PreviewCommandTable,
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

export const PREVIEW_LOG_PREFIX = "[DEBUG]";

export const PREVIEW_COMMANDS: PreviewCommandTable<DeploymentSidebarCommandType, PreviewSession> = {
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
