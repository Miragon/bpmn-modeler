import type { FormEditorCommand, HostApi } from "@miragon/bpmn-modeler-shared";

export interface WebviewState {
    mode: "edit" | "preview";
}

export type FormHost = HostApi<WebviewState, FormEditorCommand>;
