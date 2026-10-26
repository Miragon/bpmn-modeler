import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    CreateTargetCommand,
    DeleteTargetCommand,
    DeployCommand,
    HostApiImpl,
    MockHostApi,
    OpenTargetsFileCommand,
    RequestAdditionalFilesCommand,
    RequestFormDefaultsCommand,
    RequestPayloadFilesCommand,
    RequestProcessDefinitionKeyCommand,
    RequestStoredCredentialsCommand,
    SaveTargetCommand,
    SelectTargetCommand,
    StartInstanceCommand,
    type AuthConfigPayload,
    type Command,
    type DeploymentTargetPayload,
} from "@miragon/bpmn-modeler-shared";

import { getHostApi } from "./host";

type Reply = { type: string } & Record<string, unknown>;

const noAuth: AuthConfigPayload = { authType: "none" };
const target = (name: string): DeploymentTargetPayload => ({
    name,
    engine: "c7",
    endpoint: `https://${name}.test`,
    tenantId: "",
    authType: "none",
});

describe("getHostApi", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("serves the in-browser mock only to the development preview", () => {
        vi.stubEnv("NODE_ENV", "development");

        const host = getHostApi();

        expect(host).toBeInstanceOf(MockHostApi);
        expect(host).not.toBeInstanceOf(HostApiImpl);
    });

    it("talks to the embedding host in every other build", () => {
        vi.stubEnv("NODE_ENV", "production");
        const vsCodeApi = { getState: vi.fn(), setState: vi.fn(), postMessage: vi.fn() };
        vi.stubGlobal("acquireVsCodeApi", () => vsCodeApi);
        const command = new RequestFormDefaultsCommand();

        const host = getHostApi();
        host.postMessage(command);

        expect(host).toBeInstanceOf(HostApiImpl);
        expect(vsCodeApi.postMessage).toHaveBeenCalledWith(command);
    });
});

