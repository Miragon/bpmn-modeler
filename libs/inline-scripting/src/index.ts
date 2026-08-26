/**
 * bpmn-js DI modules that move inline-script editing out of the cramped
 * properties-panel textarea and into a real host editor tab, for Camunda 7
 * script tasks and script-typed execution/task listeners.
 *
 * The modules never import host code; they speak to the host through three
 * event-bus events — `scriptEditor.open` (a surface requested its tab),
 * `scriptEditor.sourceChanged` (an open script diverged in the model), and the
 * internal `openScriptEditors.changed` (the owned-surface set changed, so the
 * lock provider refreshes). The webview facade forwards the first two to
 * whichever host is running.
 *
 * Register the whole cluster on the Camunda-7 modeler (the C8 modeler leaves it
 * unregistered):
 *
 * ```ts
 * import { InlineScriptingModules } from "@miragon/bpmn-modeler-inline-scripting";
 *
 * new BpmnModeler7({ additionalModules: [...InlineScriptingModules] });
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
    collectInlineScriptTasks,
    findListenerAt,
};
export type { OpenScriptEditorEvent, ScriptSourceChangedEvent };

/** All C7 inline-scripting DI modules, in registration order — spread into additionalModules. */
export const InlineScriptingModules = [
    ScriptTaskContextPadModule,
    ScriptEditorOpenerModule,
    ScriptEditorButtonsModule,
    ScriptEditorKeyboardModule,
    OpenScriptEditorsStoreModule,
    ScriptLockPropertiesProviderModule,
    ScriptSourceWatcherModule,
];
