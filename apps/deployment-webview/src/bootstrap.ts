import {
    asProtocolMessage,
    Command,
    HostApi,
    LogErrorCommand,
    Query,
    RequestFormDefaultsCommand,
} from "@miragon/bpmn-modeler-shared";

import { DeploymentForm } from "./app/form";
import { FORM_TEMPLATE } from "./app/formTemplate";
import type { WebviewState } from "./app/host";
import { StartInstanceForm } from "./app/startInstanceForm";

type DeploymentHost = HostApi<WebviewState, Command | Query>;

type DeploymentFormPort = Pick<
    DeploymentForm,
    | "populate"
    | "setAdditionalFiles"
    | "populateCredentials"
    | "setTargets"
    | "showTargetResult"
    | "showResult"
>;

type StartInstanceFormPort = Pick<
    StartInstanceForm,
    "setProcessDefinitionKey" | "setPayloadFile" | "showResult"
>;

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
            () => form.getAuthPayload(),
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

function initTabs(host: DeploymentHost): void {
    const tabBtns = document.querySelectorAll<HTMLButtonElement>(".tab-btn");
    const tabPanels = document.querySelectorAll<HTMLElement>(".tab-panel");

    const savedTab = host.getState()?.activeTab;
    if (savedTab) {
        activateTab(savedTab, tabBtns, tabPanels);
    }

    for (const btn of tabBtns) {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.tab;
            if (!tab) return;
            activateTab(tab, tabBtns, tabPanels);
            host.updateState({ activeTab: tab });
        });
    }
}

function activateTab(
    tab: string,
    tabBtns: NodeListOf<HTMLButtonElement>,
    tabPanels: NodeListOf<HTMLElement>,
): void {
    for (const btn of tabBtns) {
        btn.classList.toggle("active", btn.dataset.tab === tab);
    }
    for (const panel of tabPanels) {
        panel.classList.toggle("active", panel.id === `tab-${tab}`);
    }
}

export function routeHostMessage(
    msg: Query | Command,
    form: DeploymentFormPort,
    startForm: StartInstanceFormPort,
): void {
    const query = asProtocolMessage(msg);
    switch (query.type) {
        case "FormDefaultsQuery":
            form.populate(query.defaults);
            break;
        case "AdditionalFilesQuery":
            form.setAdditionalFiles(query.filePaths);
            break;
        case "StoredCredentialsQuery":
            form.populateCredentials(query);
            break;
        case "DeploymentTargetsQuery":
            form.setTargets(query);
            break;
        case "TargetSavedQuery": {
            const saved = query;
            form.showTargetResult(saved.success, saved.message);
            break;
        }
        case "DeploymentResultQuery":
            form.showResult(query);
            break;
        case "ProcessDefinitionKeyQuery":
            startForm.setProcessDefinitionKey(query.processDefinitionKey);
            break;
        case "SelectedPayloadFileQuery": {
            const payload = query;
            startForm.setPayloadFile(payload.filePath, payload.label);
            break;
        }
        case "StartInstanceResultQuery":
            startForm.showResult(query);
            break;
        default:
            console.debug("[DeploymentWebview] Unhandled message type:", msg.type);
    }
}
