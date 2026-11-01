import { afterEach, describe, expect, it, vi } from "vitest";

import {
    AuthConfigPayload,
    CreateTargetCommand,
    DeleteTargetCommand,
    DeployCommand,
    DeploymentResultQuery,
    DeploymentTargetsQuery,
    DocumentFlushedCommand,
    FlushDocumentQuery,
    FormDefaultsQuery,
    Query,
    SaveTargetCommand,
    SelectTargetCommand,
    StartInstanceCommand,
    StartInstanceResultQuery,
    TargetSavedQuery,
} from "@miragon/bpmn-modeler-shared";

import { UserCancelledError } from "../kernel/domain/errors";
import { ArtifactService } from "../kernel/service/ArtifactService";
import { DocumentFlushService } from "../editorSession/service/DocumentFlushService";
import { PendingEditsFlush } from "../editorSession/service/PendingEditsFlush";
import { createTestHost, PromptAnswers, RecordingNotifier } from "../testing";
import { DeploymentFeature } from "./DeploymentFeature";
import { CredentialRefs } from "./domain/credentialRefs";
import {
    contentFingerprint,
    DeployedRevision,
    DeploymentTargetIdentity,
    ledgerKeyFor,
} from "./domain/deploymentLedger";
import { deploymentStatusActionPrompt, deploymentTargetPrompt } from "./domain/deploymentPrompts";
import { DeploymentTarget, serializeDeploymentTargets } from "./domain/deploymentTarget";
import { NO_ENV_VARIABLES } from "./domain/envRef";
import { HttpClient, HttpResponse } from "../kernel/domain/http";
import { DeploymentTargetService, toTargetPayload } from "./service/DeploymentTargetService";

const TARGETS_FILE = "/ws/.camunda/deployment-targets.json";
const ORDER_PROCESS = "/ws/src/order-process.bpmn";
const INVOICE_PROCESS = "/ws/src/invoice.bpmn";

const target = (name: string): DeploymentTarget =>
    new DeploymentTarget(name, "c7", "http://localhost:8080/engine-rest", "", "none", "", "");

class RecordingEngineHttp implements HttpClient {
    readonly deployments: { url: string; headers: Record<string, string>; body: string }[] = [];
    readonly instanceStarts: string[] = [];

    async postMultipart(
        url: string,
        body: Buffer,
        _boundary: string,
        headers: Record<string, string> = {},
    ): Promise<HttpResponse> {
        this.deployments.push({ url, headers, body: body.toString("utf8") });
        return { status: 200, body: JSON.stringify({ id: "dep-1" }) };
    }

    getText(): Promise<HttpResponse> {
        throw new Error("unexpected request");
    }

    getJson(): Promise<HttpResponse> {
        throw new Error("unexpected request");
    }

    async postJson(url: string): Promise<HttpResponse> {
        this.instanceStarts.push(url);
        return { status: 200, body: JSON.stringify({ id: "instance-1" }) };
    }

    postForm(): Promise<HttpResponse> {
        throw new Error("unexpected request");
    }
}

class EngineWithoutDefinitions extends RecordingEngineHttp {
    override async getJson(): Promise<HttpResponse> {
        return { status: 404, body: "" };
    }
}

function createFeature(
    promptAnswers: PromptAnswers = {},
    targets: DeploymentTarget[] = [target("dev"), target("prod")],
    extraFiles: Record<string, string> = {},
    http?: HttpClient,
) {
    const host = createTestHost({
        folders: ["/ws"],
        files: { [TARGETS_FILE]: serializeDeploymentTargets(targets), ...extraFiles },
        promptAnswers,
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
        pendingEdits: new PendingEditsFlush(
            host.store,
            new DocumentFlushService(host.store, host.notifier),
            host.notifier,
        ),
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

        host.openEditor("/ws/src/hidden-switch.bpmn", "", { focused: true });
        expect(formDefaultsIn(posted)).toEqual([]);

        panel.setVisible(true);
        host.openEditor("/ws/src/invoice.bpmn", "", { focused: true });
        panel.setVisible(false);
        host.openEditor("/ws/src/after-hide.bpmn", "", { focused: true });

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
        host.openEditor("/ws/src/invoice.bpmn", "", { focused: true });
        await feature.switchTarget();
        await settle();

        expect(posted).toEqual([]);
    });
});

