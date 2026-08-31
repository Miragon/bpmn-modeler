import {
    AuthConfigPayload,
    Command,
    LogInfoCommand,
    Query,
    RequestPayloadFilesCommand,
    StartInstanceCommand,
    StartInstanceConfigPayload,
    StartInstanceResultQuery,
    HostApi,
} from "@miragon/bpmn-modeler-shared";
import { Engine } from "@miragon/bpmn-modeler-types";

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

    // Absolute path to the selected payload file, or empty string.
    private payloadFilePath = "";

    /** Resolves DOM references and binds events; throws if an expected element is missing. */
    constructor(
        private readonly host: HostApi<unknown, Command | Query>,
        private readonly getSharedAuth: () => AuthConfigPayload,
        private readonly getSharedConnection: () => {
            endpoint: string;
            engine: Engine;
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

    setProcessDefinitionKey(key: string): void {
        this.processDefinitionKeyInput.value = key;
    }

    /** Shows the payload file label and stores its absolute path. */
    setPayloadFile(filePath: string, label: string): void {
        this.payloadFilePath = filePath;
        this.payloadFileInput.value = label || "(none)";
    }

    showProgress(): void {
        this.startInstanceBtn.disabled = true;
        this.statusBanner.className = "status-banner progress";
        this.statusBanner.textContent = "Starting process instance\u2026";
        this.statusBanner.style.display = "block";
    }

    /** Shows the start-instance result in the status banner and re-enables the button. */
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

    private bindEvents(): void {
        this.selectPayloadBtn.addEventListener("click", () => {
            this.host.postMessage(new RequestPayloadFilesCommand());
        });

        this.startInstanceBtn.addEventListener("click", () => {
            try {
                const payload = this.getConfigPayload();
                this.showProgress();
                this.host.postMessage(new StartInstanceCommand(payload));
            } catch (err) {
                this.statusBanner.className = "status-banner error";
                this.statusBanner.textContent = err instanceof Error ? err.message : String(err);
                this.statusBanner.style.display = "block";
                // Breadcrumb, not a defect: the banner already tells the user; the
                // channel line records that start-instance was blocked client-side.
                this.host.postMessage(
                    new LogInfoCommand(
                        `Start-instance form validation failed: ${err instanceof Error ? err.message : String(err)}`,
                    ),
                );
            }
        });
    }

    /** Builds a {@link StartInstanceConfigPayload} from the form, throwing on empty required fields. */
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

    /** Returns the DOM element matching `selector`, or throws if none matches. */
    private requireElement<T extends Element>(selector: string): T {
        const el = document.querySelector<T>(selector);
        if (!el) {
            throw new Error(`Required DOM element not found: ${selector}`);
        }
        return el;
    }
}
