import "./styles/default.css";

import {
    AdditionalFilesQuery,
    Command,
    DeploymentResultQuery,
    FormDefaultsQuery,
    LogErrorCommand,
    ProcessDefinitionKeyQuery,
    Query,
    RequestFormDefaultsCommand,
    SelectedPayloadFileQuery,
    StartInstanceResultQuery,
    StoredCredentialsQuery,
} from "@miragon/bpmn-modeler-shared";

import { DeploymentForm } from "./app/form";
import { FORM_TEMPLATE } from "./app/formTemplate";
import { StartInstanceForm } from "./app/startInstanceForm";
import { getHostApi } from "./app/host";

const host = getHostApi();

// Global safety net: the deployment webview had no error forwarding at all, so a
// throw in a DOM callback or a rejected promise vanished into the webview console
// and never reached the output channel. Mirrors the bpmn-webview hooks; registered
// eagerly so failures during form bootstrap are covered too.
window.addEventListener("error", (event: ErrorEvent) => {
    host.postMessage(new LogErrorCommand(`Unhandled error: ${event.message}`, event.error?.stack));
});
window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    const reason: unknown = event.reason;
    host.postMessage(
        new LogErrorCommand(
            `Unhandled promise rejection: ${reason instanceof Error ? reason.message : String(reason)}`,
            reason instanceof Error ? reason.stack : undefined,
        ),
    );
});

/**
 * Entry point: initialises the deployment and start-instance forms once the
 * DOM is ready, sets up tab switching, and requests initial defaults.
 */
window.onload = function () {
    let form: DeploymentForm;
    let startForm: StartInstanceForm;

    // Render the single-sourced form markup before constructing the forms, which
    // query their elements by id. Every host shell ships only `<div id="app">`.
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
    } catch (err) {
        console.error("[DeploymentWebview] Failed to initialise forms:", err);
        const e = err instanceof Error ? err : new Error(String(err));
        host.postMessage(
            new LogErrorCommand(`Failed to initialise deployment forms: ${e.message}`, e.stack),
        );
        return;
    }

    initTabs();

    window.addEventListener("message", (event: MessageEvent<Query | Command>) => {
        onReceiveMessage(event, form, startForm);
    });

    // Request pre-populated defaults from the extension host.
    host.postMessage(new RequestFormDefaultsCommand());
};

/**
 * Initialises the tab-bar switching logic.
 *
 * Toggles `.active` on both the tab buttons and their corresponding panels.
 * Persists the active tab in webview state.
 */
function initTabs(): void {
    const tabBtns = document.querySelectorAll<HTMLButtonElement>(".tab-btn");
    const tabPanels = document.querySelectorAll<HTMLElement>(".tab-panel");

    // Restore persisted active tab.
    try {
        const state = host.getState() as Record<string, unknown> | undefined;
        const savedTab = state?.activeTab as string | undefined;
        if (savedTab) {
            activateTab(savedTab, tabBtns, tabPanels);
        }
    } catch {
        // No saved state — default tab is already active.
    }

    for (const btn of tabBtns) {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.tab;
            if (!tab) return;
            activateTab(tab, tabBtns, tabPanels);
            host.setState({
                ...((host.getState() as Record<string, unknown>) ?? {}),
                activeTab: tab,
            });
        });
    }
}

/** Activates the given tab by toggling `.active` on its button and panel. */
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

/** Routes messages from the host to the appropriate form method. */
function onReceiveMessage(
    event: MessageEvent<Query | Command>,
    form: DeploymentForm,
    startForm: StartInstanceForm,
): void {
    const msg = event.data;

    switch (msg.type) {
        case "FormDefaultsQuery":
            form.populate((msg as FormDefaultsQuery).defaults);
            break;
        case "AdditionalFilesQuery":
            form.setAdditionalFiles((msg as AdditionalFilesQuery).filePaths);
            break;
        case "StoredCredentialsQuery":
            form.populateCredentials((msg as StoredCredentialsQuery).auth);
            break;
        case "DeploymentResultQuery":
            form.showResult(msg as DeploymentResultQuery);
            break;
        case "ProcessDefinitionKeyQuery":
            startForm.setProcessDefinitionKey(
                (msg as ProcessDefinitionKeyQuery).processDefinitionKey,
            );
            break;
        case "SelectedPayloadFileQuery": {
            const payload = msg as SelectedPayloadFileQuery;
            startForm.setPayloadFile(payload.filePath, payload.label);
            break;
        }
        case "StartInstanceResultQuery":
            startForm.showResult(msg as StartInstanceResultQuery);
            break;
        default:
            console.debug("[DeploymentWebview] Unhandled message type:", msg.type);
    }
}
