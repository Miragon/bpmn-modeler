import {
    AuthConfigPayload,
    Command,
    DeployCommand,
    DeploymentConfigPayload,
    DeploymentFormDefaults,
    DeploymentResultQuery,
    Query,
    RequestAdditionalFilesCommand,
    RequestStoredCredentialsCommand,
    VsCodeApi,
} from "@bpmn-modeler/shared";

import { WebviewState } from "./vscode";

/**
 * Manages the deployment form DOM state: populating fields from extension-host
 * defaults, collecting the user-entered config, and rendering results.
 *
 * `DeploymentForm` is intentionally framework-free — it manipulates the DOM
 * directly and communicates with the VS Code extension host via the
 * `postMessage` API wrapped by {@link VsCodeApi}.
 */
export class DeploymentForm {
    /** Section IDs that should be collapsed when no persisted state exists. */
    private static readonly DEFAULT_COLLAPSED_SECTIONS: string[] = [];

    private readonly deploymentNameInput: HTMLInputElement;

    private readonly tenantIdInput: HTMLInputElement;

    private readonly endpointInput: HTMLInputElement;

    private readonly engineSelect: HTMLSelectElement;

    private readonly authTypeSelect: HTMLSelectElement;

    private readonly basicAuthFields: HTMLDivElement;

    private readonly authUsernameInput: HTMLInputElement;

    private readonly authPasswordInput: HTMLInputElement;

    private readonly oauth2AuthFields: HTMLDivElement;

    private readonly authClientIdInput: HTMLInputElement;

    private readonly authClientSecretInput: HTMLInputElement;

    private readonly authTokenEndpointInput: HTMLInputElement;

    private readonly authAudienceInput: HTMLInputElement;

    private readonly mainFilePathInput: HTMLInputElement;

    private readonly additionalFilesBtn: HTMLButtonElement;

    private readonly fileList: HTMLUListElement;

    private readonly deployBtn: HTMLButtonElement;

    private readonly statusBanner: HTMLDivElement;

    /** Absolute paths of additional files selected via QuickPick. */
    private additionalFilePaths: string[] = [];

    /**
     * Wires up all DOM element references and attaches event listeners.
     *
     * @param vscode The VS Code API instance used to post messages.
     * @throws {Error} If any expected DOM element is missing.
     */
    constructor(private readonly vscode: VsCodeApi<unknown, Command | Query>) {
        this.deploymentNameInput =
            this.requireElement<HTMLInputElement>("#deployment-name");
        this.tenantIdInput = this.requireElement<HTMLInputElement>("#tenant-id");
        this.endpointInput = this.requireElement<HTMLInputElement>("#endpoint");
        this.engineSelect = this.requireElement<HTMLSelectElement>("#engine");
        this.authTypeSelect = this.requireElement<HTMLSelectElement>("#auth-type");
        this.basicAuthFields =
            this.requireElement<HTMLDivElement>("#basic-auth-fields");
        this.authUsernameInput =
            this.requireElement<HTMLInputElement>("#auth-username");
        this.authPasswordInput =
            this.requireElement<HTMLInputElement>("#auth-password");
        this.oauth2AuthFields =
            this.requireElement<HTMLDivElement>("#oauth2-auth-fields");
        this.authClientIdInput =
            this.requireElement<HTMLInputElement>("#auth-client-id");
        this.authClientSecretInput =
            this.requireElement<HTMLInputElement>("#auth-client-secret");
        this.authTokenEndpointInput =
            this.requireElement<HTMLInputElement>("#auth-token-endpoint");
        this.authAudienceInput =
            this.requireElement<HTMLInputElement>("#auth-audience");
        this.mainFilePathInput =
            this.requireElement<HTMLInputElement>("#main-file-path");
        this.additionalFilesBtn =
            this.requireElement<HTMLButtonElement>("#add-files-btn");
        this.fileList = this.requireElement<HTMLUListElement>("#file-list");
        this.deployBtn = this.requireElement<HTMLButtonElement>("#deploy-btn");
        this.statusBanner = this.requireElement<HTMLDivElement>("#status-banner");

        this.bindEvents();
        this.initSections();
        this.toggleAuthFields();
        this.attachPasswordToggle(this.authPasswordInput);
        this.attachPasswordToggle(this.authClientSecretInput);
    }

