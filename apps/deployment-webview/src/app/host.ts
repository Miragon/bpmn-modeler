import {
    AdditionalFilesQuery,
    Command,
    DeploymentResultQuery,
    FormDefaultsQuery,
    ProcessDefinitionKeyQuery,
    Query,
    SelectedPayloadFileQuery,
    StartInstanceResultQuery,
    StoredCredentialsQuery,
    HostApi,
    HostApiImpl,
    MockHostApi,
} from "@miragon/bpmn-modeler-shared";

declare const process: { env: { NODE_ENV: string } };

/**
 * Shape of the data persisted via `host.setState` / `host.getState`.
 */
export interface WebviewState {
    formData?: Record<string, string>;
    collapsedSections?: string[];
}

type StateType = WebviewState;
type MessageType = Command | Query;

/**
 * Returns the channel to the host application embedding this webview.
 *
 * In `development` mode a {@link MockHost} is returned so the webview can be
 * run standalone in a browser without any host. In all other environments the
 * real {@link HostApiImpl} is used (VS Code, IntelliJ, and the desktop app all
 * inject the same `acquireVsCodeApi()` shim, so they share this path).
 */
export function getHostApi(): HostApi<StateType, MessageType> {
    if (process.env.NODE_ENV === "development") {
        return new MockHost();
    }
    return new HostApiImpl<StateType, MessageType>();
}

/**
 * Development-only mock that simulates the host application by dispatching
 * synthetic `MessageEvent`s in response to outbound commands.
 */
class MockHost extends MockHostApi<StateType, MessageType> {
    /**
     * Intercepts outbound messages and dispatches synthetic inbound responses
     * so the deployment form can be developed standalone in a browser.
     *
     * @param message The outbound command sent by the webview.
     */
    override postMessage(message: MessageType): void {
        switch (message.type) {
            case "RequestFormDefaultsCommand": {
                dispatchEvent(
                    new FormDefaultsQuery({
                        deploymentName: "my-process",
                        tenantId: "",
                        endpoint: "http://localhost:8080/engine-rest",
                        engine: "c7",
                        authType: "none",
                    }),
                );
                break;
            }
            case "RequestStoredCredentialsCommand": {
                dispatchEvent(new StoredCredentialsQuery({ authType: "none" }));
                break;
            }
            case "RequestAdditionalFilesCommand": {
                dispatchEvent(new AdditionalFilesQuery([]));
                break;
            }
            case "DeployCommand": {
                console.debug("[DEBUG] DeployCommand", message);
                dispatchEvent(new DeploymentResultQuery(true, "Deployment succeeded (mock)."));
                break;
            }
            case "RequestProcessDefinitionKeyCommand": {
                dispatchEvent(new ProcessDefinitionKeyQuery("Process_0gjrx3e"));
                break;
            }
            case "RequestPayloadFilesCommand": {
                dispatchEvent(new SelectedPayloadFileQuery("", ""));
                break;
            }
            case "StartInstanceCommand": {
                console.debug("[DEBUG] StartInstanceCommand", message);
                dispatchEvent(
                    new StartInstanceResultQuery(true, "Process instance started (mock).", "12345"),
                );
                break;
            }
            default: {
                console.debug("[DEBUG] Unhandled message type:", message.type);
            }
        }

        function dispatchEvent(event: MessageType) {
            window.dispatchEvent(new MessageEvent("message", { data: event }));
        }
    }

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
}
