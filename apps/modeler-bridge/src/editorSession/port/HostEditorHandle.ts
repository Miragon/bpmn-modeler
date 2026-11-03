import { EditorHandle } from "@miragon/bpmn-modeler-core";
import { Command } from "@miragon/bpmn-modeler-shared";

import { RegisterParams } from "../../protocol/domain/types";

/** An editor handle the host drives: it forwards webview messages and reports focus. */
export interface HostEditorHandle extends EditorHandle {
    receive(message: Command): void;
    setActive(active: boolean): void;
}

export type HostEditorHandleFactory = (session: RegisterParams) => HostEditorHandle;
