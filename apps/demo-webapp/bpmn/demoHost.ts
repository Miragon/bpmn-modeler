import {
    BpmnFileQuery,
    BpmnlintConfigQuery,
    BpmnModelerSettingQuery,
    ClipboardQuery,
    Command,
    ElementTemplatesQuery,
    MockHostApi,
    NavigateToReferencedModelCommand,
    PropertiesPanelStateQuery,
    Query,
} from "@miragon/bpmn-modeler-shared";
import { getActiveModel, modelHref, resolveReference } from "../src";
import type { WebviewState } from "@miragon/bpmn-modeler-webview";

type MessageType = Command | Query;

function dispatch(event: MessageType): void {
    window.dispatchEvent(new MessageEvent("message", { data: event }));
}

/**
 * Client-side host for the static BPMN demo: serves the active bundled model,
 * and resolves Call-Activity / Business-Rule navigation against the model
 * registry (a real host would open another file). Everything a real host does
 * over the extension boundary — deployment, code-link, script editor,
 * clipboard, persistence — is a no-op here.
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
            case "GetBpmnlintConfigCommand":
                dispatch(new BpmnlintConfigQuery(null));
                break;
            case "NavigateToReferencedModelCommand": {
                const cmd = message as NavigateToReferencedModelCommand;
                const target = resolveReference(cmd.referenceId, cmd.referenceKind);
                if (target) {
                    window.location.href = modelHref(target);
                }
                break;
            }
        }
    }
}
