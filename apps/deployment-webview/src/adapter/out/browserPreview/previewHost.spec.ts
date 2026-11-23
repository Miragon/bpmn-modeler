import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    CreateTargetCommand,
    DeleteTargetCommand,
    DeployCommand,
    LogErrorCommand,
    LogInfoCommand,
    OpenTargetsFileCommand,
    RequestAdditionalFilesCommand,
    RequestFormDefaultsCommand,
    RequestPayloadFilesCommand,
    RequestStoredCredentialsCommand,
    SaveTargetCommand,
    SelectTargetCommand,
    StartInstanceCommand,
    type AuthConfigPayload,
    type DeploymentSidebarCommand,
    type DeploymentSidebarCommandType,
    type DeploymentTargetPayload,
    type MessageOfType,
    previewRouteOf,
} from "@miragon/bpmn-modeler-shared";

import { PREVIEW_COMMANDS } from "./previewCommands";
import { PreviewHost } from "./previewHost";

type Reply = { type: string } & Record<string, unknown>;

const noAuth: AuthConfigPayload = { authType: "none" };
const target = (name: string): DeploymentTargetPayload => ({
    name,
    engine: "c7",
    endpoint: `https://${name}.test`,
    tenantId: "",
    authType: "none",
});

const SIDEBAR_COMMANDS: { [Type in DeploymentSidebarCommandType]: MessageOfType<Type> } = {
    LogInfoCommand: new LogInfoCommand("info"),
    LogErrorCommand: new LogErrorCommand("error"),
    RequestFormDefaultsCommand: new RequestFormDefaultsCommand(),
    DeployCommand: new DeployCommand({
        deploymentName: "order",
        tenantId: "",
        endpoint: "https://dev.test",
        engine: "c7",
        mainFilePath: "order.bpmn",
        additionalFilePaths: [],
        auth: noAuth,
        targetName: "",
    }),
    RequestAdditionalFilesCommand: new RequestAdditionalFilesCommand(),
    RequestStoredCredentialsCommand: new RequestStoredCredentialsCommand("dev"),
    SelectTargetCommand: new SelectTargetCommand("dev"),
    SaveTargetCommand: new SaveTargetCommand(target("dev"), noAuth, "dev"),
    CreateTargetCommand: new CreateTargetCommand(target("staging"), noAuth),
    DeleteTargetCommand: new DeleteTargetCommand("dev"),
    OpenTargetsFileCommand: new OpenTargetsFileCommand(),
    StartInstanceCommand: new StartInstanceCommand({
        processDefinitionKey: "Process_0gjrx3e",
        endpoint: "https://dev.test",
        engine: "c7",
        auth: noAuth,
        payloadFilePath: "",
        targetName: "",
    }),
    RequestPayloadFilesCommand: new RequestPayloadFilesCommand(),
};

const ANSWERED_TYPES: ReadonlySet<string> = new Set([
    "RequestFormDefaultsCommand",
    "DeployCommand",
    "RequestAdditionalFilesCommand",
    "RequestStoredCredentialsCommand",
    "SelectTargetCommand",
    "SaveTargetCommand",
    "CreateTargetCommand",
    "DeleteTargetCommand",
    "StartInstanceCommand",
    "RequestPayloadFilesCommand",
]);

