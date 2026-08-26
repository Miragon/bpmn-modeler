/**
 * bpmn-js DI modules that move inline-script editing out of the cramped
 * properties-panel textarea and into a real host editor tab, for Camunda 7
 * script tasks and script-typed execution/task listeners.
 *
 * The modules never import host code; they speak to the host through three
 * event-bus events — `scriptEditor.open` (a surface requested its tab),
 * `scriptEditor.sourceChanged` (an open script diverged in the model), and the
 * internal `openScriptEditors.changed` (the owned-surface set changed, so the
 * lock provider refreshes). {@link InlineScriptingPortForwarder} bridges the
 * first two onto the {@link InlineScriptingPort} the consumer supplies.
 *
 * Register the whole cluster on the Camunda-7 modeler (the C8 modeler leaves it
 * unregistered). Because the port is embedded in the returned bundle,
 * registering the cluster without a host is unrepresentable:
 *
 * ```ts
 * import { createInlineScriptingModules } from "@miragon/bpmn-modeler-inline-scripting";
 *
 * new BpmnModeler7({ additionalModules: [...createInlineScriptingModules(port)] });
 * ```
 */
import "./inlineScripting.css";

import { OPEN_SCRIPT_EDITOR_EVENT, ScriptTaskContextPadModule } from "./scriptTaskContextPad";
import type { OpenScriptEditorEvent } from "./scriptTaskContextPad";
import { ScriptEditorOpenerModule } from "./scriptEditorOpener";
import { ScriptEditorButtonsModule } from "./scriptEditorButtons";
import { ScriptEditorKeyboardModule } from "./scriptEditorKeyboard";
import { OpenScriptEditorsStore, OpenScriptEditorsStoreModule } from "./openScriptEditorsStore";
import { ScriptLockPropertiesProviderModule } from "./scriptLockPropertiesProvider";
import {
    SCRIPT_SOURCE_CHANGED_EVENT,
    ScriptSourceWatcher,
    ScriptSourceWatcherModule,
} from "./scriptSourceWatcher";
import type { ScriptSourceChangedEvent } from "./scriptSourceWatcher";
import { InlineScriptingPortForwarder } from "./inlineScriptingPortForwarder";
import type { InlineScriptingPort } from "./InlineScriptingPort";
import { collectInlineScriptTasks, findListenerAt } from "./scriptModel";

export {
    OPEN_SCRIPT_EDITOR_EVENT,
    ScriptTaskContextPadModule,
    ScriptEditorOpenerModule,
    ScriptEditorButtonsModule,
    ScriptEditorKeyboardModule,
    OpenScriptEditorsStore,
    OpenScriptEditorsStoreModule,
    ScriptLockPropertiesProviderModule,
    SCRIPT_SOURCE_CHANGED_EVENT,
    ScriptSourceWatcher,
    ScriptSourceWatcherModule,
    InlineScriptingPortForwarder,
    collectInlineScriptTasks,
    findListenerAt,
};
export type { OpenScriptEditorEvent, ScriptSourceChangedEvent, InlineScriptingPort };

/**
 * All C7 inline-scripting DI modules for the given host port, in registration
 * order — spread into `additionalModules`. The eighth bundle carries the
 * {@link InlineScriptingPortForwarder} together with the `inlineScriptingPort`
 * DI value, so the cluster and its host capability are registered as a unit.
 */
export function createInlineScriptingModules(port: InlineScriptingPort) {
    return [
        ScriptTaskContextPadModule,
        ScriptEditorOpenerModule,
        ScriptEditorButtonsModule,
        ScriptEditorKeyboardModule,
        OpenScriptEditorsStoreModule,
        ScriptLockPropertiesProviderModule,
        ScriptSourceWatcherModule,
        {
            __init__: ["inlineScriptingPortForwarder"],
            inlineScriptingPortForwarder: ["type", InlineScriptingPortForwarder],
            inlineScriptingPort: ["value", port],
        },
    ];
}
