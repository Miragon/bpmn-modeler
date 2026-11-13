import { ScriptIdentity } from "@miragon/bpmn-modeler-types";

/** Where an inline script sits in its diagram; a listener also has its position. */
export type ScriptAddress = ScriptIdentity;

/** An inline script as the webview hands it over for a host tab. */
export interface InlineScript extends ScriptAddress {
    /** A listener's `event`, which names its tab. */
    readonly eventName: string | undefined;
    readonly scriptFormat: string;
    readonly content: string;
}

/** A change the model made to an inline script; `content` is `undefined` once it is gone. */
export interface ScriptSourceChange extends ScriptAddress {
    readonly content: string | undefined;
}