describe("PreviewHost", () => {
    let replies: Reply[];
    const collectReply = (event: MessageEvent<Reply>) => replies.push(event.data);
    const targetNames = (reply: Reply) =>
        (reply.targets as DeploymentTargetPayload[]).map(({ name }) => name);

    function previewHost() {
        return new PreviewHost();
    }

    function sendAndCollect(host: PreviewHost, command: DeploymentSidebarCommand) {
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
        vi.restoreAllMocks();
    });

    it("prefills the form and its process key and lists the two sample targets with none active", () => {
        previewHost().postMessage(new RequestFormDefaultsCommand());

        expect(replies).toEqual([
            expect.objectContaining({
                type: "FormDefaultsQuery",
                defaults: expect.objectContaining({ deploymentName: "my-process", engine: "c7" }),
            }),
            { type: "ProcessDefinitionKeyQuery", processDefinitionKey: "Process_0gjrx3e" },
            expect.objectContaining({ type: "DeploymentTargetsQuery", activeTargetName: "" }),
        ]);
        expect(targetNames(replies[2])).toEqual(["dev", "prod"]);
    });

    it.each(["prod", " prod "])("activates a selected target named %j", (name) => {
        previewHost().postMessage(new SelectTargetCommand(name));

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

    it.each(["dev", " dev "])("refuses to create a target named %j, which is taken", (name) => {
        previewHost().postMessage(new CreateTargetCommand(target(name), noAuth));

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

    it.each([
        ["no previous name", undefined],
        ['previous name "dev"', "dev"],
    ])("overwrites a target saved under its own name, %s", (_, previousName) => {
        const [, targets] = sendAndCollect(
            previewHost(),
            new SaveTargetCommand(target("dev"), noAuth, previousName),
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

    it.each(["prod", " prod "])(
        "answers a credentials lookup for a target named %j with its auth settings",
        (name) => {
            previewHost().postMessage(new RequestStoredCredentialsCommand(name, 7));

            expect(replies).toEqual([
                expect.objectContaining({
                    type: "StoredCredentialsQuery",
                    auth: {
                        authType: "oauth2",
                        tokenEndpoint: "https://login.example.com/oauth/token",
                        audience: "zeebe-api",
                    },
                    targetName: name,
                    requestId: 7,
                }),
            ]);
        },
    );

    it("answers a credentials lookup for an unknown target without auth", () => {
        previewHost().postMessage(new RequestStoredCredentialsCommand("missing"));

        expect(replies).toEqual([
            expect.objectContaining({
                type: "StoredCredentialsQuery",
                auth: { authType: "none", tokenEndpoint: undefined, audience: undefined },
            }),
        ]);
    });

    it.each<[DeploymentSidebarCommand, Reply]>([
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

    it("logs the deployment and the instance start it pretends to send", () => {
        const deploy = new DeployCommand({
            deploymentName: "order",
            tenantId: "",
            endpoint: "https://dev.test",
            engine: "c7",
            mainFilePath: "order.bpmn",
            additionalFilePaths: [],
            auth: noAuth,
            targetName: "",
        });
        const start = new StartInstanceCommand({
            processDefinitionKey: "Process_0gjrx3e",
            endpoint: "https://dev.test",
            engine: "c7",
            auth: noAuth,
            payloadFilePath: "",
            targetName: "",
        });
        const host = previewHost();

        host.postMessage(deploy);
        host.postMessage(start);

        expect(console.debug).toHaveBeenCalledWith("[DEBUG] DeployCommand", deploy);
        expect(console.debug).toHaveBeenCalledWith("[DEBUG] StartInstanceCommand", start);
    });

    it.each([
        ["info", new LogInfoCommand("form ready")],
        ["error", new LogErrorCommand("deploy failed")],
    ] as const)("writes a log entry's message to console.%s without replying", (level, command) => {
        const log = vi.spyOn(console, level).mockImplementation(() => undefined);

        previewHost().postMessage(command);

        expect(log).toHaveBeenCalledWith(command.message);
        expect(replies).toEqual([]);
    });

    it("logs a caught error's stack under its message", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

        previewHost().postMessage(new LogErrorCommand("Deploy failed", "Error: boom\n    at deploy"));

        expect(error).toHaveBeenCalledWith("Deploy failed\nError: boom\n    at deploy");
    });

    it("keeps each preview host's targets to itself", () => {
        previewHost().postMessage(new CreateTargetCommand(target("staging"), noAuth));

        const [targets] = sendAndCollect(previewHost(), new SelectTargetCommand("dev"));

        expect(targetNames(targets)).toEqual(["dev", "prod"]);
    });

    it.each(["NotAProtocolMessage", "toString"])(
        "rejects a message of type %s without replying",
        (type) => {
            const host = previewHost();

            // @ts-expect-error No sidebar command has this type.
            expect(() => host.postMessage({ type })).toThrow(`Unknown message type: ${type}`);
            expect(replies).toEqual([]);
        },
    );

    it.each(
        Object.values(SIDEBAR_COMMANDS).filter((command) => !ANSWERED_TYPES.has(command.type)),
    )("sends nothing back for a $type", (command) => {
        vi.spyOn(console, "info").mockImplementation(() => undefined);
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        previewHost().postMessage(command);

        expect(replies).toEqual([]);
    });

    it.each(
        Object.values(SIDEBAR_COMMANDS).flatMap((command) => {
            const route = previewRouteOf(PREVIEW_COMMANDS, command.type);
            return "ignored" in route ? [{ command, reason: route.ignored }] : [];
        }),
    )("says why it drops a $command.type", ({ command, reason }) => {
        previewHost().postMessage(command);

        expect(console.debug).toHaveBeenCalledWith(expect.stringContaining(reason), command);
    });
});
