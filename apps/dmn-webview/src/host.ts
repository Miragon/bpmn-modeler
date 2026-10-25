/**
 * Host-adapter surface — the VS Code protocol adapter (Query/Command wiring,
 * `bootstrap`'s host handshake). Lives in the app, outside the publishable
 * `@miragon/dmn-modeler` boundary.
 */
import {
    asProtocolMessage,
    Command,
    DmnFileQuery,
    DmnModelerSettingQuery,
    HostApi,
    HostApiImpl,
    MockHostApi,
    PropertiesPanelStateQuery,
    Query,
    TakeFocusQuery,
} from "@miragon/bpmn-modeler-shared";
import type { WebviewState } from "./webviewState";

declare const process: { env: { NODE_ENV: string } };

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
    override postMessage(message: MessageType): void {
        const command = asProtocolMessage(message);
        switch (command.type) {
            case "GetDmnFileCommand": {
                dispatchEvent(new DmnFileQuery(SAMPLE_DMN));
                break;
            }
            case "GetPropertiesPanelStateCommand": {
                dispatchEvent(new PropertiesPanelStateQuery(true));
                break;
            }
            case "GetDmnModelerSettingCommand": {
                // Follow the (mock) VS Code theme so the browser preview themes
                // off the `vscode-dark`/`vscode-light` body class.
                dispatchEvent(new DmnModelerSettingQuery({ colorTheme: "automatic" }));
                break;
            }
            case "SetPropertiesPanelStateCommand": {
                // No host to persist to in standalone browser runs.
                break;
            }
            case "RequestFocusCommand": {
                // The preview page is always the active editor.
                dispatchEvent(new TakeFocusQuery());
                break;
            }
            case "SyncDocumentCommand": {
                // No document to persist in standalone browser runs.
                console.debug("[DEBUG] SyncDocumentCommand", command.content);
                break;
            }
            // The webview forwards log entries to the host; in a standalone
            // browser run there's no host, so mirror them onto the dev console.
            case "LogDebugCommand": {
                console.debug(command.message);
                break;
            }
            case "LogInfoCommand": {
                console.info(command.message);
                break;
            }
            case "LogWarningCommand": {
                console.warn(command.message);
                break;
            }
            case "LogErrorCommand": {
                console.error(command.message);
                break;
            }
            default: {
                throw new Error(`Unknown message type ${message.type}`);
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
