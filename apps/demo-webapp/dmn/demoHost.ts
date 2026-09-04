import {
    Command,
    DmnFileQuery,
    DmnModelerSettingQuery,
    MockHostApi,
    PropertiesPanelStateQuery,
    Query,
} from "@miragon/bpmn-modeler-shared";
import { getActiveModel } from "../src";
import type { WebviewState } from "@miragon/dmn-modeler-webview";

type MessageType = Command | Query;

function dispatch(event: MessageType): void {
    window.dispatchEvent(new MessageEvent("message", { data: event }));
}

/**
 * Client-side host for the static DMN demo: serves the active bundled decision
 * model. There is no cross-model navigation from a DMN (it's the leaf), and
 * everything a real host does over the boundary is a no-op here.
 */
export class DmnDemoHost extends MockHostApi<WebviewState, MessageType> {
    override updateState(state: Partial<WebviewState>): void {
        try {
            this.setState({ ...this.getState(), ...state });
        } catch {
            this.setState(state as WebviewState);
        }
    }

    override postMessage(message: MessageType): void {
        switch (message.type) {
            case "GetDmnFileCommand":
                dispatch(new DmnFileQuery(getActiveModel("dmn").xml));
                break;
            case "GetPropertiesPanelStateCommand":
                dispatch(new PropertiesPanelStateQuery(true));
                break;
            case "GetDmnModelerSettingCommand":
                dispatch(new DmnModelerSettingQuery({ colorTheme: "light" }));
                break;
        }
    }
}
