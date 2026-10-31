import type { MessageOfType, ProtocolCommandType } from "./protocolMessageMap";

/**
 * Every command the BPMN diff pane posts to its host once the host has named it
 * a diff pane. Before that the page asks for its file like the BPMN editor
 * does. A value, not only a type, so a host can check at runtime that it
 * routes each one.
 */
export const DIFF_PANE_COMMAND_TYPES = [
    "DiffReadyCommand",
    "ViewportChangedCommand",
    "CursorChangedCommand",
    "SwapCompareSidesCommand",
    "LogErrorCommand",
] as const satisfies readonly ProtocolCommandType[];

export type DiffPaneCommandType = (typeof DIFF_PANE_COMMAND_TYPES)[number];

export type DiffPaneCommand = MessageOfType<DiffPaneCommandType>;
