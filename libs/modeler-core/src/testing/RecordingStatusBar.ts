import { Engine } from "@miragon/bpmn-modeler-types";

import { DeploymentFreshness } from "../deployment/domain/deploymentLedger";
import { StatusBarPort } from "../shared/domain/hostPorts";

export type ElementTemplatesStatus =
    | { readonly state: "hidden" }
    | { readonly state: "loading" }
    | { readonly state: "ready"; readonly count: number };

export type BpmnlintStatus =
    | { readonly state: "hidden" }
    | { readonly state: "active"; readonly configPath: string }
    | { readonly state: "unresolved"; readonly configPath: string; readonly unresolved: string[] }
    | { readonly state: "default"; readonly platform: Engine | undefined }
    | { readonly state: "disabled" }
    | { readonly state: "noConfig" };

export interface DeploymentTargetStatus {
    readonly name: string | undefined;
    readonly freshness: DeploymentFreshness;
    readonly deployedAt?: string;
    readonly verifiedAt?: string;
}

/** Holds what each status-bar item currently shows, as the real adapters do. */
export class RecordingStatusBar implements StatusBarPort {
    elementTemplates: ElementTemplatesStatus = { state: "hidden" };
    engineVersion: { platform: Engine; version: string } | undefined;
    engineVersionDisposed = false;
    bpmnlint: BpmnlintStatus = { state: "hidden" };
    deploymentTarget: DeploymentTargetStatus | undefined;

    showElementTemplatesLoading(): void {
        this.elementTemplates = { state: "loading" };
    }

    showElementTemplatesReady(count: number): void {
        this.elementTemplates = { state: "ready", count };
    }

    hideElementTemplatesStatus(): void {
        this.elementTemplates = { state: "hidden" };
    }

    showEngineVersion(platform: Engine, version: string): void {
        this.engineVersion = { platform, version };
    }

    hideEngineVersion(): void {
        this.engineVersion = undefined;
    }

    disposeEngineVersionStatus(): void {
        this.engineVersion = undefined;
        this.engineVersionDisposed = true;
    }

    showBpmnlintActive(configPath: string): void {
        this.bpmnlint = { state: "active", configPath };
    }

    showBpmnlintUnresolved(configPath: string, unresolved: string[]): void {
        this.bpmnlint = { state: "unresolved", configPath, unresolved };
    }

    showBpmnlintDefault(platform: Engine | undefined): void {
        this.bpmnlint = { state: "default", platform };
    }

    showBpmnlintDisabled(): void {
        this.bpmnlint = { state: "disabled" };
    }

    showBpmnlintNoConfig(): void {
        this.bpmnlint = { state: "noConfig" };
    }

    hideBpmnlintStatus(): void {
        this.bpmnlint = { state: "hidden" };
    }

    showDeploymentTarget(
        name: string | undefined,
        freshness: DeploymentFreshness,
        deployedAt?: string,
        verifiedAt?: string,
    ): void {
        this.deploymentTarget = { name, freshness, deployedAt, verifiedAt };
    }

    hideDeploymentTarget(): void {
        this.deploymentTarget = undefined;
    }
}
