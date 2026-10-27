import { Engine } from "@miragon/bpmn-modeler-types";

import { DeploymentFreshness } from "../deployment/domain/deploymentLedger";
import { DeploymentStatusBarPort } from "../deployment/domain/ports";
import { StatusBarPort } from "../kernel/domain/hostPorts";
import { StatusSlot, StatusView } from "../kernel/domain/statusView";
import { BpmnlintIndicator } from "../modeler/bpmn/domain/bpmnlintIndicator";
import { BpmnlintStatusBarPort } from "../modeler/bpmn/domain/ports";

export type ElementTemplatesStatus =
    | { readonly state: "hidden" }
    | { readonly state: "loading" }
    | { readonly state: "ready"; readonly count: number };

export interface DeploymentTargetStatus {
    readonly name: string | undefined;
    readonly freshness: DeploymentFreshness;
    readonly deployedAt?: string;
    readonly verifiedAt?: string;
}

/** Holds what each status-bar item currently shows, as the real adapters do. */
export class RecordingStatusBar
    implements StatusBarPort, BpmnlintStatusBarPort, DeploymentStatusBarPort
{
    elementTemplates: ElementTemplatesStatus = { state: "hidden" };
    engineVersion: { platform: Engine; version: string } | undefined;
    bpmnlint: BpmnlintIndicator = { state: "hidden" };
    deploymentTarget: DeploymentTargetStatus | undefined;
    views: Partial<Record<StatusSlot, StatusView>> = {};

    show(_slot: StatusSlot, _view: StatusView): void {
        // Recorded once the port carries slots.
    }

    hide(_slot: StatusSlot): void {
        // Recorded once the port carries slots.
    }

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

    showBpmnlint(indicator: BpmnlintIndicator): void {
        this.bpmnlint = indicator;
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
