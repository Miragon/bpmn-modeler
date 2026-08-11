import { StatusBarAlignment, StatusBarItem, ThemeColor, window } from "vscode";

import { Engine } from "@miragon/bpmn-modeler-shared";

import { StatusBarPort } from "@miragon/bpmn-modeler-core";
const CHANGE_ENGINE_VERSION_CMD = "bpmn-modeler.changeEngineVersion";

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
        const label = platform === "c7" ? "Camunda 7" : "Camunda 8";
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
        item.show();
    }

    showBpmnlintUnresolved(configPath: string, unresolved: string[]): void {
        const item = this.getOrCreateBpmnlintStatusItem();
        item.text = `$(warning) BPMNlint: ${unresolved.length} rule${unresolved.length === 1 ? "" : "s"} skipped`;
        // A warning background so a partly-applied config can't be mistaken for the
        // fully-green tick — the exact ambiguity this state exists to remove.
        item.backgroundColor = new ThemeColor("statusBarItem.warningBackground");
        item.tooltip = `${configPath}\n\nUnresolved (install the plugin providing these): ${unresolved.join(", ")}`;
        item.show();
    }

    showBpmnlintNoConfig(): void {
        const item = this.getOrCreateBpmnlintStatusItem();
        item.text = "$(info) BPMNlint: no .bpmnlintrc";
        item.tooltip = undefined;
        item.backgroundColor = undefined;
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