    /**
     * Populates the form fields from the extension host's defaults.
     *
     * @param defaults Pre-populated defaults provided by `DeploymentService.getFormDefaults()`.
     */
    populate(defaults: DeploymentFormDefaults): void {
        this.deploymentNameInput.value = defaults.deploymentName;
        this.tenantIdInput.value = defaults.tenantId;
        this.endpointInput.value = defaults.endpoint;
        this.engineSelect.value = defaults.engine;
        this.authTypeSelect.value = defaults.authType;
        if (defaults.tokenEndpoint) {
            this.authTokenEndpointInput.value = defaults.tokenEndpoint;
        }
        if (defaults.audience) {
            this.authAudienceInput.value = defaults.audience;
        }
        this.toggleAuthFields();
        // mainFilePath is read-only — managed by the extension host.
        this.mainFilePathInput.value = defaults.deploymentName
            ? `(current file: ${defaults.deploymentName}.bpmn)`
            : "";

        // Request stored credentials if auth type requires them.
        if (defaults.authType !== "none") {
            this.vscode.postMessage(new RequestStoredCredentialsCommand());
        }
    }

    /**
     * Pre-fills the auth credential fields from stored values.
     *
     * @param auth The stored auth configuration payload.
     */
    populateCredentials(auth: AuthConfigPayload): void {
        if (auth.authType === "basic") {
            this.authUsernameInput.value = auth.username ?? "";
            this.authPasswordInput.value = auth.password ?? "";
        } else if (auth.authType === "oauth2") {
            this.authClientIdInput.value = auth.clientId ?? "";
            this.authClientSecretInput.value = auth.clientSecret ?? "";
            this.authTokenEndpointInput.value = auth.tokenEndpoint ?? "";
            this.authAudienceInput.value = auth.audience ?? "";
        }
    }

    /**
     * Reads the current form values and builds a {@link DeploymentConfigPayload}.
     *
     * @returns A payload ready to attach to a {@link DeployCommand}.
     * @throws {Error} If `deploymentName` or `endpoint` are empty.
     */
    getConfigPayload(): DeploymentConfigPayload {
        const deploymentName = this.deploymentNameInput.value.trim();
        const endpoint = this.endpointInput.value.trim();

        if (!deploymentName) {
            throw new Error("Deployment name is required.");
        }
        if (!endpoint) {
            throw new Error("REST endpoint is required.");
        }

        const authType = this.authTypeSelect.value as AuthConfigPayload["authType"];
        let auth: AuthConfigPayload = { authType };

        if (authType === "basic") {
            const username = this.authUsernameInput.value.trim();
            const password = this.authPasswordInput.value;

            if (!username) {
                throw new Error("Username is required for Basic Auth.");
            }
            if (!password) {
                throw new Error("Password is required for Basic Auth.");
            }

            auth = { authType, username, password };
        } else if (authType === "oauth2") {
            const clientId = this.authClientIdInput.value.trim();
            const clientSecret = this.authClientSecretInput.value;
            const tokenEndpoint = this.authTokenEndpointInput.value.trim();
            const audience = this.authAudienceInput.value.trim();

            if (!clientId) {
                throw new Error("Client ID is required for OAuth2.");
            }
            if (!clientSecret) {
                throw new Error("Client Secret is required for OAuth2.");
            }
            if (!tokenEndpoint) {
                throw new Error("Token Endpoint is required for OAuth2.");
            }

            auth = { authType, clientId, clientSecret, tokenEndpoint, audience };
        }

        return {
            deploymentName,
            tenantId: this.tenantIdInput.value.trim(),
            endpoint,
            engine: this.engineSelect.value as "c7" | "c8",
            mainFilePath: "", // Populated by the extension host from the active editor
            additionalFilePaths: [...this.additionalFilePaths],
            auth,
        };
    }

    /**
     * Appends newly selected additional file paths to the list and re-renders.
     *
     * @param paths Absolute paths returned by the extension host after QuickPick selection.
     */
    setAdditionalFiles(paths: string[]): void {
        // Merge without duplicates.
        for (const p of paths) {
            if (!this.additionalFilePaths.includes(p)) {
                this.additionalFilePaths.push(p);
            }
        }
        this.renderFileList();
    }

    /** Disables the Deploy button and shows a spinner in the status banner. */
    showProgress(): void {
        this.deployBtn.disabled = true;
        this.statusBanner.className = "status-banner progress";
        this.statusBanner.textContent = "Deploying\u2026";
        this.statusBanner.style.display = "block";
    }

