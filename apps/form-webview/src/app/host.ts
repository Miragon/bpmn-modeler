import {
    Command,
    FormFileQuery,
    FormInputValuesQuery,
    GetFormFileCommand,
    GetFormInputValuesCommand,
    HostApi,
    HostApiImpl,
    MockHostApi,
    Query,
} from "@miragon/bpmn-modeler-shared";

declare const process: { env: { NODE_ENV: string } };

export interface WebviewState {
    mode: "edit" | "preview";
}

export type FormHost = HostApi<WebviewState, Command | Query>;

export function getHostApi(): FormHost {
    return process.env.NODE_ENV === "development"
        ? new MockHost()
        : new HostApiImpl<WebviewState, Command | Query>();
}

class MockHost extends MockHostApi<WebviewState, Command | Query> {
    constructor() {
        super();
        this.state = { mode: "edit" };
    }

    override updateState(state: Partial<WebviewState>): void {
        this.setState({ ...this.getState(), ...state });
    }

    override postMessage(message: Command | Query): void {
        if (message instanceof GetFormFileCommand) {
            window.dispatchEvent(
                new MessageEvent("message", {
                    data: new FormFileQuery(
                        JSON.stringify(
                            {
                                components: [],
                                type: "default",
                                id: "Form_1",
                                executionPlatform: "Camunda Cloud",
                                executionPlatformVersion: "8.8.0",
                            },
                            null,
                            2,
                        ),
                    ),
                }),
            );
            return;
        }
        if (message instanceof GetFormInputValuesCommand) {
            window.dispatchEvent(
                new MessageEvent("message", { data: new FormInputValuesQuery("{}") }),
            );
            return;
        }
        console.debug("[FormWebview]", message);
    }
}
