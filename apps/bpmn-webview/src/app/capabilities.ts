import type { ModelNavigationPort } from "@miragon/bpmn-model-navigation";
import type { CodeLinkPort } from "@miragon/bpmn-modeler-code-link";
import type { InlineScriptingPort } from "@miragon/bpmn-modeler-inline-scripting";

/**
 * The optional per-feature host capabilities a consumer wires into the modeler.
 * Each port is the browser-side mirror of a host-capability port: present ⇒ the
 * feature's DI module is registered and its UI appears; absent ⇒ the feature is
 * off and its context-pad entries / lock UI never render (so a host-less
 * consumer no longer gets dead buttons).
 *
 * The bpmn-webview supplies a full protocol adapter by default, so every real
 * host (VS Code, IntelliJ, Theia) keeps all three features unchanged.
 */
export interface ModelerCapabilities {
    modelNavigation?: ModelNavigationPort;
    codeLink?: CodeLinkPort;
    scripting?: InlineScriptingPort;
}
