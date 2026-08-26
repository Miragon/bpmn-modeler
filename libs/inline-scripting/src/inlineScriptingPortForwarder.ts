import { OPEN_SCRIPT_EDITOR_EVENT } from "./scriptTaskContextPad";
import type { OpenScriptEditorEvent } from "./scriptTaskContextPad";
import { SCRIPT_SOURCE_CHANGED_EVENT } from "./scriptSourceWatcher";
import type { ScriptSourceChangedEvent } from "./scriptSourceWatcher";
import type { InlineScriptingPort } from "./InlineScriptingPort";

interface EventBus {
    on(event: string, callback: (event: unknown) => void): void;
}

/**
 * Bridges the two outbound lib-owned events onto the {@link InlineScriptingPort}
 * so the cluster stays protocol-free while the consumer decides what "open a
 * tab" / "overwrite the tab" means.
 *
 * It subscribes at DI construction — earlier than the previous post-init facade
 * wiring — which is safe because both events are only ever fired by a user
 * action or an edit, never during modeler bring-up.
 */
export class InlineScriptingPortForwarder {
    static $inject = ["eventBus", "inlineScriptingPort"];

    constructor(eventBus: EventBus, port: InlineScriptingPort) {
        eventBus.on(OPEN_SCRIPT_EDITOR_EVENT, (event) =>
            port.openScriptEditor(event as OpenScriptEditorEvent),
        );
        eventBus.on(SCRIPT_SOURCE_CHANGED_EVENT, (event) =>
            port.scriptSourceChanged(event as ScriptSourceChangedEvent),
        );
    }
}
