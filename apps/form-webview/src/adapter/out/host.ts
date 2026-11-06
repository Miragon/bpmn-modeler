import {
    Command,
    FormFileQuery,
    FormInputValuesQuery,
    GetFormFileCommand,
    GetFormInputValuesCommand,
    HostApiImpl,
    MockHostApi,
    Query,
} from "@miragon/bpmn-modeler-shared";

import type { FormHost, WebviewState } from "../../port/formHost";

declare const process: { env: { NODE_ENV: string } };

export function getHostApi(): FormHost {
    return process.env.NODE_ENV === "development"
        ? new MockHost()
        : new HostApiImpl<WebviewState, Command | Query>();
}

class MockHost extends MockHostApi<WebviewState, Command | Query> {
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
