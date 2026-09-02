import {
    LogErrorCommand,
    LogWarningCommand,
    SyncDocumentCommand,
    UpdateFormOutputValuesCommand,
} from "@miragon/bpmn-modeler-shared";

import { FormHost } from "./host";

type Schema = Record<string, unknown>;
type ImportResult = { warnings?: unknown[] };
const SYNC_DELIVERY_GRACE_MS = 200;

export interface FormEditorLike {
    importSchema(schema: Schema): Promise<ImportResult>;
    saveSchema(): Schema;
    on(event: "changed", handler: () => void): void;
}

export interface FormViewerLike {
    importSchema(schema: Schema, data?: Schema): Promise<ImportResult>;
    on(
        event: "changed" | "formFieldInstance.added" | "formFieldInstance.removed",
        handler: () => void,
    ): void;
    _getSubmitData(): Schema;
}

export interface FormEditorElements {
    editor: HTMLElement;
    preview: HTMLElement;
    error: HTMLElement;
    editButton: HTMLButtonElement;
    previewButton: HTMLButtonElement;
}

export class FormEditorApp {
    private mode: "edit" | "preview" = "edit";
    private activeHostUpdates = 0;
    private hostImportQueue: Promise<void> = Promise.resolve();
    private previewImportQueue: Promise<void> = Promise.resolve();
    private hostDocumentRevision = 0;
    private latestHostDocumentRevision = 0;
    private loadVersion = 0;
    private previewRefreshVersion = 0;
    private sourceContent = "";
    private baseline = "";
    private lastPostedContent = "";
    private previewSchema = "";
    private inputValues: Schema = {};
    private inputValuesContent = this.serialize(this.inputValues);
    private previewInputValues = "";
    private outputValuesContent: string | undefined;
    private previewOutputActive = false;
    private syncDeliveryTimer: ReturnType<typeof setTimeout> | undefined;
    private inertBeforeFlush: boolean | undefined;

    constructor(
        private readonly formEditor: FormEditorLike,
        private readonly formViewer: FormViewerLike,
        private readonly host: FormHost,
        private readonly elements: FormEditorElements,
        initialMode: "edit" | "preview" = "edit",
    ) {
        this.formEditor.on("changed", () => this.syncChangedContent());
        for (const event of [
            "changed",
            "formFieldInstance.added",
            "formFieldInstance.removed",
        ] as const) {
            this.formViewer.on(event, () => {
                if (this.previewOutputActive) this.syncOutputValues();
            });
        }
        this.elements.editButton.addEventListener("click", () => this.setMode("edit"));
        this.elements.previewButton.addEventListener("click", () => void this.setMode("preview"));
        void this.setMode(initialMode);
    }

    async load(content: string, documentRevision = 0): Promise<void> {
        if (documentRevision < this.latestHostDocumentRevision) return;
        this.latestHostDocumentRevision = documentRevision;
        const version = ++this.loadVersion;
        this.cancelPendingSync();
        this.invalidatePreview(this.baseline !== "");

        let schema: Schema;
        try {
            schema = JSON.parse(content) as Schema;
        } catch (error) {
            this.showError(
                "The form contains invalid JSON. Open the raw JSON editor to fix it.",
                error,
            );
            return;
        }

        this.activeHostUpdates++;
        try {
            const importing = this.hostImportQueue.then(() => this.formEditor.importSchema(schema));
            this.hostImportQueue = importing.then(
                () => undefined,
                () => undefined,
            );
            const result = await importing;
            if (version !== this.loadVersion) return;

            this.hostDocumentRevision = documentRevision;
            this.logWarnings("Form editor", result.warnings);
            this.sourceContent = content;
            this.baseline = this.serialize(this.formEditor.saveSchema());
            this.lastPostedContent = content;
            this.hideError();
            this.showCurrentSurface();
            if (this.mode === "preview") await this.refreshPreview();
        } catch (error) {
            if (version === this.loadVersion) {
                this.showError(
                    "The form schema could not be loaded. Open the raw JSON editor to fix it.",
                    error,
                );
            }
        } finally {
            this.activeHostUpdates--;
        }
    }

    hasPendingSync(): boolean {
        return this.syncDeliveryTimer !== undefined;
    }

    hasPendingHostUpdate(): boolean {
        return this.activeHostUpdates > 0;
    }

    hostUpdateVersion(): number {
        return this.loadVersion;
    }

    documentRevision(): number {
        return this.hostDocumentRevision;
    }

    cancelPendingSync(): void {
        if (this.syncDeliveryTimer !== undefined) clearTimeout(this.syncDeliveryTimer);
        this.syncDeliveryTimer = undefined;
    }

    flushPendingSync(): Promise<void> {
        if (this.hasPendingSync()) {
            this.cancelPendingSync();
            this.syncCurrentContent(true);
        }
        return Promise.resolve();
    }

    beginDestructiveFlush(): void {
        if (this.inertBeforeFlush === undefined) {
            this.inertBeforeFlush = Boolean(document.body.inert);
            document.body.inert = true;
        }
    }

    endDestructiveFlush(): void {
        if (this.inertBeforeFlush === undefined) return;
        document.body.inert = this.inertBeforeFlush;
        this.inertBeforeFlush = undefined;
    }

    async exportContent(): Promise<string> {
        return this.currentContent();
    }

    isReady(): boolean {
        return this.baseline !== "";
    }

    async setMode(mode: "edit" | "preview"): Promise<void> {
        if (this.baseline) this.hideError();
        this.mode = mode;
        if (mode === "edit") this.previewOutputActive = false;
        this.host.updateState({ mode });
        this.showCurrentSurface();
        if (mode === "preview" && this.baseline) await this.refreshPreview();
    }

