import type {
    BpmnEditorCommand,
    DiffPaneCommand,
    HostApi,
    LogErrorCommand,
} from "@miragon/bpmn-modeler-shared";

import type { WebviewState } from "./webviewState";

export type HostChannel = Pick<HostApi<WebviewState, BpmnEditorCommand>, "postMessage">;

export type DiffPaneChannel = Pick<HostApi<WebviewState, DiffPaneCommand>, "postMessage">;

export type ErrorLogChannel = Pick<HostApi<unknown, LogErrorCommand>, "postMessage">;
