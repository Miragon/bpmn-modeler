import {
    Command,
    LogErrorCommand,
    Query,
    RequestFormDefaultsCommand,
} from "@miragon/bpmn-modeler-shared";

import { DeploymentForm } from "../adapter/in/form";
import { FORM_TEMPLATE } from "../adapter/in/formTemplate";
import { routeHostMessage } from "../adapter/in/hostMessageRouter";
import { StartInstanceForm } from "../adapter/in/startInstanceForm";
import { initTabs } from "../adapter/in/tabs";
import type { DeploymentHost } from "../port/deploymentHost";

export function bootstrap(host: DeploymentHost): void {
    let form: DeploymentForm;
    let startForm: StartInstanceForm;

    // Every host shell ships only an empty `#app`, so the single-source markup is injected here.
    const app = document.getElementById("app");
    if (app) {
        app.innerHTML = FORM_TEMPLATE;
    }

    try {
        form = new DeploymentForm(host);
        startForm = new StartInstanceForm(
            host,
            () => form.getAuthFields(),
            () => form.getConnectionPayload(),
        );
        form.onExecutionReadinessChange((reason) => startForm.setExecutionBlockedReason(reason));
    } catch (err) {
        console.error("[DeploymentWebview] Failed to initialise forms:", err);
        const e = err instanceof Error ? err : new Error(String(err));
        host.postMessage(
            new LogErrorCommand(`Failed to initialise deployment forms: ${e.message}`, e.stack),
        );
        return;
    }

    initTabs(host);

    window.addEventListener("message", (event: MessageEvent<Query | Command>) => {
        routeHostMessage(event.data, form, startForm);
    });

    host.postMessage(new RequestFormDefaultsCommand());
}