describe("development preview host", () => {
    let replies: Reply[];
    const collectReply = (event: MessageEvent<Reply>) => replies.push(event.data);
    const targetNames = (reply: Reply) =>
        (reply.targets as DeploymentTargetPayload[]).map(({ name }) => name);

    function previewHost() {
        vi.stubEnv("NODE_ENV", "development");
        return getHostApi();
    }

    function sendAndCollect(host: ReturnType<typeof getHostApi>, command: Command) {
        replies = [];
        host.postMessage(command);
        return replies;
    }

    beforeEach(() => {
        replies = [];
        window.addEventListener("message", collectReply);
        vi.spyOn(console, "debug").mockImplementation(() => undefined);
    });

    afterEach(() => {
        window.removeEventListener("message", collectReply);
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("prefills the form and lists the two sample targets with none active", () => {
        previewHost().postMessage(new RequestFormDefaultsCommand());

        expect(replies).toEqual([
            expect.objectContaining({
                type: "FormDefaultsQuery",
                defaults: expect.objectContaining({ deploymentName: "my-process", engine: "c7" }),
            }),
            expect.objectContaining({ type: "DeploymentTargetsQuery", activeTargetName: "" }),
        ]);
        expect(targetNames(replies[1])).toEqual(["dev", "prod"]);
    });

    it("activates a selected target", () => {
        previewHost().postMessage(new SelectTargetCommand("prod"));

        expect(replies).toEqual([
            expect.objectContaining({ type: "DeploymentTargetsQuery", activeTargetName: "prod" }),
        ]);
    });

    it("creates a new target and activates it", () => {
        const [saved, targets] = sendAndCollect(
            previewHost(),
            new CreateTargetCommand(target("staging"), noAuth),
        );

        expect(saved).toEqual(expect.objectContaining({ type: "TargetSavedQuery", success: true }));
        expect(targets).toEqual(expect.objectContaining({ activeTargetName: "staging" }));
        expect(targetNames(targets)).toEqual(["dev", "prod", "staging"]);
    });

    it("refuses to create a target under a taken name", () => {
        previewHost().postMessage(new CreateTargetCommand(target("dev"), noAuth));

        expect(replies).toEqual([
            expect.objectContaining({
                type: "TargetSavedQuery",
                success: false,
                message: 'A deployment target named "dev" already exists.',
            }),
        ]);
    });

    it("replaces the renamed target instead of keeping both names", () => {
        const [saved, targets] = sendAndCollect(
            previewHost(),
            new SaveTargetCommand(target("local"), noAuth, "dev"),
        );

        expect(saved).toEqual(expect.objectContaining({ type: "TargetSavedQuery", success: true }));
        expect(targets).toEqual(expect.objectContaining({ activeTargetName: "local" }));
        expect(targetNames(targets)).toEqual(["prod", "local"]);
    });

    it("overwrites a target saved under its own name", () => {
        const [, targets] = sendAndCollect(
            previewHost(),
            new SaveTargetCommand(target("dev"), noAuth, "dev"),
        );

        expect(targetNames(targets)).toEqual(["prod", "dev"]);
    });

    it("refuses a rename onto another existing target", () => {
        previewHost().postMessage(new SaveTargetCommand(target("prod"), noAuth, "dev"));

        expect(replies).toEqual([
            expect.objectContaining({
                type: "TargetSavedQuery",
                success: false,
                message: 'A deployment target named "prod" already exists.',
            }),
        ]);
    });

    it("drops the active target back to ad-hoc mode when it is deleted", () => {
        const host = previewHost();
        host.postMessage(new SelectTargetCommand("dev"));

        const [deleted, targets] = sendAndCollect(host, new DeleteTargetCommand("dev"));

        expect(deleted).toEqual(
            expect.objectContaining({ type: "TargetSavedQuery", success: true }),
        );
        expect(targets).toEqual(expect.objectContaining({ activeTargetName: "" }));
        expect(targetNames(targets)).toEqual(["prod"]);
    });

    it("keeps the active target when another one is deleted", () => {
        const host = previewHost();
        host.postMessage(new SelectTargetCommand("prod"));

        const [, targets] = sendAndCollect(host, new DeleteTargetCommand("dev"));

        expect(targets).toEqual(expect.objectContaining({ activeTargetName: "prod" }));
    });

    it("answers a credentials lookup with the target's auth settings", () => {
        previewHost().postMessage(new RequestStoredCredentialsCommand("prod", 7));

        expect(replies).toEqual([
            expect.objectContaining({
                type: "StoredCredentialsQuery",
                auth: {
                    authType: "oauth2",
                    tokenEndpoint: "https://login.example.com/oauth/token",
                    audience: "zeebe-api",
                },
                targetName: "prod",
                requestId: 7,
            }),
        ]);
    });

    it("answers a credentials lookup for an unknown target without auth", () => {
        previewHost().postMessage(new RequestStoredCredentialsCommand("missing"));

        expect(replies).toEqual([
            expect.objectContaining({
                type: "StoredCredentialsQuery",
                auth: { authType: "none", tokenEndpoint: undefined, audience: undefined },
            }),
        ]);
    });

    it.each<[Command, Reply]>([
        [new RequestAdditionalFilesCommand(), { type: "AdditionalFilesQuery", filePaths: [] }],
        [
            new DeployCommand({
                deploymentName: "order",
                tenantId: "",
                endpoint: "https://dev.test",
                engine: "c7",
                mainFilePath: "order.bpmn",
                additionalFilePaths: [],
                auth: noAuth,
                targetName: "",
            }),
            { type: "DeploymentResultQuery", success: true },
        ],
        [
            new RequestProcessDefinitionKeyCommand(),
            { type: "ProcessDefinitionKeyQuery", processDefinitionKey: "Process_0gjrx3e" },
        ],
        [new RequestPayloadFilesCommand(), { type: "SelectedPayloadFileQuery" }],
        [
            new StartInstanceCommand({
                processDefinitionKey: "Process_0gjrx3e",
                endpoint: "https://dev.test",
                engine: "c7",
                auth: noAuth,
                payloadFilePath: "",
                targetName: "",
            }),
            { type: "StartInstanceResultQuery", success: true },
        ],
    ])("answers %o with %o", (request, reply) => {
        previewHost().postMessage(request);

        expect(replies).toEqual([expect.objectContaining(reply)]);
    });

    it.each<[string, Command | { type: string }]>([
        ["opening the targets file", new OpenTargetsFileCommand()],
        ["an unknown message", { type: "NotAProtocolMessage" }],
    ])("logs %s without replying", (_, message) => {
        previewHost().postMessage(message as Command);

        expect(replies).toEqual([]);
        expect(console.debug).toHaveBeenCalled();
    });
});
