import { BpmnPluginsQuery } from "@miragon/bpmn-modeler-shared";

import { EditorSessionStore, PostOutcome } from "./EditorSessionStore";

/**
 * Tells a BPMN editor it gets no plugins, so its webview stops waiting. A
 * hidden editor is no failure: shown again, it restarts and asks again.
 */
export function answerWithoutPlugins(
    store: EditorSessionStore,
    editorId: string,
): Promise<PostOutcome> {
    return store.postUnlessHidden(editorId, new BpmnPluginsQuery([]));
}
