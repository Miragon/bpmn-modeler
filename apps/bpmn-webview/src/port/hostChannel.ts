import type {
    BpmnDiffPaneCommand,
    BpmnDiffPaneCommandType,
    BpmnEditorCommand,
    BpmnEditorCommandType,
    HostApi,
    LogErrorCommand,
} from "@miragon/bpmn-modeler-shared";

import type { WebviewState } from "./webviewState";

/** Everything the BPMN webview posts: the editor's commands and the diff pane's. */
export type BpmnWebviewCommand = BpmnEditorCommand | BpmnDiffPaneCommand;

export type BpmnWebviewCommandType = BpmnEditorCommandType | BpmnDiffPaneCommandType;

export type BpmnWebviewHost = HostApi<WebviewState, BpmnWebviewCommand>;

export type HostChannel = Pick<HostApi<WebviewState, BpmnEditorCommand>, "postMessage">;

export type DiffPaneChannel = Pick<HostApi<WebviewState, BpmnDiffPaneCommand>, "postMessage">;

export type ErrorLogChannel = Pick<HostApi<unknown, LogErrorCommand>, "postMessage">;
