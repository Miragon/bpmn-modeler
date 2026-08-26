import type { OpenScriptEditorEvent } from "./scriptTaskContextPad";
import type { ScriptSourceChangedEvent } from "./scriptSourceWatcher";

/**
 * The host capabilities this library needs. The consumer supplies an
 * implementation (in the VS Code webview both calls post protocol commands),
 * so the library never imports the postMessage protocol. The modules keep
 * speaking over lib-owned event-bus events; {@link InlineScriptingPortForwarder}
 * bridges those two events onto this port at DI construction, so registering
 * the cluster without a host is unrepresentable — no port, no module (see
 * `createInlineScriptingModules`).
 */
export interface InlineScriptingPort {
    /** A surface requested its editor tab be opened. */
    openScriptEditor(event: OpenScriptEditorEvent): void;

    /** An open script's model content diverged from its editor tab. */
    scriptSourceChanged(event: ScriptSourceChangedEvent): void;
}
