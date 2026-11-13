import type { BpmnEditorCommandType } from "./bpmnEditorCommands";
import type { MessageOfType, ProtocolCommandType } from "./protocolMessageMap";

/**
 * The commands every diff pane posts to its host as part of the diff session;
 * a command only the BPMN pane posts does not belong here. The BPMN page posts
 * them once the host has named it a diff pane, before that the
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

/**
 * Every command a DMN diff pane posts. Its host names the pane a diff pane in
 * the page's HTML, so the page asks only for its file and posts no editor
 * request it would then have to ignore.
 */
export const DMN_DIFF_PANE_COMMAND_TYPES = [
    ...DIFF_PANE_COMMAND_TYPES,
    "GetDmnFileCommand",
    "DmnDiffViewChangedCommand",
    "DmnDiffScrollChangedCommand",
] as const satisfies readonly ProtocolCommandType[];

export type DmnDiffPaneCommandType = (typeof DMN_DIFF_PANE_COMMAND_TYPES)[number];

export type DmnDiffPaneCommand = MessageOfType<DmnDiffPaneCommandType>;
