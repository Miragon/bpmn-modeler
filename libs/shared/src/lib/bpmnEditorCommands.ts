import type { MessageOfType, ProtocolCommandType } from "./protocolMessageMap";

export const BPMN_EDITOR_COMMAND_TYPES = [] as const satisfies readonly ProtocolCommandType[];

export type BpmnEditorCommandType = (typeof BPMN_EDITOR_COMMAND_TYPES)[number];

export type BpmnEditorCommand = MessageOfType<BpmnEditorCommandType>;
