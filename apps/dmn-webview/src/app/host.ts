import {
    Command,
    DmnFileQuery,
    DmnModelerSettingQuery,
    LogDebugCommand,
    LogErrorCommand,
    LogInfoCommand,
    LogWarningCommand,
    PropertiesPanelStateQuery,
    Query,
    HostApi,
    HostApiImpl,
    MockHostApi,
} from "@miragon/bpmn-modeler-shared";

declare const process: { env: { NODE_ENV: string } };

/**
 * Shape of the data persisted via `host.setState` / `host.getState`.
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
    /**
     * Per-editor properties-panel visibility. Absent until the user first
     * toggles the panel in this editor; while absent the editor follows the
     * host's global default (`dmnPropertiesPanelVisible`). Present entry wins.
     */
    panelVisible?: boolean;
}

type StateType = WebviewState;

type MessageType = Command | Query;

/**
 * Returns the channel to the host application embedding this webview. In
 * `development` mode a {@link MockHost} is returned for standalone browser
 * runs; otherwise the real {@link HostApiImpl} is used (VS Code, IntelliJ, and
 * the desktop app all inject the same `acquireVsCodeApi()` shim, so they share
 * this path).
 */
export function getHostApi(): HostApi<StateType, MessageType> {
    if (process.env.NODE_ENV === "development") {
        return new MockHost();
    }
    return new HostApiImpl<StateType, MessageType>();
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

class MockHost extends MockHostApi<StateType, MessageType> {
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
            // The webview forwards log entries to the host; in a standalone
            // browser run there's no host, so mirror them onto the dev console.
            // Cases are required because the base MockHost throws on unknown
            // types — and the global error listeners now emit LogErrorCommand.
            case message.type === "LogDebugCommand": {
                console.debug((message as LogDebugCommand).message);
                break;
            }
            case message.type === "LogInfoCommand": {
                console.info((message as LogInfoCommand).message);
                break;
            }
            case message.type === "LogWarningCommand": {
                console.warn((message as LogWarningCommand).message);
                break;
            }
            case message.type === "LogErrorCommand": {
                console.error((message as LogErrorCommand).message);
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
