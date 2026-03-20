import {
    BpmnFileQuery,
    BpmnModelerSettingQuery,
    ClipboardQuery,
    Command,
    ElementTemplatesQuery,
    LogErrorCommand,
    LogInfoCommand,
    Query,
    SyncDocumentCommand,
    VsCodeApi,
    VsCodeImpl,
    VsCodeMock,
} from "@bpmn-modeler/shared";

import elementTemplate from "./__fixtures__/elementTemplate.json";

declare const process: { env: { NODE_ENV: string } };

/** Canvas position and zoom level captured from diagram-js. */
export interface ViewportData {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Shape of the data persisted via `vscode.setState` / `vscode.getState`. */
export interface WebviewState {
    viewport?: ViewportData;
    selectedElementIds?: string[];
}

type StateType = WebviewState;

type MessageType = Command | Query;

/**
 * Returns the appropriate VS Code API implementation.
 *
 * In `development` mode a {@link MockedVsCodeApi} is returned so the webview
 * can be run standalone in a browser without a VS Code host.  In all other
 * environments the real {@link VsCodeImpl} is used.
 */
export function getVsCodeApi(): VsCodeApi<StateType, MessageType> {
    console.log(process.env.NODE_ENV);
    if (process.env.NODE_ENV === "development") {
        return new MockedVsCodeApi();
    } else {
        return new VsCodeImpl<StateType, MessageType>();
    }
}

/**
 * Development-only mock that simulates the VS Code extension host by
 * dispatching synthetic `MessageEvent`s in response to outbound commands.
 */
class MockedVsCodeApi extends VsCodeMock<StateType, MessageType> {
    /**
     * Merges `state` into the current mock state, initialising it when no
     * state has been set yet (i.e. when {@link getState} would throw).
     *
     * @param state Partial state to merge.
     */
    override updateState(state: Partial<WebviewState>): void {
        try {
            this.setState({ ...this.getState(), ...state });
        } catch {
            this.setState(state as WebviewState);
        }
    }

    /**
     * Intercepts outbound messages and dispatches the corresponding inbound
     * response so the webview can operate without a real VS Code host.
     *
     * @param message The outbound command sent by the webview.
     */
    override postMessage(message: MessageType): void {
        switch (true) {
            case message.type === "GetBpmnFileCommand": {
                console.debug("[DEBUG] GetBpmnFileCommand", message);
                dispatchEvent(new BpmnFileQuery("", "c8"));
                break;
            }
            case message.type === "GetElementTemplatesCommand": {
                console.debug("[DEBUG] GetElementTemplatesCommand", message);
                dispatchEvent(
                    new ElementTemplatesQuery([elementTemplate as unknown as JSON]),
                );
                break;
            }
            case message.type === "GetBpmnModelerSettingCommand": {
                console.debug("[DEBUG] GetBpmnModelerSettingCommand", message);
                dispatchEvent(
                    new BpmnModelerSettingQuery({
                        alignToOrigin: true,
                        showTransactionBoundaries: true,
                    }),
                );
                break;
            }
            case message.type === "GetClipboardCommand": {
                console.debug("[DEBUG] GetClipboardCommand", message);
                dispatchEvent(new ClipboardQuery(""));
                break;
            }
            case message.type === "SetClipboardCommand": {
                console.debug("[DEBUG] SetClipboardCommand", message);
                break;
            }
            case message.type === "SyncDocumentCommand": {
                console.debug(
                    "[DEBUG] SyncDocumentCommand",
                    (message as SyncDocumentCommand).content,
                );
                break;
            }
            case message.type === "LogInfoCommand": {
                console.info((message as LogInfoCommand).message);
                break;
            }
            case message.type === "LogErrorCommand": {
                console.error((message as LogErrorCommand).message);
                break;
            }
            case message.type === "LanguageQuery": {
                console.debug("[DEBUG] LanguageQuery", message);
                break;
            }
            default: {
                throw new Error(
                    `Unknown message type: ${(message as MessageType).type}`,
                );
            }
        }

        function dispatchEvent(event: MessageType) {
            window.dispatchEvent(
                new MessageEvent("message", {
                    data: event,
                }),
            );
        }
    }
}
