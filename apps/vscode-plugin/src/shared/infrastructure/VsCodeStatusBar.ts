import { StatusBarAlignment, StatusBarItem, ThemeColor, window } from "vscode";

import { Engine, ENGINE_LABEL } from "@miragon/bpmn-modeler-shared";

import { StatusBarPort } from "@miragon/bpmn-modeler-core";
const CHANGE_ENGINE_VERSION_CMD = "bpmn-modeler.changeEngineVersion";
const TOGGLE_LINTING_CMD = "bpmn-modeler.toggleLinting";

export class VsCodeStatusBar implements StatusBarPort {
    private templateStatusItem: StatusBarItem | undefined;

    private engineVersionStatusItem: StatusBarItem | undefined;

    private bpmnlintStatusItem: StatusBarItem | undefined;

    showElementTemplatesLoading(): void {
        const item = this.getOrCreateTemplateStatusItem();
        item.text = "$(loading~spin) Loading element templates…";
        item.show();
    }

    showElementTemplatesReady(count: number): void {
        const item = this.getOrCreateTemplateStatusItem();
        item.text = `$(check) Element templates (${count})`;
        item.show();
        setTimeout(() => item.hide(), 3000);
    }

    hideElementTemplatesStatus(): void {
        this.templateStatusItem?.hide();
    }

    showEngineVersion(platform: Engine, version: string): void {
        const item = this.getOrCreateEngineVersionStatusItem();
        const label = ENGINE_LABEL[platform];
        item.text = `$(server-environment) ${label} (${version})`;
        item.tooltip = "Click to change engine version";
        item.show();
    }

    hideEngineVersion(): void {
        this.engineVersionStatusItem?.hide();
    }

    disposeEngineVersionStatus(): void {
        this.engineVersionStatusItem?.dispose();
        this.engineVersionStatusItem = undefined;
    }

    showBpmnlintActive(configPath: string): void {
        const item = this.getOrCreateBpmnlintStatusItem();
        item.text = "$(check) BPMNlint";
        item.tooltip = configPath;
        item.backgroundColor = undefined;
        item.command = undefined;
        item.show();
    }

    showBpmnlintUnresolved(configPath: string, unresolved: string[]): void {
        const item = this.getOrCreateBpmnlintStatusItem();
        item.text = `$(warning) BPMNlint: ${unresolved.length} rule${unresolved.length === 1 ? "" : "s"} skipped`;
        // A warning background so a partly-applied config can't be mistaken for the
        // fully-green tick — the exact ambiguity this state exists to remove.
        item.backgroundColor = new ThemeColor("statusBarItem.warningBackground");
        item.tooltip = `${configPath}\n\nUnresolved (install the plugin providing these): ${unresolved.join(", ")}`;
        item.command = undefined;
        item.show();
    }

    showBpmnlintDefault(platform: Engine | undefined): void {
        const item = this.getOrCreateBpmnlintStatusItem();
        // A shield (not the green tick) so a bundled default is never mistaken for
        // a project's own `.bpmnlintrc`.
        item.text = "$(shield) BPMNlint (default)";
        const engine = platform ? ENGINE_LABEL[platform] : "no execution platform";
        item.tooltip = `Linting against the bundled default (${engine}).\nAdd a .bpmnlintrc to your workspace to override it.`;
        item.backgroundColor = undefined;
        item.command = undefined;
        item.show();
    }

    showBpmnlintDisabled(): void {
        const item = this.getOrCreateBpmnlintStatusItem();
        // Circle-slash (not the info `i`) reads as "deliberately off", and the
        // command turns it back on with one click for users who never open settings.
        item.text = "$(circle-slash) BPMNlint: off";
        item.tooltip = "BPMN linting is turned off — click to turn it back on.";
        item.backgroundColor = undefined;
        item.command = TOGGLE_LINTING_CMD;
        item.show();
    }

    showBpmnlintNoConfig(): void {
        const item = this.getOrCreateBpmnlintStatusItem();
        item.text = "$(info) BPMNlint: no .bpmnlintrc";
        item.tooltip = undefined;
        item.backgroundColor = undefined;
        item.command = undefined;
        item.show();
    }

    hideBpmnlintStatus(): void {
        this.bpmnlintStatusItem?.hide();
    }

    private getOrCreateTemplateStatusItem(): StatusBarItem {
        if (!this.templateStatusItem) {
            this.templateStatusItem = window.createStatusBarItem(StatusBarAlignment.Left, 100);
        }
        return this.templateStatusItem;
    }

    private getOrCreateEngineVersionStatusItem(): StatusBarItem {
        if (!this.engineVersionStatusItem) {
            this.engineVersionStatusItem = window.createStatusBarItem(
                StatusBarAlignment.Right,
                200,
            );
            this.engineVersionStatusItem.command = CHANGE_ENGINE_VERSION_CMD;
        }
        return this.engineVersionStatusItem;
    }

    private getOrCreateBpmnlintStatusItem(): StatusBarItem {
        if (!this.bpmnlintStatusItem) {
            this.bpmnlintStatusItem = window.createStatusBarItem(StatusBarAlignment.Right, 199);
        }
        return this.bpmnlintStatusItem;
    }
}
