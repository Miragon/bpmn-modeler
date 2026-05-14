import {
    Command,
    DmnFileQuery,
    Query,
    VsCodeApi,
    VsCodeImpl,
    VsCodeMock,
} from "@miragon/bpmn-modeler-shared";

declare const process: { env: { NODE_ENV: string } };

/** Shape of the data persisted via `vscode.setState` / `vscode.getState`. */
export interface WebviewState {
    /** Scroll position of `.bio-properties-panel-scroll-container`. */
    panelScroll?: number;
    /**
     * Indexes (in render order) of `.bio-properties-panel-group` elements
     * that are currently expanded.  Keyed by position so it survives a
     * language switch — group labels are localised, indexes are not.
     */
    expandedGroupIndexes?: number[];
}

type StateType = WebviewState;

type MessageType = Command | Query;

export function getVsCodeApi(): VsCodeApi<StateType, MessageType> {
    if (process.env.NODE_ENV === "development") {
        return new MockedVsCodeApi();
    } else {
        return new VsCodeImpl<StateType, MessageType>();
    }
}

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
