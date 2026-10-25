import { LintResults } from "@miragon/bpmn-modeler-types";

import {
    ClipboardPort,
    DiagnosticsPort,
    PropertiesPanelStatePort,
} from "../shared/domain/hostPorts";

export class InMemoryClipboard implements ClipboardPort {
    text = "";

    async readClipboard(): Promise<string> {
        return this.text;
    }

    async writeClipboard(text: string): Promise<void> {
        this.text = text;
    }
}

export class InMemoryPropertiesPanelState implements PropertiesPanelStatePort {
    visible = true;

    getVisibility(): boolean {
        return this.visible;
    }

    async setVisibility(visible: boolean): Promise<void> {
        this.visible = visible;
    }
}

export class RecordingDiagnostics implements DiagnosticsPort {
    readonly published = new Map<string, LintResults>();

    publish(documentUri: string, _xml: string, results: LintResults): void {
        this.published.set(documentUri, results);
    }

    clear(documentUri: string): void {
        this.published.delete(documentUri);
    }
}
