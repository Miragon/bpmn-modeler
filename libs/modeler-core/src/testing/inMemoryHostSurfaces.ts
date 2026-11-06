import { LintResults } from "@miragon/bpmn-modeler-types";

import {
    DiagnosticsPort,
    LintingPreferencePort,
    PropertiesPanelStatePort,
} from "../modeler/bpmn/port/bpmnPorts";
import { ClipboardPort } from "../kernel/port/hostPorts";
import { InMemorySettings } from "./InMemorySettings";

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

/** Stores the choice in the settings the core reads it back from, as the hosts do. */
export class InMemoryLintingPreference implements LintingPreferencePort {
    constructor(private readonly settings: InMemorySettings) {}

    setLintingEnabled(enabled: boolean): void {
        this.settings.values.lintingEnabled = enabled;
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
