import {
    AdditionalFilesQuery,
    asProtocolMessage,
    Command,
    DeploymentResultQuery,
    DeploymentTargetPayload,
    DeploymentTargetsQuery,
    FormDefaultsQuery,
    HostApi,
    HostApiImpl,
    MockHostApi,
    ProcessDefinitionKeyQuery,
    Query,
    SelectedPayloadFileQuery,
    StartInstanceResultQuery,
    StoredCredentialsQuery,
    TargetSavedQuery,
} from "@miragon/bpmn-modeler-shared";

declare const process: { env: { NODE_ENV: string } };

/**
 * Shape of the data persisted via `host.setState` / `host.getState`.
 */
export interface WebviewState {
    formData?: Record<string, string>;
    collapsedSections?: string[];
    activeTab?: string;
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
    // Two fake targets so the sidebar's select/save/delete flow is exercisable
    // in a standalone browser (`yarn workspace … serve`).
    private mockTargets: DeploymentTargetPayload[] = [
        {
            name: "dev",
            engine: "c7",
            endpoint: "http://localhost:8080/engine-rest",
            tenantId: "",
            authType: "none",
        },
        {
            name: "prod",
            engine: "c8",
            endpoint: "https://prod.example.com",
            tenantId: "acme",
            authType: "oauth2",
            tokenEndpoint: "https://login.example.com/oauth/token",
            audience: "zeebe-api",
        },
    ];

    private mockActiveTarget = "";

    /**
     * Intercepts outbound messages and dispatches synthetic inbound responses
     * so the deployment form can be developed standalone in a browser.
     *
     * @param message The outbound command sent by the webview.
     */
    override postMessage(message: MessageType): void {
        const command = asProtocolMessage(message);
        switch (command.type) {
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
                dispatchEvent(new DeploymentTargetsQuery(this.mockTargets, this.mockActiveTarget));
                break;
            }
            case "SelectTargetCommand": {
                this.mockActiveTarget = command.name;
                dispatchEvent(new DeploymentTargetsQuery(this.mockTargets, this.mockActiveTarget));
                break;
            }
            case "CreateTargetCommand": {
                const { target } = command;
                if (this.mockTargets.some((t) => t.name === target.name)) {
                    dispatchEvent(
                        new TargetSavedQuery(
                            false,
                            `A deployment target named "${target.name}" already exists.`,
                        ),
                    );
                    break;
                }
                this.mockTargets.push(target);
                this.mockActiveTarget = target.name;
                dispatchEvent(
                    new TargetSavedQuery(true, `Created target "${target.name}" (mock).`),
                );
                dispatchEvent(new DeploymentTargetsQuery(this.mockTargets, this.mockActiveTarget));
                break;
            }
            case "SaveTargetCommand": {
                const { target, previousName } = command;
                const isRename = previousName !== undefined && previousName !== target.name;
                if (isRename && this.mockTargets.some((t) => t.name === target.name)) {
                    dispatchEvent(
                        new TargetSavedQuery(
                            false,
                            `A deployment target named "${target.name}" already exists.`,
                        ),
                    );
                    break;
                }
                this.mockTargets = this.mockTargets.filter(
                    (t) => t.name !== target.name && t.name !== previousName,
                );
                this.mockTargets.push(target);
                this.mockActiveTarget = target.name;
                dispatchEvent(new TargetSavedQuery(true, `Saved target "${target.name}" (mock).`));
                dispatchEvent(new DeploymentTargetsQuery(this.mockTargets, this.mockActiveTarget));
                break;
            }
            case "DeleteTargetCommand": {
                const { name } = command;
                this.mockTargets = this.mockTargets.filter((t) => t.name !== name);
                if (this.mockActiveTarget === name) {
                    this.mockActiveTarget = "";
                }
                dispatchEvent(new TargetSavedQuery(true, `Deleted target "${name}" (mock).`));
                dispatchEvent(new DeploymentTargetsQuery(this.mockTargets, this.mockActiveTarget));
                break;
            }
            case "OpenTargetsFileCommand": {
                console.debug("[DEBUG] OpenTargetsFileCommand (no editor in mock)");
                break;
            }
            case "RequestStoredCredentialsCommand": {
                const { targetName, requestId } = command;
                const target = this.mockTargets.find((entry) => entry.name === targetName);
                dispatchEvent(
                    new StoredCredentialsQuery(
                        {
                            authType: target?.authType ?? "none",
                            tokenEndpoint: target?.tokenEndpoint,
                            audience: target?.audience,
                        },
                        targetName,
                        requestId,
                    ),
                );
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
}
