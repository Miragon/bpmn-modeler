import type { MessageOfType, ProtocolCommandType } from "./protocolMessageMap";

/**
 * Every command the deployment sidebar webview may post to its host. A value,
 * not only a type, so a host can check at runtime that it routes each one.
 */
export const DEPLOYMENT_SIDEBAR_COMMAND_TYPES = [
    "LogInfoCommand",
    "LogErrorCommand",
    "RequestFormDefaultsCommand",
    "DeployCommand",
    "RequestAdditionalFilesCommand",
    "RequestStoredCredentialsCommand",
    "SelectTargetCommand",
    "SaveTargetCommand",
    "CreateTargetCommand",
    "DeleteTargetCommand",
    "OpenTargetsFileCommand",
    "StartInstanceCommand",
    "RequestPayloadFilesCommand",
] as const satisfies readonly ProtocolCommandType[];

export type DeploymentSidebarCommandType = (typeof DEPLOYMENT_SIDEBAR_COMMAND_TYPES)[number];

export type DeploymentSidebarCommand = MessageOfType<DeploymentSidebarCommandType>;
