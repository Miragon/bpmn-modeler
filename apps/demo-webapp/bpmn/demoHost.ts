import {
    BpmnFileQuery,
    BpmnModelerSettingQuery,
    ClipboardQuery,
    Command,
    ElementTemplatesQuery,
    MockHostApi,
    PropertiesPanelStateQuery,
    Query,
} from "@miragon/bpmn-modeler-shared";
import { getActiveModel } from "../src";
import type { WebviewState } from "@miragon/bpmn-modeler-webview";

type MessageType = Command | Query;

function dispatch(event: MessageType): void {
    window.dispatchEvent(new MessageEvent("message", { data: event }));
}

/**
 * Client-side host for the static BPMN demo: serves the active bundled model.
 * Model navigation is wired through the `modelNavigation` capability in
 * `main.ts` (which resolves against the model registry and swaps the page), so
 * it no longer crosses this message boundary. Everything else a real host does —
 * deployment, code-link, script editor, clipboard, persistence — is a no-op here.
 */
export class BpmnDemoHost extends MockHostApi<WebviewState, MessageType> {
    override updateState(state: Partial<WebviewState>): void {
        try {
            this.setState({ ...this.getState(), ...state });
        } catch {
            this.setState(state as WebviewState);
        }
    }

    override postMessage(message: MessageType): void {
        switch (message.type) {
            case "GetBpmnFileCommand": {
                const active = getActiveModel("bpmn");
                dispatch(new BpmnFileQuery(active.xml, active.engine));
                break;
            }
            case "GetElementTemplatesCommand":
                dispatch(new ElementTemplatesQuery([]));
                break;
            case "GetBpmnModelerSettingCommand":
                dispatch(
                    new BpmnModelerSettingQuery({
                        alignToOrigin: false,
                        showTransactionBoundaries: true,
                        colorTheme: "light",
                    }),
                );
                break;
            case "GetPropertiesPanelStateCommand":
                dispatch(new PropertiesPanelStateQuery(true));
                break;
            case "GetClipboardCommand":
                dispatch(new ClipboardQuery(""));
                break;
            // Deliberately no GetBpmnlintConfigCommand reply: the demo lints
            // in-page (`linting: {}`), and an external results/null push would
            // switch the instance to the external tier and suspend that.
        }
    }
}
