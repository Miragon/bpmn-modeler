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

import c7Samples from "./__fixtures__/c7-samples.json";
import c8Samples from "./__fixtures__/c8-samples.json";

declare const process: { env: { NODE_ENV: string } };

/**
 * Minimal BPMN XML used in development mode.
 *
 * Contains a Start Event, a Call Activity, a Service Task, and an End Event
 * so that element template selection can be tested for different element types.
 */
const MOCK_BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn"
                  exporter="bpmn-js"
                  exporterVersion="18.0.0">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:callActivity id="CallActivity_1" name="Call Activity">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:callActivity>
    <bpmn:serviceTask id="ServiceTask_1" name="Service Task">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:endEvent id="EndEvent_1" name="End">
      <bpmn:incoming>Flow_3</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="CallActivity_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="CallActivity_1" targetRef="ServiceTask_1" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="ServiceTask_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_1" bpmnElement="StartEvent_1">
        <dc:Bounds x="179" y="159" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="185" y="202" width="24" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="CallActivity_1_di" bpmnElement="CallActivity_1">
        <dc:Bounds x="270" y="137" width="100" height="80" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ServiceTask_1_di" bpmnElement="ServiceTask_1">
        <dc:Bounds x="430" y="137" width="100" height="80" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="592" y="159" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="600" y="202" width="20" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="215" y="177" />
        <di:waypoint x="270" y="177" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="370" y="177" />
        <di:waypoint x="430" y="177" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="530" y="177" />
        <di:waypoint x="592" y="177" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

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
                dispatchEvent(new BpmnFileQuery(MOCK_BPMN_XML, "c7"));
                break;
            }
            case message.type === "GetElementTemplatesCommand": {
                console.debug("[DEBUG] GetElementTemplatesCommand", message);
                dispatchEvent(
                    new ElementTemplatesQuery([
                        ...(c7Samples as unknown as JSON[]),
                        ...(c8Samples as unknown as JSON[]),
                    ]),
                );
                break;
            }
            case message.type === "GetBpmnModelerSettingCommand": {
                console.debug("[DEBUG] GetBpmnModelerSettingCommand", message);
                dispatchEvent(
                    new BpmnModelerSettingQuery({
                        alignToOrigin: true,
                        showTransactionBoundaries: true,
                        colorTheme: "light",
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
