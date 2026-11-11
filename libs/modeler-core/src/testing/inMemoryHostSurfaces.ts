import { LintResults } from "@miragon/bpmn-modeler-types";

import {
    DiagnosticsPort,
    LintingPreferencePort,
    PropertiesPanelStatePort,
} from "../modeler/bpmn/port/bpmnPorts";
import { ClipboardPort, WorkspaceTrustPort } from "../kernel/port/hostPorts";
import { InMemorySettings } from "./InMemorySettings";

/** Trusted unless a spec withdraws it, as a host without a trust feature reads. */
export class InMemoryWorkspaceTrust implements WorkspaceTrustPort {
    private readonly listeners = new Set<() => void>();

    constructor(private trusted = true) {}

    isTrusted(): boolean {
        return this.trusted;
    }

    setTrusted(trusted: boolean): void {
        if (trusted === this.trusted) return;
        this.trusted = trusted;
        this.listeners.forEach((listener) => listener());
    }

    onDidChange(listener: () => void): { dispose(): void } {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
    }
}

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
    readonly storedChoices: boolean[] = [];

    constructor(private readonly settings: InMemorySettings) {}

    setLintingEnabled(enabled: boolean): void {
        this.storedChoices.push(enabled);
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
