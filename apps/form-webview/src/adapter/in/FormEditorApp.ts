import {
    LogErrorCommand,
    LogWarningCommand,
    UpdateFormOutputValuesCommand,
} from "@miragon/bpmn-modeler-shared";
import { serializeAsync } from "@miragon/bpmn-modeler-types";

import type {
    FormDocumentLoadListener,
    FormSchema,
    FormSchemaEditor,
    FormSchemaImportResult,
} from "../../port/formDocument";
import type { FormHost, WebviewState } from "../../port/formHost";
import type { FormDocumentSession } from "../../service/documentSession";

export interface FormEditorLike extends Pick<FormSchemaEditor, "saveSchema"> {
    on(event: "changed", handler: () => void): void;
}

export interface FormViewerLike {
    importSchema(schema: FormSchema, data?: FormSchema): Promise<FormSchemaImportResult>;
    on(
        event: "changed" | "formFieldInstance.added" | "formFieldInstance.removed",
        handler: () => void,
    ): void;
    _getSubmitData(): FormSchema;
}

export interface FormEditorElements {
    editor: HTMLElement;
    preview: HTMLElement;
    error: HTMLElement;
    editButton: HTMLButtonElement;
    previewButton: HTMLButtonElement;
}

type FormDocument = Pick<FormDocumentSession, "isReady" | "load" | "syncChangedContent">;

export class FormEditorApp {
    private mode: WebviewState["mode"] = "edit";
    private readonly importPreviewInOrder = serializeAsync((version: number) =>
        this.importPreview(version),
    );
    private previewRefreshVersion = 0;
    private previewSchema = "";
    private inputValues: FormSchema = {};
    private inputValuesContent = this.serialize(this.inputValues);
    private previewInputValues = "";
    private outputValuesContent: string | undefined;
    private previewOutputActive = false;
    private readonly hostDocumentLoad: FormDocumentLoadListener = {
        onArrived: (replacesDocument) => this.invalidatePreview(replacesDocument),
        onImported: async (warnings) => {
            this.logWarnings("Form editor", warnings);
            this.hideError();
            this.showCurrentSurface();
            if (this.mode === "preview") await this.refreshPreview();
        },
        onFailed: (message, cause) => this.showError(message, cause),
    };

    constructor(
        private readonly formEditor: FormEditorLike,
        private readonly formViewer: FormViewerLike,
        private readonly host: FormHost,
        private readonly elements: FormEditorElements,
        private readonly formDocument: FormDocument,
        initialMode: WebviewState["mode"] = "edit",
    ) {
        this.formEditor.on("changed", () => this.formDocument.syncChangedContent());
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

    load(content: string, documentRevision = 0): Promise<void> {
        return this.formDocument.load(content, documentRevision, this.hostDocumentLoad);
    }

    async setMode(mode: WebviewState["mode"]): Promise<void> {
        if (this.formDocument.isReady()) this.hideError();
        this.mode = mode;
        if (mode === "edit") this.previewOutputActive = false;
        this.host.updateState({ mode });
        this.showCurrentSurface();
        if (mode === "preview" && this.formDocument.isReady()) await this.refreshPreview();
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

        const serialized = this.serialize(inputValues as FormSchema);
        if (serialized === this.inputValuesContent) return;
        this.inputValues = inputValues as FormSchema;
        this.inputValuesContent = serialized;
        if (this.mode === "preview" && this.formDocument.isReady()) {
            await this.refreshPreview();
        }
    }

    private async refreshPreview(): Promise<void> {
        const version = ++this.previewRefreshVersion;
        this.previewOutputActive = false;
        return this.importPreviewInOrder(version);
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
        if (!this.elements.error.hidden && !this.formDocument.isReady()) return;
        const preview = this.mode === "preview";
        this.elements.editor.hidden = preview;
        this.elements.preview.hidden = !preview;
        this.elements.editButton.classList.toggle("active", !preview);
        this.elements.previewButton.classList.toggle("active", preview);
        this.elements.editButton.setAttribute("aria-pressed", String(!preview));
        this.elements.previewButton.setAttribute("aria-pressed", String(preview));
    }

    private showError(message: string, cause: unknown): void {
        this.clearOutputValues();
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

    private serialize(schema: FormSchema): string {
        return JSON.stringify(schema, null, 2);
    }
}
