import {
    Command,
    DmnFileQuery,
    Query,
    VsCodeApi,
    VsCodeImpl,
    VsCodeMock,
} from "@miragon/bpmn-modeler-shared";

declare const process: { env: { NODE_ENV: string } };

type StateType = unknown;

type MessageType = Command | Query;

export function getVsCodeApi(): VsCodeApi<StateType, MessageType> {
    if (process.env.NODE_ENV === "development") {
        return new MockedVsCodeApi();
    } else {
        return new VsCodeImpl<StateType, MessageType>();
    }
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
