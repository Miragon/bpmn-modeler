import "./styles/default.css";

import {
    AdditionalFilesQuery,
    Command,
    DeploymentResultQuery,
    FormDefaultsQuery,
    ProcessDefinitionKeyQuery,
    Query,
    RequestFormDefaultsCommand,
    SelectedPayloadFileQuery,
    StartInstanceResultQuery,
    StoredCredentialsQuery,
} from "@miragon/bpmn-modeler-shared";

import { DeploymentForm } from "./app/form";
import { StartInstanceForm } from "./app/startInstanceForm";
import { getVsCodeApi } from "./app/vscode";

const vscode = getVsCodeApi();

/**
 * Entry point: initialises the deployment and start-instance forms once the
 * DOM is ready, sets up tab switching, and requests initial defaults.
 */
window.onload = function () {
    let form: DeploymentForm;
    let startForm: StartInstanceForm;

    try {
        form = new DeploymentForm(vscode);
        startForm = new StartInstanceForm(
            vscode,
            () => form.getAuthPayload(),
            () => form.getConnectionPayload(),
        );
    } catch (err) {
        console.error("[DeploymentWebview] Failed to initialise forms:", err);
        return;
    }

    initTabs();

    window.addEventListener("message", (event: MessageEvent<Query | Command>) => {
        onReceiveMessage(event, form, startForm);
    });

    // Request pre-populated defaults from the extension host.
    vscode.postMessage(new RequestFormDefaultsCommand());
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
        const state = vscode.getState() as Record<string, unknown> | undefined;
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
            vscode.setState({
                ...((vscode.getState() as Record<string, unknown>) ?? {}),
                activeTab: tab,
            });
        });
    }
}

/**
 * Activates the given tab by toggling `.active` on buttons and panels.
 *
 * @param tab The tab identifier (matching `data-tab` attribute).
 * @param tabBtns All tab button elements.
 * @param tabPanels All tab panel elements.
 */
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

/**
 * Routes messages from the VS Code extension host to the appropriate form method.
 *
 * @param event The raw `MessageEvent` from `window.addEventListener("message", …)`.
 * @param form The active {@link DeploymentForm} instance.
 * @param startForm The active {@link StartInstanceForm} instance.
 */
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