    async setInputValues(content: string): Promise<void> {
        let inputValues: unknown;
        try {
            inputValues = JSON.parse(content);
        } catch (error) {
            this.logInputValuesError(error);
            return;
        }
        if (typeof inputValues !== "object" || inputValues === null || Array.isArray(inputValues)) {
            this.logInputValuesError(new Error("Expected a JSON object."));
            return;
        }

        const serialized = this.serialize(inputValues as Schema);
        if (serialized === this.inputValuesContent) return;
        this.inputValues = inputValues as Schema;
        this.inputValuesContent = serialized;
        if (this.mode === "preview" && this.baseline) await this.refreshPreview();
    }

    private syncChangedContent(): void {
        if (!this.syncCurrentContent()) return;
        if (this.syncDeliveryTimer !== undefined) clearTimeout(this.syncDeliveryTimer);
        this.syncDeliveryTimer = setTimeout(() => {
            this.syncDeliveryTimer = undefined;
        }, SYNC_DELIVERY_GRACE_MS);
    }

    private syncCurrentContent(force = false): boolean {
        if (this.activeHostUpdates > 0 || !this.baseline) return false;
        const content = this.currentContent();
        if (!force && content === this.lastPostedContent) return false;
        this.lastPostedContent = content;
        this.host.postMessage(new SyncDocumentCommand(content, this.hostDocumentRevision));
        return true;
    }

    private currentContent(): string {
        const serialized = this.serialize(this.formEditor.saveSchema());
        return serialized === this.baseline ? this.sourceContent : serialized;
    }

    private async refreshPreview(): Promise<void> {
        const version = ++this.previewRefreshVersion;
        this.previewOutputActive = false;
        const refreshing = this.previewImportQueue.then(() => this.importPreview(version));
        this.previewImportQueue = refreshing.then(
            () => undefined,
            () => undefined,
        );
        return refreshing;
    }

    private async importPreview(version: number): Promise<void> {
        const schema = this.formEditor.saveSchema();
        const serialized = this.serialize(schema);
        const inputValues = this.inputValues;
        const inputValuesContent = this.inputValuesContent;
        if (serialized === this.previewSchema && inputValuesContent === this.previewInputValues) {
            if (version === this.previewRefreshVersion) {
                this.previewOutputActive = true;
                this.syncOutputValues();
            }
            return;
        }

        try {
            const result = await this.formViewer.importSchema(schema, inputValues);
            if (version !== this.previewRefreshVersion) {
                this.previewSchema = "";
                this.previewInputValues = "";
                return;
            }
            this.previewSchema = serialized;
            this.previewInputValues = inputValuesContent;
            this.logWarnings("Form preview", result.warnings);
            this.previewOutputActive = true;
            this.syncOutputValues();
        } catch (error) {
            this.previewSchema = "";
            this.previewInputValues = "";
            if (version !== this.previewRefreshVersion) return;
            this.invalidatePreview(true);
            this.mode = "edit";
            this.host.updateState({ mode: "edit" });
            this.showRecoverableError("The form preview could not be loaded.", error);
            this.showCurrentSurface();
        }
    }

    private syncOutputValues(): void {
        const content = this.serialize(this.formViewer._getSubmitData());
        if (content === this.outputValuesContent) return;
        this.outputValuesContent = content;
        this.host.postMessage(new UpdateFormOutputValuesCommand(content));
    }

    private clearOutputValues(): void {
        const content = this.serialize({});
        if (content === this.outputValuesContent) return;
        this.outputValuesContent = content;
        this.host.postMessage(new UpdateFormOutputValuesCommand(content));
    }

    private invalidatePreview(clearOutput: boolean): void {
        this.previewRefreshVersion++;
        this.previewOutputActive = false;
        this.previewSchema = "";
        this.previewInputValues = "";
        if (clearOutput) this.clearOutputValues();
    }

    private logInputValuesError(cause: unknown): void {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        this.host.postMessage(
            new LogErrorCommand(`The form input values contain invalid JSON. ${error.message}`),
        );
    }

    private showCurrentSurface(): void {
        if (!this.elements.error.hidden && !this.baseline) return;
        const preview = this.mode === "preview";
        this.elements.editor.hidden = preview;
        this.elements.preview.hidden = !preview;
        this.elements.editButton.classList.toggle("active", !preview);
        this.elements.previewButton.classList.toggle("active", preview);
        this.elements.editButton.setAttribute("aria-pressed", String(!preview));
        this.elements.previewButton.setAttribute("aria-pressed", String(preview));
    }

    private showError(message: string, cause: unknown): void {
        this.cancelPendingSync();
        this.clearOutputValues();
        this.baseline = "";
        this.elements.editor.hidden = true;
        this.elements.preview.hidden = true;
        this.elements.error.textContent = message;
        this.elements.error.hidden = false;
        const error = cause instanceof Error ? cause : new Error(String(cause));
        this.host.postMessage(new LogErrorCommand(`${message} ${error.message}`, error.stack));
    }

    private showRecoverableError(message: string, cause: unknown): void {
        this.elements.error.textContent = message;
        this.elements.error.hidden = false;
        const error = cause instanceof Error ? cause : new Error(String(cause));
        this.host.postMessage(new LogErrorCommand(`${message} ${error.message}`, error.stack));
    }

    private hideError(): void {
        this.elements.error.hidden = true;
        this.elements.error.textContent = "";
    }

    private logWarnings(source: string, warnings: unknown[] | undefined): void {
        for (const warning of warnings ?? []) {
            const message = warning instanceof Error ? warning.message : String(warning);
            this.host.postMessage(new LogWarningCommand(`${source}: ${message}`));
        }
    }

    private serialize(schema: Schema): string {
        return JSON.stringify(schema, null, 2);
    }
}
