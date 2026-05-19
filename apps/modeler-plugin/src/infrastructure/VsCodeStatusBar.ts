import { StatusBarAlignment, StatusBarItem, window } from "vscode";

import { Engine } from "@miragon/bpmn-modeler-shared";
const CHANGE_ENGINE_VERSION_CMD = "bpmn-modeler.changeEngineVersion";

export class VsCodeStatusBar {
    private templateStatusItem: StatusBarItem | undefined;

    private engineVersionStatusItem: StatusBarItem | undefined;

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
}
