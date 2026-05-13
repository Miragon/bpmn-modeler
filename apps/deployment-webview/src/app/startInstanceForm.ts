import {
    AuthConfigPayload,
    Command,
    Query,
    RequestPayloadFilesCommand,
    StartInstanceCommand,
    StartInstanceConfigPayload,
    StartInstanceResultQuery,
    VsCodeApi,
} from "@miragon/bpmn-modeler-shared";

/**
 * Manages the Start Instance tab DOM state: populating fields, collecting
 * user input, and rendering results.
 *
 * Follows the same framework-free pattern as {@link DeploymentForm}.
 */
export class StartInstanceForm {
    private readonly processDefinitionKeyInput: HTMLInputElement;

    private readonly payloadFileInput: HTMLInputElement;

    private readonly selectPayloadBtn: HTMLButtonElement;

    private readonly startInstanceBtn: HTMLButtonElement;

    private readonly statusBanner: HTMLDivElement;

    /** Absolute path to the selected payload file, or empty string. */
    private payloadFilePath = "";

    /**
     * Wires up all DOM element references and attaches event listeners.
     *
     * @param vscode The VS Code API instance used to post messages.
     * @param getSharedAuth Callback to read the current auth config from the shared form fields.
     * @param getSharedConnection Callback to read endpoint and engine from the shared form fields.
     * @throws {Error} If any expected DOM element is missing.
     */
    constructor(
        private readonly vscode: VsCodeApi<unknown, Command | Query>,
        private readonly getSharedAuth: () => AuthConfigPayload,
        private readonly getSharedConnection: () => {
            endpoint: string;
            engine: "c7" | "c8";
        },
    ) {
        this.processDefinitionKeyInput =
            this.requireElement<HTMLInputElement>("#process-definition-key");
        this.payloadFileInput = this.requireElement<HTMLInputElement>("#payload-file");
        this.selectPayloadBtn = this.requireElement<HTMLButtonElement>("#select-payload-btn");
        this.startInstanceBtn = this.requireElement<HTMLButtonElement>("#start-instance-btn");
        this.statusBanner = this.requireElement<HTMLDivElement>("#start-status-banner");

        this.bindEvents();
    }

    /**
     * Sets the process definition key input value.
     *
     * @param key The process definition key extracted from the BPMN file.
     */
    setProcessDefinitionKey(key: string): void {
        this.processDefinitionKeyInput.value = key;
    }

    /**
     * Sets the payload file display and stores the path internally.
     *
     * @param filePath Absolute path to the payload file.
     * @param label Display label (typically the filename).
     */
    setPayloadFile(filePath: string, label: string): void {
        this.payloadFilePath = filePath;
        this.payloadFileInput.value = label || "(none)";
    }

    /** Disables the Start Instance button and shows a progress indicator. */
    showProgress(): void {
        this.startInstanceBtn.disabled = true;
        this.statusBanner.className = "status-banner progress";
        this.statusBanner.textContent = "Starting process instance\u2026";
        this.statusBanner.style.display = "block";
    }

    /**
     * Shows the start-instance result in the status banner and re-enables the button.
     *
     * @param result The result query received from the extension host.
     */
    showResult(result: StartInstanceResultQuery): void {
        this.startInstanceBtn.disabled = false;
        this.statusBanner.className = result.success
            ? "status-banner success"
            : "status-banner error";

        let text = result.message;
        if (result.success && result.processInstanceId) {
            text += ` (ID: ${result.processInstanceId})`;
        }
        this.statusBanner.textContent = text;
        this.statusBanner.style.display = "block";
    }

    // --- Private helpers ---

    /**
     * Attaches click handlers to the Select Payload and Start Instance buttons.
     */
    private bindEvents(): void {
        this.selectPayloadBtn.addEventListener("click", () => {
            this.vscode.postMessage(new RequestPayloadFilesCommand());
        });

        this.startInstanceBtn.addEventListener("click", () => {
            try {
                const payload = this.getConfigPayload();
                this.showProgress();
                this.vscode.postMessage(new StartInstanceCommand(payload));
            } catch (err) {
                this.statusBanner.className = "status-banner error";
                this.statusBanner.textContent = err instanceof Error ? err.message : String(err);
                this.statusBanner.style.display = "block";
            }
        });
    }

    /**
     * Reads the current form values and builds a {@link StartInstanceConfigPayload}.
     *
     * @returns A payload ready to attach to a {@link StartInstanceCommand}.
     * @throws {Error} If required fields are empty.
     */
    private getConfigPayload(): StartInstanceConfigPayload {
        const processDefinitionKey = this.processDefinitionKeyInput.value.trim();
        if (!processDefinitionKey) {
            throw new Error("Process Definition Key is required.");
        }

        const connection = this.getSharedConnection();
        if (!connection.endpoint) {
            throw new Error("REST endpoint is required.");
        }

        return {
            processDefinitionKey,
            endpoint: connection.endpoint,
            engine: connection.engine,
            auth: this.getSharedAuth(),
            payloadFilePath: this.payloadFilePath,
        };
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
