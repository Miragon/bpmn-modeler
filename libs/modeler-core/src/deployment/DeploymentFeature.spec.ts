import { afterEach, describe, expect, it, vi } from "vitest";

import { DeploymentTargetsQuery, FormDefaultsQuery, Query } from "@miragon/bpmn-modeler-shared";

import { ArtifactService } from "../shared/service/ArtifactService";
import { createTestHost, PickerAnswers } from "../testing";
import { DeploymentFeature } from "./DeploymentFeature";
import { CredentialRefs } from "./domain/credentialRefs";
import { DeploymentTarget, serializeDeploymentTargets } from "./domain/deploymentTarget";
import { HttpClient, HttpResponse } from "./domain/ports";
import { DeploymentTargetService } from "./service/DeploymentTargetService";

const TARGETS_FILE = "/ws/.camunda/deployment-targets.json";
const ORDER_PROCESS = "/ws/src/order-process.bpmn";

const target = (name: string): DeploymentTarget =>
    new DeploymentTarget(name, "c7", "http://localhost:8080/engine-rest", "", "none", "", "");

class RecordingEngineHttp implements HttpClient {
    readonly deployments: { url: string; headers: Record<string, string> }[] = [];

    async postMultipart(
        url: string,
        _body: Buffer,
        _boundary: string,
        headers: Record<string, string> = {},
    ): Promise<HttpResponse> {
        this.deployments.push({ url, headers });
        return { status: 200, body: JSON.stringify({ id: "dep-1" }) };
    }

    getText(): Promise<HttpResponse> {
        throw new Error("unexpected request");
    }

    getJson(): Promise<HttpResponse> {
        throw new Error("unexpected request");
    }

    postJson(): Promise<HttpResponse> {
        throw new Error("unexpected request");
    }

    postForm(): Promise<HttpResponse> {
        throw new Error("unexpected request");
    }
}

function createFeature(
    answers: PickerAnswers = {},
    targets: DeploymentTarget[] = [target("dev"), target("prod")],
    extraFiles: Record<string, string> = {},
    http?: HttpClient,
) {
    const host = createTestHost({
        folders: ["/ws"],
        files: { [TARGETS_FILE]: serializeDeploymentTargets(targets), ...extraFiles },
        answers,
    });
    const feature = new DeploymentFeature({
        store: host.store,
        documents: host.documents,
        workspace: host.workspace,
        settings: host.settings,
        notifier: host.notifier,
        picker: host.picker,
        statusBar: host.statusBar,
        artifacts: new ArtifactService(host.workspace, host.settings),
        secrets: host.secrets,
        state: host.deploymentState,
        http,
    });
    return { host, feature };
}

function attach(feature: DeploymentFeature, visible: boolean) {
    const posted: Query[] = [];
    const panel = feature.attachPanel((message) => posted.push(message), visible);
    return { panel, posted };
}

function formDefaultsIn(posted: Query[]): FormDefaultsQuery[] {
    return posted.filter((query) => query instanceof FormDefaultsQuery);
}

function targetListsIn(posted: Query[]): DeploymentTargetsQuery[] {
    return posted.filter((query) => query instanceof DeploymentTargetsQuery);
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
    vi.restoreAllMocks();
});

describe("DeploymentFeature.attachPanel", () => {
    it("sends form defaults when shown and follows the active editor only while visible", () => {
        const { host, feature } = createFeature();
        host.openEditor(ORDER_PROCESS);
        const { panel, posted } = attach(feature, false);

        host.openEditor("/ws/src/hidden-switch.bpmn");
        expect(formDefaultsIn(posted)).toEqual([]);

        panel.setVisible(true);
        host.openEditor("/ws/src/invoice.bpmn");
        panel.setVisible(false);
        host.openEditor("/ws/src/after-hide.bpmn");

        expect(formDefaultsIn(posted).map((query) => query.defaults.deploymentName)).toEqual([
            "hidden-switch",
            "invoice",
        ]);
    });

    it("receives nothing more once disposed", async () => {
        const { host, feature } = createFeature({ deploymentTarget: "prod" });
        host.openEditor(ORDER_PROCESS);
        const { panel, posted } = attach(feature, true);
        await settle();
        posted.length = 0;

        panel.dispose();
        host.openEditor("/ws/src/invoice.bpmn");
        await feature.switchTarget();
        await settle();

        expect(posted).toEqual([]);
    });
});

describe("DeploymentFeature target commands", () => {
    it("switches the target, refreshes the status bar and pushes the targets into the panel", async () => {
        const { host, feature } = createFeature({ deploymentTarget: "prod" });
        host.openEditor(ORDER_PROCESS);
        const { posted } = attach(feature, false);

        await feature.switchTarget();

        expect(host.deploymentState.activeTargetName).toBe("prod");
        expect(host.statusBar.deploymentTarget?.name).toBe("prod");
        expect(targetListsIn(posted)).toEqual([
            expect.objectContaining({ activeTargetName: "prod", documentDir: "/ws/src" }),
        ]);
    });

    it("switches the target with no panel attached", async () => {
        const { host, feature } = createFeature({ deploymentTarget: "prod" });
        host.openEditor(ORDER_PROCESS);

        await feature.switchTarget();

        expect(host.deploymentState.activeTargetName).toBe("prod");
        expect(host.notifier.errors).toEqual([]);
    });

    it("pushes the targets only into the newest panel when an older one is disposed", async () => {
        const { host, feature } = createFeature({ deploymentTarget: "prod" });
        host.openEditor(ORDER_PROCESS);
        const older = attach(feature, false);
        const newer = attach(feature, false);
        older.panel.dispose();

        await feature.switchTarget();

        expect(targetListsIn(older.posted)).toEqual([]);
        expect(targetListsIn(newer.posted)).toHaveLength(1);
    });
});