    /**
     * Shows the deployment result in the status banner and re-enables the Deploy button.
     *
     * @param result The result query received from the extension host.
     */
    showResult(result: DeploymentResultQuery): void {
        this.deployBtn.disabled = false;
        this.statusBanner.className = result.success
            ? "status-banner success"
            : "status-banner error";
        this.statusBanner.textContent = result.message;
        this.statusBanner.style.display = "block";
    }

    /**
     * Returns the current auth configuration from the shared auth fields.
     *
     * Used by {@link StartInstanceForm} to read the shared auth settings.
     */
    getAuthPayload(): AuthConfigPayload {
        const authType = this.authTypeSelect.value as AuthConfigPayload["authType"];
        let auth: AuthConfigPayload = { authType };

        if (authType === "basic") {
            auth = {
                authType,
                username: this.authUsernameInput.value.trim(),
                password: this.authPasswordInput.value,
            };
        } else if (authType === "oauth2") {
            auth = {
                authType,
                clientId: this.authClientIdInput.value.trim(),
                clientSecret: this.authClientSecretInput.value,
                tokenEndpoint: this.authTokenEndpointInput.value.trim(),
                audience: this.authAudienceInput.value.trim(),
            };
        }

        return auth;
    }

    /**
     * Returns the current endpoint and engine values from the shared connection fields.
     *
     * Used by {@link StartInstanceForm} to read the shared connection settings.
     */
    getConnectionPayload(): { endpoint: string; engine: "c7" | "c8" } {
        return {
            endpoint: this.endpointInput.value.trim(),
            engine: this.engineSelect.value as "c7" | "c8",
        };
    }

    /** Re-enables the Deploy button and hides the status banner. */
    reset(): void {
        this.deployBtn.disabled = false;
        this.statusBanner.style.display = "none";
        this.statusBanner.textContent = "";
    }

    // --- Private helpers ---

