import {
    Command,
    DmnFileQuery,
    Query,
    VsCodeApi,
    VsCodeImpl,
    VsCodeMock,
    WebSocketChannelImpl,
} from "@bpmn-modeler/shared";

declare const process: { env: { NODE_ENV: string } };

type StateType = unknown;

type MessageType = Command | Query;

/**
 * Runtime feature detection — see `apps/bpmn-webview/src/app/vscode.ts`
 * for the full explanation. Order: VS Code host → CLI WebSocket bridge →
 * in-browser dev mock.
 */
export function getVsCodeApi(): VsCodeApi<StateType, MessageType> {
    if (typeof acquireVsCodeApi === "function") {
        return new VsCodeImpl<StateType, MessageType>();
    }
    const wsBridge = (window as unknown as { __WS_BRIDGE__?: string }).__WS_BRIDGE__;
    if (wsBridge) {
        return new WebSocketChannelImpl<StateType, MessageType>(wsBridge);
    }
    if (process.env.NODE_ENV === "development") {
        return new MockedVsCodeApi();
    }
    throw new Error(
        "No VS Code API, WebSocket bridge, or dev mock available in this environment.",
    );
}

class MockedVsCodeApi extends VsCodeMock<StateType, MessageType> {
    override updateState(): void {
        throw new Error("Method not implemented.");
    }

    override postMessage(message: MessageType): void {
        switch (true) {
            case message.type === "GetDmnFileCommand": {
                dispatchEvent(new DmnFileQuery(""));
                break;
            }
            default: {
                throw new Error(`Unknown message type ${(message as MessageType).type}`);
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
