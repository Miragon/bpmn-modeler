import {
    Command,
    DmnFileQuery,
    DmnModelerSettingQuery,
    PropertiesPanelStateQuery,
    Query,
    VsCodeApi,
    VsCodeImpl,
    VsCodeMock,
} from "@miragon/bpmn-modeler-shared";

declare const process: { env: { NODE_ENV: string } };

/**
 * Shape of the data persisted via `vscode.setState` / `vscode.getState`.
 */
export interface WebviewState {
    // Scroll position of `.bio-properties-panel-scroll-container`.
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

/**
 * Returns the appropriate host-channel implementation. In `development` mode a
 * {@link MockedVsCodeApi} is returned for standalone browser runs; otherwise
 * the real {@link VsCodeImpl} is used (the IntelliJ host injects the same
 * `acquireVsCodeApi()` shim, so it takes this path too).
 */
export function getVsCodeApi(): VsCodeApi<StateType, MessageType> {
    if (process.env.NODE_ENV === "development") {
        return new MockedVsCodeApi();
    }
    return new VsCodeImpl<StateType, MessageType>();
}

// Minimal DRD for standalone browser runs, so the palette and an element's
// context pad are visible for manual testing.
const SAMPLE_DMN = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/" xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/" id="sample" name="Sample" namespace="http://camunda.org/schema/1.0/dmn">
  <decision id="decision_1" name="Decision 1">
    <decisionTable id="decisionTable_1">
      <input id="input_1"><inputExpression id="inputExpression_1" typeRef="string"><text></text></inputExpression></input>
      <output id="output_1" typeRef="string" />
    </decisionTable>
  </decision>
  <dmndi:DMNDI>
    <dmndi:DMNDiagram>
      <dmndi:DMNShape dmnElementRef="decision_1"><dc:Bounds height="80" width="180" x="160" y="100" /></dmndi:DMNShape>
    </dmndi:DMNDiagram>
  </dmndi:DMNDI>
</definitions>`;

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
                dispatchEvent(new DmnFileQuery(SAMPLE_DMN));
                break;
            }
            case message.type === "GetPropertiesPanelStateCommand": {
                dispatchEvent(new PropertiesPanelStateQuery(true));
                break;
            }
            case message.type === "GetDmnModelerSettingCommand": {
                // Follow the (mock) VS Code theme so the browser preview themes
                // off the `vscode-dark`/`vscode-light` body class.
                dispatchEvent(new DmnModelerSettingQuery({ colorTheme: "automatic" }));
                break;
            }
            case message.type === "SetPropertiesPanelStateCommand": {
                // No host to persist to in standalone browser runs.
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