    /**
     * Initialises collapsible section headers by attaching click and keyboard
     * listeners, and restoring previously persisted collapsed state.
     */
    private initSections(): void {
        const headers = document.querySelectorAll<HTMLElement>(".section-header");

        let collapsed: string[];
        try {
            const state = this.vscode.getState() as WebviewState | undefined;
            collapsed = state?.collapsedSections ?? this.defaultCollapsedSections();
        } catch {
            collapsed = this.defaultCollapsedSections();
        }

        for (const header of headers) {
            const sectionId = header.dataset.section;
            if (!sectionId) continue;

            // Restore persisted collapsed state.
            if (collapsed.includes(sectionId)) {
                this.collapseSection(header);
            }

            header.addEventListener("click", () => this.toggleSection(header));
            header.addEventListener("keydown", (e: KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    this.toggleSection(header);
                }
            });
        }
    }

    /**
     * Toggles a section between expanded and collapsed and persists the state.
     *
     * @param header The `.section-header` element that was activated.
     */
    private toggleSection(header: HTMLElement): void {
        const section = header.parentElement;
        if (!section) return;

        const isCollapsed = section.classList.toggle("collapsed");
        header.setAttribute("aria-expanded", String(!isCollapsed));
        this.persistSectionState();
    }

    /**
     * Collapses a section without persisting (used during initialisation).
     *
     * @param header The `.section-header` element to collapse.
     */
    private collapseSection(header: HTMLElement): void {
        const section = header.parentElement;
        if (!section) return;

        section.classList.add("collapsed");
        header.setAttribute("aria-expanded", "false");
    }

    /**
     * Saves the IDs of all currently collapsed sections via `vscode.setState`.
     */
    private persistSectionState(): void {
        const collapsedSections: string[] = [];
        const headers = document.querySelectorAll<HTMLElement>(".section-header");

        for (const header of headers) {
            if (header.getAttribute("aria-expanded") === "false") {
                const sectionId = header.dataset.section;
                if (sectionId) collapsedSections.push(sectionId);
            }
        }

        this.vscode.setState({ collapsedSections } as WebviewState);
    }

    /**
     * Returns the default list of section IDs that should start collapsed.
     */
    private defaultCollapsedSections(): string[] {
        return [...DeploymentForm.DEFAULT_COLLAPSED_SECTIONS];
    }

    /**
     * Attaches click handlers to the Deploy and Add-Files buttons.
     */
    private bindEvents(): void {
        this.authTypeSelect.addEventListener("change", () => {
            this.toggleAuthFields();
            if (this.authTypeSelect.value !== "none") {
                this.vscode.postMessage(new RequestStoredCredentialsCommand());
            }
        });

        this.additionalFilesBtn.addEventListener("click", () => {
            this.vscode.postMessage(new RequestAdditionalFilesCommand());
        });

        this.deployBtn.addEventListener("click", () => {
            try {
                const payload = this.getConfigPayload();
                this.showProgress();
                this.vscode.postMessage(new DeployCommand(payload));
            } catch (err) {
                this.statusBanner.className = "status-banner error";
                this.statusBanner.textContent =
                    err instanceof Error ? err.message : String(err);
                this.statusBanner.style.display = "block";
            }
        });
    }

    /**
     * Shows or hides the Basic Auth credential fields based on the
     * current auth type selection.
     */
    private toggleAuthFields(): void {
        // Hide all auth field groups and clear their inputs.
        this.basicAuthFields.classList.remove("visible");
        this.oauth2AuthFields.classList.remove("visible");

        const selected = this.authTypeSelect.value;

        if (selected === "basic") {
            this.basicAuthFields.classList.add("visible");
            // Clear OAuth2 fields when switching away.
            this.authClientIdInput.value = "";
            this.authClientSecretInput.value = "";
            this.authTokenEndpointInput.value = "";
            this.authAudienceInput.value = "";
        } else if (selected === "oauth2") {
            this.oauth2AuthFields.classList.add("visible");
            // Clear Basic fields when switching away.
            this.authUsernameInput.value = "";
            this.authPasswordInput.value = "";
        } else {
            // "none" — clear all credential fields.
            this.authUsernameInput.value = "";
            this.authPasswordInput.value = "";
            this.authClientIdInput.value = "";
            this.authClientSecretInput.value = "";
            this.authTokenEndpointInput.value = "";
            this.authAudienceInput.value = "";
        }
    }

    /**
     * Re-renders the additional files list with remove buttons for each entry.
     */
    private renderFileList(): void {
        this.fileList.innerHTML = "";
        for (const filePath of this.additionalFilePaths) {
            const li = document.createElement("li");
            li.className = "file-item";

            const nameSpan = document.createElement("span");
            nameSpan.textContent = filePath.split("/").pop() ?? filePath;
            nameSpan.title = filePath;

            const removeBtn = document.createElement("button");
            removeBtn.textContent = "\u00d7";
            removeBtn.className = "remove-btn";
            removeBtn.addEventListener("click", () => {
                this.additionalFilePaths = this.additionalFilePaths.filter(
                    (p) => p !== filePath,
                );
                this.renderFileList();
            });

            li.appendChild(nameSpan);
            li.appendChild(removeBtn);
            this.fileList.appendChild(li);
        }
    }

    /** SVG path data for an open eye icon. */
    private static readonly EYE_OPEN_SVG = `
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>`;

    /** SVG path data for a slashed eye icon. */
    private static readonly EYE_CLOSED_SVG = `
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
        <line x1="1" y1="1" x2="23" y2="23"/>`;

    /**
     * Attaches a click listener to the `.password-toggle` button next to the
     * given input, toggling between `password` and `text` type on each click.
     *
     * @param input The password input element whose sibling toggle to wire up.
     */
    private attachPasswordToggle(input: HTMLInputElement): void {
        const wrapper = input.parentElement;
        if (!wrapper) return;

        const toggle = wrapper.querySelector<HTMLButtonElement>(".password-toggle");
        if (!toggle) return;

        toggle.addEventListener("click", () => {
            const isHidden = input.type === "password";
            input.type = isHidden ? "text" : "password";

            const svg = toggle.querySelector("svg");
            if (svg) {
                svg.innerHTML = isHidden
                    ? DeploymentForm.EYE_CLOSED_SVG
                    : DeploymentForm.EYE_OPEN_SVG;
            }

            const label = isHidden ? "Hide password" : "Show password";
            toggle.title = label;
            toggle.setAttribute("aria-label", label);
        });
    }

    /**
     * Returns the DOM element matching `selector` or throws if not found.
     *
     * @param selector CSS selector string.
     * @returns The matching element.
     * @throws {Error} If no element matches the selector.
     */
    private requireElement<T extends Element>(selector: string): T {
        const el = document.querySelector<T>(selector);
        if (!el) {
            throw new Error(`Required DOM element not found: ${selector}`);
        }
        return el;
    }
}