describe("DeploymentFeature target commands", () => {
    it("switches the target, refreshes the status bar and pushes the targets into the panel", async () => {
        const { host, feature } = createFeature({ deploymentTarget: "prod" });
        await host.openSession(ORDER_PROCESS, [feature.statusParticipant]);
        const { posted } = attach(feature, false);

        await feature.switchTarget();

        expect(host.deploymentState.load().activeTargetName).toBe("prod");
        expect(host.statusBar.views.deploymentTarget?.text).toBe("prod");
        expect(targetListsIn(posted)).toEqual([
            expect.objectContaining({ activeTargetName: "prod", documentDir: "/ws/src" }),
        ]);
    });

    it("switches the target with no panel attached", async () => {
        const { host, feature } = createFeature({ deploymentTarget: "prod" });
        host.openEditor(ORDER_PROCESS);

        await feature.switchTarget();

        expect(host.deploymentState.load().activeTargetName).toBe("prod");
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

describe("DeploymentFeature panel target commands", () => {
    const noAuth: AuthConfigPayload = { authType: "none" };

    it.each([
        {
            result: "create",
            command: new CreateTargetCommand(toTargetPayload(target("staging")), noAuth),
            refreshedNames: ["dev", "prod", "staging"],
        },
        {
            result: "save",
            command: new SaveTargetCommand(toTargetPayload(target("staging")), noAuth, "dev"),
            refreshedNames: ["prod", "staging"],
        },
        {
            result: "delete",
            command: new DeleteTargetCommand("dev"),
            refreshedNames: ["prod"],
        },
    ])(
        "posts the $result result before the refreshed target list",
        async ({ command, refreshedNames }) => {
            const { host, feature } = createFeature({ deleteTarget: true });
            host.openEditor(ORDER_PROCESS);
            const { panel, posted } = attach(feature, false);

            await panel.handle(command);

            // The deployment form ends its reload lock on the first list after a successful result.
            expect(
                posted.filter(
                    (query) =>
                        query instanceof TargetSavedQuery ||
                        query instanceof DeploymentTargetsQuery,
                ),
            ).toEqual([
                expect.objectContaining({ type: "TargetSavedQuery", success: true }),
                expect.objectContaining({
                    type: "DeploymentTargetsQuery",
                    targets: refreshedNames.map((name) => expect.objectContaining({ name })),
                }),
            ]);
        },
    );

    const ledgerKeyOf = (name: string) =>
        ledgerKeyFor(
            DeploymentTargetIdentity.fromTarget(target(name), NO_ENV_VARIABLES),
            ORDER_PROCESS,
        );

    it.each([
        {
            behaviour: "drops the ledger rows of a target renamed in the panel",
            command: new SaveTargetCommand(toTargetPayload(target("staging")), noAuth, "dev"),
            keptRows: ["prod"],
        },
        {
            behaviour: "drops the ledger rows of a target deleted in the panel",
            command: new DeleteTargetCommand("dev"),
            keptRows: ["prod"],
        },
        {
            behaviour: "keeps the ledger rows of a target saved under its name",
            command: new SaveTargetCommand(toTargetPayload(target("dev")), noAuth, "dev"),
            keptRows: ["dev", "prod"],
        },
    ])("$behaviour", async ({ command, keptRows }) => {
        const { host, feature } = createFeature({ deleteTarget: true });
        host.openEditor(ORDER_PROCESS);
        host.deploymentState.seed({
            ledger: Object.fromEntries(
                ["dev", "prod"].map((name) => [
                    ledgerKeyOf(name),
                    { fingerprint: "f", deployedAt: "2026-01-01T00:00:00.000Z" },
                ]),
            ),
        });
        const { panel } = attach(feature, false);

        await panel.handle(command);

        expect(Object.keys(host.deploymentState.load().ledger)).toEqual(keptRows.map(ledgerKeyOf));
    });

    it("a ledger prune failure after a successful save still reports the target as saved", async () => {
        const { host, feature } = createFeature();
        host.openEditor(ORDER_PROCESS);
        host.deploymentState.seed({
            ledger: {
                [ledgerKeyOf("dev")]: {
                    fingerprint: "f",
                    deployedAt: "2026-01-01T00:00:00.000Z",
                },
            },
        });
        host.deploymentState.failSaves(
            (patch) => patch.ledger?.remove !== undefined,
            new Error("workspace state is read-only"),
        );
        const { panel, posted } = attach(feature, false);

        await panel.handle(
            new SaveTargetCommand(toTargetPayload(target("staging")), noAuth, "dev"),
        );

        expect(
            posted.filter(
                (query) =>
                    query instanceof TargetSavedQuery || query instanceof DeploymentTargetsQuery,
            ),
        ).toEqual([
            expect.objectContaining({
                type: "TargetSavedQuery",
                success: true,
                message: 'Saved deployment target "staging".',
            }),
            expect.objectContaining({
                type: "DeploymentTargetsQuery",
                activeTargetName: "staging",
            }),
        ]);
        expect(host.notifier.loggedErrors.map((error) => error.message)).toEqual([
            "workspace state is read-only",
        ]);
    });

    it("pushes the renamed list after the failure when saving the active target name fails, so the form no longer edits the old name", async () => {
        const { host, feature } = createFeature();
        host.openEditor(ORDER_PROCESS);
        host.deploymentState.seed({ activeTargetName: "dev" });
        host.deploymentState.failSaves(
            (patch) => patch.activeTargetName !== undefined,
            new Error("deployment state is read-only"),
        );
        const { panel, posted } = attach(feature, false);

        await panel.handle(
            new SaveTargetCommand(toTargetPayload(target("staging")), noAuth, "dev"),
        );

        expect(
            posted.filter(
                (query) =>
                    query instanceof TargetSavedQuery || query instanceof DeploymentTargetsQuery,
            ),
        ).toEqual([
            expect.objectContaining({
                type: "TargetSavedQuery",
                success: false,
                message: "deployment state is read-only",
            }),
            expect.objectContaining({
                type: "DeploymentTargetsQuery",
                targets: [
                    expect.objectContaining({ name: "prod" }),
                    expect.objectContaining({ name: "staging" }),
                ],
                activeTargetName: "",
            }),
        ]);
    });

    it("selecting a target in the panel pushes the target list once", async () => {
        const { host, feature } = createFeature();
        await host.openSession(ORDER_PROCESS, [feature.statusParticipant]);
        const { panel, posted } = attach(feature, true);
        await settle();
        posted.length = 0;

        await panel.handle(new SelectTargetCommand("prod"));
        await settle();

        expect(targetListsIn(posted)).toEqual([
            expect.objectContaining({ activeTargetName: "prod", documentDir: "/ws/src" }),
        ]);
        expect(host.statusBar.views.deploymentTarget?.text).toBe("prod");
    });
});

describe("DeploymentFeature target picker before a deploy", () => {
    it.each([
        { command: "Deploy Diagram", run: (feature: DeploymentFeature) => feature.deployActive() },
        { command: "Deploy Files", run: (feature: DeploymentFeature) => feature.deployFiles() },
    ])("$command shows the picked target in the open panel, then deploys", async ({ run }) => {
        const orderXml = '<bpmn:process id="order-process"/>';
        const timeline: string[] = [];
        const http = new RecordingEngineHttp();
        const postMultipart = http.postMultipart.bind(http);
        vi.spyOn(http, "postMultipart").mockImplementation((...request) => {
            timeline.push("deploy");
            return postMultipart(...request);
        });
        const { host, feature } = createFeature(
            { deploymentTarget: "dev", deployableFiles: [ORDER_PROCESS] },
            [target("dev")],
            { [ORDER_PROCESS]: orderXml },
            http,
        );
        await host.openSession(ORDER_PROCESS, [feature.statusParticipant], { content: orderXml });
        feature.attachPanel((message) => {
            if (message instanceof DeploymentTargetsQuery) {
                timeline.push(`panel shows "${message.activeTargetName}"`);
            }
        }, false);

        await run(feature);

        expect(timeline).toEqual(['panel shows "dev"', "deploy"]);
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

        expect(host.deploymentState.load().activeTargetName).toBe("prod");
        expect(host.notifier.infos).toEqual([]);
    });

    it("runs the verification for the verify action", async () => {
        const { host, feature } = createFeature(
            { deploymentStatusAction: "verify" },
            [target("dev")],
            {},
            new EngineWithoutDefinitions(),
        );
        host.deploymentState.seed({ activeTargetName: "dev" });
        host.openEditor(ORDER_PROCESS, '<bpmn:process id="order-process"/>');

        await feature.statusMenu();

        expect(host.picker.prompts).toEqual([
            { method: "choose", args: [deploymentStatusActionPrompt(target("dev"))] },
        ]);
        expect(host.notifier.infos).toEqual(["Process 'order-process' is not deployed on dev."]);
    });

    it("does nothing when the menu is dismissed", async () => {
        const { host, feature } = createFeature();
        host.openEditor(ORDER_PROCESS);

        await feature.statusMenu();

        expect(host.picker.prompts).toEqual([
            { method: "choose", args: [deploymentStatusActionPrompt(undefined)] },
        ]);
        expect(host.deploymentState.load().activeTargetName).toBe("");
        expect(host.notifier.infos).toEqual([]);
    });

    it("names the form values the status item shows after an ad-hoc deploy", async () => {
        const { host, feature } = createFeature();
        host.deploymentState.seed({
            activeTargetName: "",
            endpoint: "http://localhost:8080/engine-rest",
        });
        await host.openSession(ORDER_PROCESS, [feature.statusParticipant]);
        await settle();
        expect(host.statusBar.views.deploymentTarget?.text).toBe("Form values");

        await feature.statusMenu();

        expect(host.picker.prompts).toEqual([
            {
                method: "choose",
                args: [expect.objectContaining({ placeholder: "Deployment with the form values" })],
            },
        ]);
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

    const basicTarget = new DeploymentTarget(
        "dev",
        "c7",
        "http://localhost:8080/engine-rest",
        "",
        "basic",
        "",
        "",
    );
    const orderXml = '<bpmn:process id="order-process"/>';

    /** The order process, focused, with an active basic-auth target; Deploy Files picks two files. */
    async function focusOnABasicAuthTarget() {
        const http = new RecordingEngineHttp();
        const { host, feature } = createFeature(
            { deployableFiles: [ORDER_PROCESS, INVOICE_PROCESS] },
            [basicTarget],
            { [ORDER_PROCESS]: orderXml, [INVOICE_PROCESS]: '<bpmn:process id="invoice"/>' },
            http,
        );
        host.deploymentState.seed({ activeTargetName: "dev" });
        await host.openSession(ORDER_PROCESS, [], { content: orderXml });
        return { host, feature, http };
    }

    async function focusWhileTheSecretStoreRejects(rejection: Error) {
        const focused = await focusOnABasicAuthTarget();
        vi.spyOn(focused.host.secrets, "getBasicAuth").mockRejectedValue(rejection);
        return focused;
    }

    /** The credentials are stored, but the user cancels the keychain read of the approved hosts. */
    async function focusWhileTheApprovalReadIsCancelled() {
        const focused = await focusOnABasicAuthTarget();
        await focused.host.secrets.saveBasicAuth("deployer", "s3cret", `${TARGETS_FILE}::dev`);
        const approvalReads = vi
            .spyOn(focused.host.secrets, "getApprovedDestinations")
            .mockRejectedValue(new UserCancelledError());
        return { ...focused, approvalReads };
    }

    function expectNothingReported(notifier: RecordingNotifier): void {
        expect(notifier.infos).toEqual([]);
        expect(notifier.errors).toEqual([]);
        expect(notifier.logged("warning")).toEqual([]);
        expect(notifier.logged("error")).toEqual([]);
    }

    it("reports a secret store that cannot be read and sends nothing to the engine", async () => {
        const { host, feature, http } = await focusWhileTheSecretStoreRejects(
            new Error("The OS keyring is not available."),
        );

        await expect(feature.deployFiles()).resolves.toBeUndefined();

        expect(http.deployments).toEqual([]);
        expect(host.notifier.errors).toEqual([
            "Deployment command failed\nThe OS keyring is not available.",
        ]);
    });

    it.each([
        { command: "Deploy Files", run: (feature: DeploymentFeature) => feature.deployFiles() },
        { command: "Deploy Diagram", run: (feature: DeploymentFeature) => feature.deployActive() },
        { command: "Verify Deployment", run: (feature: DeploymentFeature) => feature.verify() },
    ])("does not report a cancelled prompt in $command as a failure", async ({ run }) => {
        const { host, feature, http } = await focusWhileTheSecretStoreRejects(
            new UserCancelledError(),
        );

        await expect(run(feature)).resolves.toBeUndefined();

        expect(http.deployments).toEqual([]);
        expect(host.notifier.transcript()).toBe("");
    });

    /** No active target yet: the picker answers "dev", then the keychain read for it rejects. */
    async function pickABasicAuthTargetWhileTheSecretStoreRejects(rejection: Error) {
        const http = new RecordingEngineHttp();
        const { host, feature } = createFeature(
            { deploymentTarget: "dev" },
            [basicTarget],
            { [ORDER_PROCESS]: orderXml },
            http,
        );
        await host.openSession(ORDER_PROCESS, [feature.statusParticipant], { content: orderXml });
        vi.spyOn(host.secrets, "getBasicAuth").mockRejectedValue(rejection);
        const { posted } = attach(feature, true);
        return { host, feature, http, posted };
    }

    it.each([
        { failure: "the user cancels the keychain prompt", rejection: new UserCancelledError() },
        {
            failure: "the secret store cannot be read",
            rejection: new Error("The OS keyring is not available."),
        },
    ])(
        "shows the target Deploy Diagram picked in the open panel when $failure afterwards",
        async ({ rejection }) => {
            const { host, feature, http, posted } =
                await pickABasicAuthTargetWhileTheSecretStoreRejects(rejection);

            await feature.deployActive();

            expect(http.deployments).toEqual([]);
            expect(targetListsIn(posted).at(-1)).toEqual(
                expect.objectContaining({ activeTargetName: "dev", documentDir: "/ws/src" }),
            );
            expect(host.statusBar.views.deploymentTarget?.text).toBe("dev");
        },
    );

    it.each([
        { command: "Deploy Files", run: (feature: DeploymentFeature) => feature.deployFiles() },
        { command: "Deploy Diagram", run: (feature: DeploymentFeature) => feature.deployActive() },
    ])(
        "ends $command quietly when the user cancels the keychain read of the approved hosts",
        async ({ run }) => {
            const { host, feature, http, approvalReads } =
                await focusWhileTheApprovalReadIsCancelled();

            await expect(run(feature)).resolves.toBeUndefined();

            expect(approvalReads).toHaveBeenCalledOnce();
            expect(http.deployments).toEqual([]);
            expectNothingReported(host.notifier);
        },
    );

    const storedBasicAuth = {
        authType: "basic" as const,
        username: "deployer",
        password: "s3cret",
    };

    it.each([
        {
            command: "the panel's Deploy",
            message: new DeployCommand({
                deploymentName: "order-process",
                tenantId: "",
                endpoint: "http://localhost:8080/engine-rest",
                engine: "c7",
                mainFilePath: ORDER_PROCESS,
                additionalFilePaths: [],
                auth: storedBasicAuth,
                targetName: "dev",
            }),
            reply: DeploymentResultQuery,
        },
        {
            command: "the panel's Start Instance",
            message: new StartInstanceCommand({
                processDefinitionKey: "order-process",
                endpoint: "http://localhost:8080/engine-rest",
                engine: "c7",
                auth: storedBasicAuth,
                payloadFilePath: "",
                targetName: "dev",
            }),
            reply: StartInstanceResultQuery,
        },
    ])(
        "ends $command quietly when the user cancels the keychain read of the approved hosts, and frees the form",
        async ({ message, reply }) => {
            const { host, feature, http, approvalReads } =
                await focusWhileTheApprovalReadIsCancelled();
            const { panel, posted } = attach(feature, false);

            await panel.handle(message);

            expect(approvalReads).toHaveBeenCalledOnce();
            expect(http.deployments).toEqual([]);
            expect(http.instanceStarts).toEqual([]);
            expect(posted.filter((query) => query instanceof reply)).toEqual([
                expect.objectContaining({ success: false, cancelled: true }),
            ]);
            expectNothingReported(host.notifier);
        },
    );
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
            { method: "choose", args: [deploymentTargetPrompt(["dev", "prod"])] },
        ]);
        expect(host.deploymentState.load().activeTargetName).toBe("prod");
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

    function createReferencingFeature(approvesHost: boolean) {
        const http = new RecordingEngineHttp();
        const { host, feature } = createFeature(
            { deployableFiles: [ORDER_PROCESS], credentialApproval: approvesHost },
            [referencingTarget],
            { "/ws/.env": dotEnv, [ORDER_PROCESS]: "<bpmn:definitions/>" },
            http,
        );
        host.deploymentState.seed({ activeTargetName: "dev" });
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
        expect(host.picker.prompts.filter(({ method }) => method === "confirm")).toHaveLength(1);
        await expect(host.secrets.getApprovedDestinations(`${TARGETS_FILE}::dev`)).resolves.toEqual(
            [ENGINE_ORIGIN],
        );
        expect(host.notifier.transcript()).not.toContain("s3cret");
    });

    it("drops the rows an endpoint-ref target recorded under its resolved host when the panel renames it", async () => {
        const { host, feature } = createReferencingFeature(true);
        const resolvedRow = ledgerKeyFor(
            DeploymentTargetIdentity.fromTarget(referencingTarget, (name) =>
                name === "MIRAGON_ENGINE_URL" ? `${ENGINE_ORIGIN}/engine-rest` : undefined,
            ),
            ORDER_PROCESS,
        );
        host.deploymentState.seed({
            ledger: {
                [resolvedRow]: { fingerprint: "f", deployedAt: "2026-01-01T00:00:00.000Z" },
            },
        });
        const { panel } = attach(feature, false);

        await panel.handle(
            new SaveTargetCommand(
                { ...toTargetPayload(referencingTarget), name: "staging" },
                {
                    authType: "basic",
                    username: "${env:MIRAGON_USER}",
                    password: "${env:MIRAGON_PASSWORD}",
                },
                "dev",
            ),
        );

        expect(host.deploymentState.load().activeTargetName).toBe("staging");
        expect(Object.keys(host.deploymentState.load().ledger)).toEqual([]);
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

describe("DeploymentFeature sidebar deploy of an edited diagram", () => {
    const SAVED_XML = '<bpmn:definitions id="saved"/>';
    const UNSAVED_XML = '<bpmn:definitions id="unsaved"/>';
    const WEBVIEW_XML = '<bpmn:definitions id="webview"/>';

    /**
     * Disk holds the saved diagram, the editor buffer an unsaved edit, and the
     * webview a later edit its sync debounce has not delivered yet. The editor's
     * save writes the buffer to disk, as both hosts' saves do.
     */
    async function createEditedDiagram() {
        const http = new RecordingEngineHttp();
        const host = createTestHost({
            folders: ["/ws"],
            files: {
                [TARGETS_FILE]: serializeDeploymentTargets([target("dev")]),
                [ORDER_PROCESS]: SAVED_XML,
            },
        });
        host.deploymentState.seed({ activeTargetName: "dev" });
        const flushes = new DocumentFlushService(host.store, host.notifier);
        const pendingEdits = new PendingEditsFlush(host.store, flushes, host.notifier);
        pendingEdits.serve(".bpmn", {
            sync: (editorId, content) => host.documents.write(editorId, content),
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
            pendingEdits,
            http,
        });
        // Focused: VS Code keeps the panel active while the deployment sidebar has focus.
        const editor = await host.openSession(ORDER_PROCESS, [feature.statusParticipant], {
            content: UNSAVED_XML,
        });
        vi.spyOn(editor, "save").mockImplementation(async () => {
            editor.saveCount++;
            await host.workspace.writeFile(ORDER_PROCESS, editor.content);
            return true;
        });
        const deliver = editor.postMessage.bind(editor);
        editor.postMessage = async (message) => {
            const delivered = await deliver(message);
            if (message instanceof FlushDocumentQuery) {
                queueMicrotask(() =>
                    flushes.handleReply(
                        new DocumentFlushedCommand(message.token, WEBVIEW_XML),
                        editor.id,
                    ),
                );
            }
            return delivered;
        };

        const { panel, posted } = attach(feature, false);
        return { host, http, editor, panel, posted };
    }

    const deployFromSidebar = ({ panel }: Awaited<ReturnType<typeof createEditedDiagram>>) =>
        panel.handle(
            new DeployCommand({
                deploymentName: "order-process",
                tenantId: "",
                endpoint: "http://localhost:8080/engine-rest",
                engine: "c7",
                mainFilePath: ORDER_PROCESS,
                additionalFilePaths: [],
                auth: { authType: "none" },
                targetName: "dev",
            }),
        );

    it("deploys what the webview shows and saves it first", async () => {
        const edited = await createEditedDiagram();

        await deployFromSidebar(edited);

        expect(edited.posted.filter((query) => query instanceof DeploymentResultQuery)).toEqual([
            expect.objectContaining({ success: true }),
        ]);
        expect(edited.http.deployments).toHaveLength(1);
        expect(edited.http.deployments[0].body).toContain(WEBVIEW_XML);
        expect(edited.host.workspace.files.get(ORDER_PROCESS)).toBe(WEBVIEW_XML);
    });

    it("does not deploy when the save fails", async () => {
        const edited = await createEditedDiagram();
        vi.spyOn(edited.editor, "save").mockResolvedValue(false);

        await deployFromSidebar(edited);

        const message = "The diagram could not be saved, so it was not deployed.";
        expect(edited.posted.filter((query) => query instanceof DeploymentResultQuery)).toEqual([
            expect.objectContaining({ success: false, message }),
        ]);
        expect(edited.host.notifier.errors).toEqual([message]);
        expect(edited.http.deployments).toEqual([]);
    });

    it("shows the diagram as deployed right after the deploy", async () => {
        const edited = await createEditedDiagram();

        await deployFromSidebar(edited);

        expect(edited.host.statusBar.views.deploymentTarget).toEqual(
            expect.objectContaining({ text: "dev", tone: "success" }),
        );
    });
});

describe("DeploymentFeature status after a ledger write", () => {
    const ORDER_XML = '<bpmn:process id="order-process"/>';
    const LOCAL_ENGINE = "http://localhost:8080/engine-rest";
    const DEPLOYED_ORDER_XML: DeployedRevision = {
        fingerprint: contentFingerprint(ORDER_XML),
        deployedAt: "2026-10-20T09:00:00.000Z",
    };
    const devRow = ledgerKeyFor(
        DeploymentTargetIdentity.fromTarget(target("dev"), NO_ENV_VARIABLES),
        ORDER_PROCESS,
    );
    const localAdHocRow = ledgerKeyFor(
        DeploymentTargetIdentity.adHoc(LOCAL_ENGINE, "", NO_ENV_VARIABLES),
        ORDER_PROCESS,
    );

    interface FocusOptions {
        activeTargetName?: string;
        deployedRows?: string[];
        http?: HttpClient;
    }

    /** The order process, focused and saved as the editor shows it. */
    async function focusOrderProcess({
        activeTargetName = "dev",
        deployedRows = [],
        http = new RecordingEngineHttp(),
    }: FocusOptions = {}) {
        const { host, feature } = createFeature(
            { deployableFiles: [ORDER_PROCESS] },
            [target("dev")],
            { [ORDER_PROCESS]: ORDER_XML },
            http,
        );
        host.deploymentState.seed({
            activeTargetName,
            endpoint: LOCAL_ENGINE,
            ledger: Object.fromEntries(deployedRows.map((row) => [row, DEPLOYED_ORDER_XML])),
        });
        await host.openSession(ORDER_PROCESS, [feature.statusParticipant], { content: ORDER_XML });
        await settle();
        return { host, feature };
    }

    it("shows the diagram as deployed right after Deploy Diagram", async () => {
        const { host, feature } = await focusOrderProcess();

        await feature.deployActive();

        expect(host.statusBar.views.deploymentTarget).toEqual(
            expect.objectContaining({ text: "dev", tone: "success" }),
        );
    });

    it("shows the focused diagram as deployed right after Deploy Files deployed it", async () => {
        const { host, feature } = await focusOrderProcess();

        await feature.deployFiles();

        expect(host.statusBar.views.deploymentTarget).toEqual(
            expect.objectContaining({ text: "dev", tone: "success" }),
        );
    });

    it("shows the diagram as unknown once verification finds no definition on the engine", async () => {
        const { host, feature } = await focusOrderProcess({
            deployedRows: [devRow],
            http: new EngineWithoutDefinitions(),
        });
        expect(host.statusBar.views.deploymentTarget?.tone).toBe("success");

        await feature.verify();

        expect(devRow in host.deploymentState.load().ledger).toBe(false);
        expect(host.statusBar.views.deploymentTarget).toEqual(
            expect.objectContaining({ text: "dev", tone: "neutral" }),
        );
    });

    it("shows the saved connection after an ad-hoc deploy that could not record its ledger row", async () => {
        const stagingEngine = "http://staging.example.com/engine-rest";
        const { host, feature } = await focusOrderProcess({
            activeTargetName: "",
            deployedRows: [localAdHocRow],
        });
        expect(host.statusBar.views.deploymentTarget?.tone).toBe("success");
        host.deploymentState.failSaves(
            (patch) => patch.ledger?.put !== undefined,
            new Error("workspace state is read-only"),
        );
        const { panel } = attach(feature, false);

        await panel.handle(
            new DeployCommand({
                deploymentName: "order-process",
                tenantId: "",
                endpoint: stagingEngine,
                engine: "c7",
                mainFilePath: ORDER_PROCESS,
                additionalFilePaths: [],
                auth: { authType: "none" },
                targetName: "",
            }),
        );

        expect(host.deploymentState.load().endpoint).toBe(stagingEngine);
        expect(host.statusBar.views.deploymentTarget).toEqual(
            expect.objectContaining({ text: "Form values", tone: "neutral" }),
        );
    });

    it("labels a target name the targets file no longer holds as the form values it falls back to", async () => {
        const { host } = await focusOrderProcess({
            activeTargetName: "renamed-by-a-teammate",
            deployedRows: [localAdHocRow],
        });

        expect(host.statusBar.views.deploymentTarget).toEqual(
            expect.objectContaining({ text: "Form values", tone: "success" }),
        );
    });
});