describe("DeploymentFeature.statusMenu", () => {
    it("runs the target switch for the switch action", async () => {
        const { host, feature } = createFeature({
            deploymentStatusAction: "switch",
            deploymentTarget: "prod",
        });
        host.openEditor(ORDER_PROCESS);

        await feature.statusMenu();

        expect(host.deploymentState.activeTargetName).toBe("prod");
        expect(host.notifier.infos).toEqual([]);
    });

    it("runs the verification for the verify action", async () => {
        const { host, feature } = createFeature({ deploymentStatusAction: "verify" });
        host.openEditor(ORDER_PROCESS);

        await feature.statusMenu();

        expect(host.notifier.infos).toEqual(["Select a named Camunda 7 target to verify against."]);
        expect(host.picker.prompts.map((prompt) => prompt.method)).toEqual([
            "pickDeploymentStatusAction",
        ]);
    });

    it("does nothing when the menu is dismissed", async () => {
        const { host, feature } = createFeature();
        host.openEditor(ORDER_PROCESS);

        await feature.statusMenu();

        expect(host.picker.prompts.map((prompt) => prompt.method)).toEqual([
            "pickDeploymentStatusAction",
        ]);
        expect(host.deploymentState.activeTargetName).toBe("");
        expect(host.notifier.infos).toEqual([]);
    });
});

describe("DeploymentFeature command failures", () => {
    it("reports a failing command through the notifier instead of rejecting", async () => {
        vi.spyOn(DeploymentTargetService.prototype, "switchActiveTarget").mockRejectedValue(
            new Error("targets file is locked"),
        );
        const { host, feature } = createFeature();
        host.openEditor(ORDER_PROCESS);

        await expect(feature.switchTarget()).resolves.toBeUndefined();

        expect(host.notifier.errors).toEqual(["Deployment command failed\ntargets file is locked"]);
    });
});

describe("DeploymentFeature.activeDocumentDir", () => {
    it("is the active editor's directory", () => {
        const { host, feature } = createFeature();
        host.openEditor(ORDER_PROCESS);

        expect(feature.activeDocumentDir()).toBe("/ws/src");
    });

    it("is undefined with no editor open, and commands still run", async () => {
        const { host, feature } = createFeature({ deploymentTarget: "prod" });

        expect(feature.activeDocumentDir()).toBeUndefined();

        await feature.switchTarget();

        expect(host.picker.prompts).toEqual([
            { method: "pickDeploymentTarget", args: [["dev", "prod"]] },
        ]);
        expect(host.deploymentState.activeTargetName).toBe("prod");
        expect(host.notifier.errors).toEqual([]);
    });
});

describe("DeploymentFeature with .env references", () => {
    const ENGINE_ORIGIN = "https://engine.example";
    const referencingTarget = new DeploymentTarget(
        "dev",
        "c7",
        "${env:MIRAGON_ENGINE_URL}",
        "",
        "basic",
        "",
        "",
        undefined,
        undefined,
        CredentialRefs.basic("${env:MIRAGON_USER}", "${env:MIRAGON_PASSWORD}"),
    );
    const dotEnv = [
        `MIRAGON_ENGINE_URL=${ENGINE_ORIGIN}/engine-rest`,
        "MIRAGON_USER=deployer",
        "MIRAGON_PASSWORD=s3cret",
    ].join("\n");

    function createReferencingFeature(confirmDestructive: boolean) {
        const http = new RecordingEngineHttp();
        const { host, feature } = createFeature(
            { workspaceFiles: [ORDER_PROCESS], confirmDestructive },
            [referencingTarget],
            { "/ws/.env": dotEnv, [ORDER_PROCESS]: "<bpmn:definitions/>" },
            http,
        );
        host.deploymentState.activeTargetName = "dev";
        host.openEditor(ORDER_PROCESS);
        return { host, feature, http };
    }

    it("deploys with the resolved values once the user approves the host, and remembers it", async () => {
        const { host, feature, http } = createReferencingFeature(true);

        await feature.deployFiles();
        await feature.deployFiles();

        expect(http.deployments.map(({ url }) => url)).toEqual([
            `${ENGINE_ORIGIN}/engine-rest/deployment/create`,
            `${ENGINE_ORIGIN}/engine-rest/deployment/create`,
        ]);
        expect(http.deployments[0].headers.Authorization).toBe(
            `Basic ${Buffer.from("deployer:s3cret").toString("base64")}`,
        );
        expect(
            host.picker.prompts.filter(({ method }) => method === "confirmDestructive"),
        ).toHaveLength(1);
        await expect(host.secrets.getApprovedDestinations(`${TARGETS_FILE}::dev`)).resolves.toEqual(
            [ENGINE_ORIGIN],
        );
        expect(host.notifier.transcript()).not.toContain("s3cret");
    });

    it("sends nothing when the user declines the host", async () => {
        const { host, feature, http } = createReferencingFeature(false);

        await feature.deployFiles();

        expect(http.deployments).toEqual([]);
        await expect(host.secrets.getApprovedDestinations(`${TARGETS_FILE}::dev`)).resolves.toEqual(
            [],
        );
        expect(host.notifier.transcript()).not.toContain("s3cret");
    });
});
