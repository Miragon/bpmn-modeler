import { ScriptIdentity } from "@miragon/bpmn-modeler-types";

/** An inline script as the webview hands it over for a host tab. */
export interface InlineScript extends ScriptIdentity {
    /** A listener's `event`, which names its tab. */
    readonly eventName: string | undefined;
    readonly scriptFormat: string;
    readonly content: string;
}

/** A change the model made to an inline script; `content` is `undefined` once it is gone. */
export interface ScriptSourceChange extends ScriptIdentity {
    readonly content: string | undefined;
}
