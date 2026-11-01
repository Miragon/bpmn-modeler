import type { BpmnEditorCommandType } from "./bpmnEditorCommands";
import type { MessageOfType, ProtocolCommandType } from "./protocolMessageMap";

/**
 * Every command the BPMN diff pane posts to its host once the host has named it
 * a diff pane. Before that the page posts the
 * {@link DIFF_PANE_HANDSHAKE_COMMAND_TYPES}. A value, not only a type, so a
 * host can check at runtime that it routes each one.
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

/**
 * The editor commands the BPMN page posts before its host names it a diff
 * pane, so a diff host receives them too.
 */
export const DIFF_PANE_HANDSHAKE_COMMAND_TYPES = [
    "GetBpmnFileCommand",
    "GetBpmnModelerSettingCommand",
    "GetPropertiesPanelStateCommand",
] as const satisfies readonly BpmnEditorCommandType[];

export type DiffPaneHandshakeCommandType = (typeof DIFF_PANE_HANDSHAKE_COMMAND_TYPES)[number];
