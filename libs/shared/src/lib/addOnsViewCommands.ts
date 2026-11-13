import type { MessageOfType, ProtocolCommandType } from "./protocolMessageMap";

/** Every command the add-ons view may post to its host. */
export const ADD_ONS_VIEW_COMMAND_TYPES = [
    "LogInfoCommand",
    "LogErrorCommand",
    "GetAddOnCatalogCommand",
    "AddOnRequestCommand",
    "OpenAddOnDetailCommand",
] as const satisfies readonly ProtocolCommandType[];

export type AddOnsViewCommandType = (typeof ADD_ONS_VIEW_COMMAND_TYPES)[number];

export type AddOnsViewCommand = MessageOfType<AddOnsViewCommandType>;
