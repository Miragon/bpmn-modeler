import { describe, expect, it, vi } from "vitest";

import { AuthConfigPayload, DeploymentTargetPayload } from "@miragon/bpmn-modeler-shared";
import { Engine } from "@miragon/bpmn-modeler-types";

import { DisallowedEnvReferenceError, InvalidDeploymentTargetError } from "../domain/errors";
import { createTestHost, PromptAnswers, TestHostOptions } from "../../testing";
import { CredentialRefs } from "../domain/credentialRefs";
import { BasicAuth, NoAuth, OAuth2Auth } from "../domain/deployment";
import {
    AdHocDestination,
    NamedDestination,
    TargetEdit,
    TargetsLocation,
    UnknownTarget,
} from "../domain/deploymentDestination";
import { DeploymentTargetsEvent } from "../domain/deploymentTargetsEvent";
import { deleteTargetConfirmation, deploymentTargetPrompt } from "../domain/deploymentPrompts";
import {
    serializeDeploymentTargets,
    DeploymentTarget,
    TargetAuthType,
} from "../domain/deploymentTarget";
import { DeploymentTargetService, toTargetPayload } from "./DeploymentTargetService";

const CONFIG_FOLDER = ".camunda";
const TARGETS_FILE_NAME = "deployment-targets.json";
const WORKSPACE_ROOT = "/ws";
const FILE_PATH = `${WORKSPACE_ROOT}/${CONFIG_FOLDER}/${TARGETS_FILE_NAME}`;
const DOC_DIR = "/ws/src";
const LOCATION: TargetsLocation = {
    filePath: FILE_PATH,
    exists: true,
    projectDir: WORKSPACE_ROOT,
};

function fileWith(...targets: DeploymentTarget[]): string {
    return serializeDeploymentTargets(targets);
}

/** The positional constructor's arguments after the name. */
interface TargetOverrides {
    readonly engine?: Engine;
    readonly endpoint?: string;
    readonly tenantId?: string;
    readonly authType?: TargetAuthType;
    readonly tokenEndpoint?: string;
    readonly audience?: string;
    readonly deployUrl?: string;
    readonly startInstanceUrl?: string;
    readonly credentialRefs?: CredentialRefs;
}

function target(name: string, overrides: TargetOverrides = {}): DeploymentTarget {
    return new DeploymentTarget(
        name,
        overrides.engine ?? "c7",
        overrides.endpoint ?? "http://localhost:8080/engine-rest",
        overrides.tenantId ?? "",
        overrides.authType ?? "none",
        overrides.tokenEndpoint ?? "",
        overrides.audience ?? "",
        overrides.deployUrl,
        overrides.startInstanceUrl,
        overrides.credentialRefs,
    );
}

interface DisallowedFieldCase {
    target: Partial<DeploymentTargetPayload>;
    auth?: AuthConfigPayload;
    field: string;
}

interface LeakedSecretCase {
    description: string;
    field: string;
    auth: AuthConfigPayload;
}

function createService(options: TestHostOptions = {}) {
    const host = createTestHost({
        folders: [WORKSPACE_ROOT],
        settings: { configFolder: CONFIG_FOLDER },
        promptAnswers: { deleteTarget: true },
        ...options,
    });
    const artifactService = {
        getWorkspaceRoot: vi.fn().mockResolvedValue(WORKSPACE_ROOT),
        findConfigBaseDir: vi.fn().mockResolvedValue(undefined),
    };

    const service = new DeploymentTargetService(
        artifactService as never,
        host.settings,
        host.workspace,
        host.secrets,
        host.deploymentState,
        host.picker,
        host.notifier,
    );

    return { service, host, artifactService };
}

const slot = (name: string) => `${FILE_PATH}::${name}`;

const named = (saved: DeploymentTarget) => new NamedDestination(saved, LOCATION);

function serviceWithTargetsFile(content = fileWith()) {
    const c = createService({ files: { [FILE_PATH]: content } });
    c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);
    return c;
}

function writtenTarget(c: ReturnType<typeof createService>, name: string) {
    const written = JSON.parse(c.host.workspace.files.get(FILE_PATH) ?? "");
    return written.targets.find((entry: { name: string }) => entry.name === name);
}

async function expectNothingPersisted(c: ReturnType<typeof createService>) {
    expect(c.host.workspace.files.get(FILE_PATH)).toBe(fileWith());
    await expect(c.host.secrets.getBasicAuth(slot("dev"))).resolves.toBeUndefined();
    await expect(c.host.secrets.getOAuth2(slot("dev"))).resolves.toBeUndefined();
    expect(c.host.deploymentState.load().activeTargetName).toBe("");
}

describe("DeploymentTargetService.locateTargetsFile", () => {
    it("searches from the document directory up to its workspace root", async () => {
        const c = createService();

        await c.service.locateTargetsFile(DOC_DIR);

        expect(c.artifactService.getWorkspaceRoot).toHaveBeenCalledWith(DOC_DIR);
        expect(c.artifactService.findConfigBaseDir).toHaveBeenCalledWith(
            DOC_DIR,
            CONFIG_FOLDER,
            TARGETS_FILE_NAME,
            WORKSPACE_ROOT,
        );
    });

    it("points a missing file at the workspace root, which is also the project dir", async () => {
        const c = createService();
        c.artifactService.findConfigBaseDir.mockResolvedValue(undefined);

        await expect(c.service.locateTargetsFile(DOC_DIR)).resolves.toEqual({
            filePath: FILE_PATH,
            exists: false,
            projectDir: WORKSPACE_ROOT,
        });
    });

    it("uses the directory owning a nested targets file as the project dir", async () => {
        const c = createService();
        const ownerDir = "/ws/services/order";
        c.artifactService.findConfigBaseDir.mockResolvedValue(ownerDir);

        await expect(c.service.locateTargetsFile(`${ownerDir}/src`)).resolves.toEqual({
            filePath: `${ownerDir}/${CONFIG_FOLDER}/${TARGETS_FILE_NAME}`,
            exists: true,
            projectDir: ownerDir,
        });
    });

    it("keeps the UNC root of a targets file in a project on a share", async () => {
        const c = createService();
        const ownerDir = "//server/share/ws";
        c.artifactService.findConfigBaseDir.mockResolvedValue(ownerDir);

        await expect(c.service.locateTargetsFile(`${ownerDir}/src`)).resolves.toEqual({
            filePath: `${ownerDir}/${CONFIG_FOLDER}/${TARGETS_FILE_NAME}`,
            exists: true,
            projectDir: ownerDir,
        });
    });

    it("searches the first workspace folder when no document directory is given", async () => {
        const c = createService({ folders: [WORKSPACE_ROOT, "/other"] });
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);

        await expect(c.service.locateTargetsFile(undefined)).resolves.toEqual({
            filePath: FILE_PATH,
            exists: true,
            projectDir: WORKSPACE_ROOT,
        });
        expect(c.artifactService.getWorkspaceRoot).not.toHaveBeenCalled();
        expect(c.artifactService.findConfigBaseDir).toHaveBeenCalledWith(
            WORKSPACE_ROOT,
            CONFIG_FOLDER,
            TARGETS_FILE_NAME,
            WORKSPACE_ROOT,
        );
    });

    it("returns undefined without a workspace or document directory", async () => {
        const c = createService({ folders: [] });

        await expect(c.service.locateTargetsFile(undefined)).resolves.toBeUndefined();
        expect(c.artifactService.findConfigBaseDir).not.toHaveBeenCalled();
    });

    it("reads and keys secrets from the nested file it found", async () => {
        const ownerDir = "/ws/services/order";
        const nestedFile = `${ownerDir}/${CONFIG_FOLDER}/${TARGETS_FILE_NAME}`;
        const c = createService({
            files: { [nestedFile]: fileWith(target("dev", { authType: "basic" })) },
        });
        c.artifactService.findConfigBaseDir.mockResolvedValue(ownerDir);
        await c.host.secrets.saveBasicAuth("u", "p", `${nestedFile}::dev`);

        await expect(c.service.getStoredCredentials("dev", `${ownerDir}/src`)).resolves.toEqual({
            authType: "basic",
            username: "u",
            password: "p",
        });
    });
});

describe("DeploymentTargetService.listTargets", () => {
    it("reads and parses the nearest existing file", async () => {
        const c = createService({ files: { [FILE_PATH]: fileWith(target("dev")) } });
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);

        const targets = await c.service.listTargets(DOC_DIR);

        expect(targets.map((t) => t.name)).toEqual(["dev"]);
    });

    it("returns [] when no file exists", async () => {
        const c = createService();
        c.artifactService.findConfigBaseDir.mockResolvedValue(undefined);

        expect(await c.service.listTargets(DOC_DIR)).toEqual([]);
    });

    it("reports a parse error and returns []", async () => {
        const c = createService({ files: { [FILE_PATH]: "{ not valid json" } });
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);

        expect(await c.service.listTargets(DOC_DIR)).toEqual([]);
        expect(c.host.notifier.errors).toEqual([
            expect.stringMatching(/^Could not read deployment targets\n/),
        ]);
    });
});

describe("DeploymentTargetService.openTargetsFile", () => {
    it("opens the existing file without rewriting it", async () => {
        const existing = fileWith(target("dev"));
        const c = createService({ files: { [FILE_PATH]: existing } });
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);

        await c.service.openTargetsFile(DOC_DIR);

        expect(c.host.workspace.files).toEqual(new Map([[FILE_PATH, existing]]));
        expect(c.host.notifier.openedDocuments).toEqual([FILE_PATH]);
    });

    it("creates an empty targets file first when none exists", async () => {
        const c = createService();
        c.artifactService.findConfigBaseDir.mockResolvedValue(undefined);

        await c.service.openTargetsFile(DOC_DIR);

        const [[writtenPath, content]] = c.host.workspace.files;
        expect(writtenPath).toMatch(/deployment-targets\.json$/);
        expect(JSON.parse(content)).toEqual({ targets: [] });
        expect(c.host.notifier.openedDocuments).toEqual([writtenPath]);
    });

    it("throws when there is no workspace", async () => {
        const c = createService({ folders: [] });

        await expect(c.service.openTargetsFile(undefined)).rejects.toThrow(/workspace/);
        expect(c.host.notifier.openedDocuments).toEqual([]);
    });
});

describe("DeploymentTargetService.saveTarget", () => {
    async function seedOldTarget(c: ReturnType<typeof createService>) {
        await c.host.secrets.saveBasicAuth("old-user", "old-pass", slot("old"));
        c.host.deploymentState.seed({ activeTargetName: "old" });
    }

    async function expectOldTargetUntouched(c: ReturnType<typeof createService>) {
        await expect(c.host.secrets.getBasicAuth(slot("old"))).resolves.toEqual({
            username: "old-user",
            password: "old-pass",
        });
        expect(c.host.deploymentState.load().activeTargetName).toBe("old");
    }

    it.each(["{ broken", JSON.stringify({ targets: [{ name: "broken" }] })])(
        "leaves the file, secrets, and active target untouched after a parse failure: %s",
        async (content) => {
            const c = createService({ files: { [FILE_PATH]: content } });
            c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);
            await seedOldTarget(c);
            await expect(
                c.service.saveTarget(
                    {
                        name: "new",
                        engine: "c7",
                        endpoint: "https://host",
                        tenantId: "",
                        authType: "none",
                    },
                    { authType: "none" },
                    undefined,
                    DOC_DIR,
                ),
            ).rejects.toThrow();
            await expect(c.service.deleteTarget("old", DOC_DIR)).rejects.toThrow();
            expect(c.host.workspace.files.get(FILE_PATH)).toBe(content);
            await expect(c.host.secrets.getBasicAuth(slot("new"))).resolves.toBeUndefined();
            await expect(c.host.secrets.getOAuth2(slot("new"))).resolves.toBeUndefined();
            await expectOldTargetUntouched(c);
        },
    );

    it("aborts mutations when the existing file is unreadable", async () => {
        const c = createService({ files: { [FILE_PATH]: fileWith(target("old")) } });
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);
        vi.spyOn(c.host.workspace, "readFile").mockRejectedValue(new Error("EACCES"));
        await seedOldTarget(c);
        await expect(
            c.service.saveTarget(
                {
                    name: "new",
                    engine: "c7",
                    endpoint: "https://host",
                    tenantId: "",
                    authType: "none",
                },
                { authType: "none" },
                undefined,
                DOC_DIR,
            ),
        ).rejects.toThrow("EACCES");
        await expect(c.service.deleteTarget("old", DOC_DIR)).rejects.toThrow("EACCES");
        expect(c.host.workspace.files.get(FILE_PATH)).toBe(fileWith(target("old")));
        await expectOldTargetUntouched(c);
    });

    it.each([
        { name: "", endpoint: "https://host" },
        { name: "new", endpoint: " " },
    ])("rejects invalid input before writing: %j", async (fields) => {
        const c = createService();
        c.host.deploymentState.seed({ activeTargetName: "old" });
        await expect(
            c.service.saveTarget(
                { ...fields, engine: "c7", tenantId: "", authType: "basic" },
                { authType: "basic", username: "u", password: "p" },
                undefined,
                DOC_DIR,
            ),
        ).rejects.toThrow();
        expect(c.host.workspace.files.size).toBe(0);
        await expect(c.host.secrets.getBasicAuth(slot(fields.name))).resolves.toBeUndefined();
        expect(c.host.deploymentState.load().activeTargetName).toBe("old");
    });

    it.each([
        { overrides: { engine: "c9" }, field: "engine" },
        { overrides: { authType: "x" }, field: "auth.type" },
    ])(
        "rejects an unknown $field from the unchecked protocol payload and writes nothing",
        async ({ overrides, field }) => {
            const c = serviceWithTargetsFile();

            const saving = c.service.saveTarget(
                {
                    name: "dev",
                    engine: "c7",
                    endpoint: "http://h",
                    tenantId: "",
                    authType: "none",
                    ...overrides,
                } as DeploymentTargetPayload,
                { authType: "none" },
                undefined,
                DOC_DIR,
            );

            await expect(saving).rejects.toBeInstanceOf(InvalidDeploymentTargetError);
            await expect(saving).rejects.toMatchObject({ field });
            await expectNothingPersisted(c);
        },
    );

    it("writes the upserted file, stores secrets under the slot, and activates", async () => {
        const c = createService({ files: { [FILE_PATH]: fileWith(target("prod")) } });
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);

        await c.service.saveTarget(
            {
                name: "dev",
                engine: "c7",
                endpoint: "http://h",
                tenantId: "",
                authType: "basic",
            },
            { authType: "basic", username: "u", password: "p" },
            undefined,
            DOC_DIR,
        );

        const written = c.host.workspace.files.get(FILE_PATH);
        expect(written).toContain('"prod"');
        expect(written).toContain('"dev"');
        await expect(c.host.secrets.getBasicAuth(slot("dev"))).resolves.toEqual({
            username: "u",
            password: "p",
        });
        expect(c.host.deploymentState.load().activeTargetName).toBe("dev");
    });

    it.each(["${env:MIRAGON_CAMUNDA_PASSWORD}", "  ${env:MIRAGON_CAMUNDA_PASSWORD} "])(
        "writes a whole-value credential ref to the JSON trimmed and stores it as typed: %j",
        async (password) => {
            const c = serviceWithTargetsFile();

            await c.service.saveTarget(
                {
                    name: "dev",
                    engine: "c7",
                    endpoint: "http://h",
                    tenantId: "",
                    authType: "basic",
                },
                { authType: "basic", username: "admin", password },
                undefined,
                DOC_DIR,
            );

            expect(writtenTarget(c, "dev").auth).toEqual({
                type: "basic",
                password: "${env:MIRAGON_CAMUNDA_PASSWORD}",
            });
            await expect(c.host.secrets.getBasicAuth(slot("dev"))).resolves.toEqual({
                username: "admin",
                password,
            });
        },
    );

    it("stores a ref username and its literal password together, never an empty half", async () => {
        const c = serviceWithTargetsFile();

        await c.service.saveTarget(
            { name: "dev", engine: "c7", endpoint: "http://h", tenantId: "", authType: "basic" },
            { authType: "basic", username: "${env:MIRAGON_USER}", password: "s3cret" },
            undefined,
            DOC_DIR,
        );

        expect(writtenTarget(c, "dev").auth).toEqual({
            type: "basic",
            username: "${env:MIRAGON_USER}",
        });
        // A backend that reads an empty half back as null would drop the literal beside it.
        await expect(c.host.secrets.getBasicAuth(slot("dev"))).resolves.toEqual({
            username: "${env:MIRAGON_USER}",
            password: "s3cret",
        });
    });

    it("writes oauth2 client credential refs to the JSON and stores them as typed", async () => {
        const c = serviceWithTargetsFile();
        const oauth = { tokenEndpoint: "https://idp/token", audience: "api" };

        await c.service.saveTarget(
            {
                name: "dev",
                engine: "c8",
                endpoint: "http://h",
                tenantId: "",
                authType: "oauth2",
                ...oauth,
            },
            {
                authType: "oauth2",
                clientId: "${env:MIRAGON_CLIENT_ID}",
                clientSecret: "${env:MIRAGON_CLIENT_SECRET}",
                ...oauth,
            },
            undefined,
            DOC_DIR,
        );

        expect(writtenTarget(c, "dev").auth).toEqual({
            type: "oauth2",
            ...oauth,
            clientId: "${env:MIRAGON_CLIENT_ID}",
            clientSecret: "${env:MIRAGON_CLIENT_SECRET}",
        });
        await expect(c.host.secrets.getOAuth2(slot("dev"))).resolves.toEqual({
            clientId: "${env:MIRAGON_CLIENT_ID}",
            clientSecret: "${env:MIRAGON_CLIENT_SECRET}",
        });
    });

    it.each(["plain-secret", "prefix-${env:MIRAGON_CAMUNDA_PASSWORD}"])(
        "keeps a literal or partial credential out of the JSON and in the secret store: %j",
        async (password) => {
            const c = serviceWithTargetsFile();

            await c.service.saveTarget(
                {
                    name: "dev",
                    engine: "c7",
                    endpoint: "http://h",
                    tenantId: "",
                    authType: "basic",
                },
                { authType: "basic", username: "admin", password },
                undefined,
                DOC_DIR,
            );

            expect(writtenTarget(c, "dev").auth).toEqual({ type: "basic" });
            await expect(c.host.secrets.getBasicAuth(slot("dev"))).resolves.toEqual({
                username: "admin",
                password,
            });
        },
    );

    it.each([
        { authType: "basic", password: "${env:GITHUB_TOKEN}", field: "auth.password" },
        { authType: "oauth2", clientSecret: "${env:GITHUB_TOKEN}", field: "auth.clientSecret" },
    ] as const)(
        "rejects a foreign credential ref in $field and writes nothing",
        async ({ field, ...auth }) => {
            const c = serviceWithTargetsFile();

            const saving = c.service.saveTarget(
                {
                    name: "dev",
                    engine: "c7",
                    endpoint: "http://h",
                    tenantId: "",
                    authType: auth.authType,
                },
                auth,
                undefined,
                DOC_DIR,
            );

            await expect(saving).rejects.toBeInstanceOf(DisallowedEnvReferenceError);
            await expect(saving).rejects.toMatchObject({ field });
            await expectNothingPersisted(c);
        },
    );

    it.each<DisallowedFieldCase>([
        { target: { endpoint: "https://${env:HOST}/engine-rest" }, field: "endpoint" },
        { target: { tenantId: "${env:MIRAGON_TENANT" }, field: "tenantId" },
        {
            target: { authType: "oauth2", tokenEndpoint: "https://${env:AWS_REGION}/token" },
            auth: { authType: "oauth2", tokenEndpoint: "https://${env:AWS_REGION}/token" },
            field: "auth.tokenEndpoint",
        },
        {
            target: { authType: "oauth2", audience: "${env:miragon_audience}" },
            auth: { authType: "oauth2", audience: "${env:miragon_audience}" },
            field: "auth.audience",
        },
        { target: { deployUrl: "http://h/${env:PATH}/deploy" }, field: "endpoints.deploy" },
        {
            target: { startInstanceUrl: "http://h/${env:}/start" },
            field: "endpoints.startInstance",
        },
    ])(
        "rejects a foreign or malformed ref in $field and writes nothing",
        async ({ target: overrides, auth = { authType: "none" }, field }) => {
            const c = serviceWithTargetsFile();

            const saving = c.service.saveTarget(
                {
                    name: "dev",
                    engine: "c7",
                    endpoint: "http://h",
                    tenantId: "",
                    authType: "none",
                    ...overrides,
                },
                auth,
                undefined,
                DOC_DIR,
            );

            await expect(saving).rejects.toBeInstanceOf(DisallowedEnvReferenceError);
            await expect(saving).rejects.toMatchObject({ field });
            await expectNothingPersisted(c);
        },
    );

    it.each<LeakedSecretCase>([
        {
            description: "an unclosed ref",
            field: "auth.password",
            auth: { authType: "basic", username: "admin", password: "p${env:hunter2rest" },
        },
        {
            description: "a ref name with a space",
            field: "auth.clientSecret",
            auth: { authType: "oauth2", clientId: "cid", clientSecret: "${env:hunter 2}" },
        },
        {
            description: "a well-formed foreign ref",
            field: "auth.password",
            auth: { authType: "basic", username: "admin", password: "p${env:hunter2}rest" },
        },
    ])("never echoes $field holding $description and writes nothing", async ({ field, auth }) => {
        const c = serviceWithTargetsFile();

        const saving = c.service.saveTarget(
            {
                name: "dev",
                engine: "c7",
                endpoint: "http://h",
                tenantId: "",
                authType: auth.authType,
            },
            auth,
            undefined,
            DOC_DIR,
        );

        await expect(saving).rejects.toBeInstanceOf(DisallowedEnvReferenceError);
        await expect(saving).rejects.toMatchObject({
            field,
            message: expect.not.stringContaining("hunter"),
        });
        await expectNothingPersisted(c);
    });

    it("deletes the previous credential slot on rename", async () => {
        const c = createService({ files: { [FILE_PATH]: fileWith(target("old")) } });
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);
        await c.host.secrets.saveBasicAuth("u", "p", slot("old"));

        await c.service.saveTarget(
            { name: "new", engine: "c7", endpoint: "http://h", tenantId: "", authType: "none" },
            { authType: "none" },
            "old",
            DOC_DIR,
        );

        await expect(c.host.secrets.getBasicAuth(slot("old"))).resolves.toBeUndefined();
    });

    it("returns a renamed change carrying the old target", async () => {
        const old = target("old", { tenantId: "saved" });
        const c = serviceWithTargetsFile(fileWith(old));

        const edit = await c.service.saveTarget(
            { ...toTargetPayload(old), name: "new" },
            { authType: "none" },
            "old",
            DOC_DIR,
        );

        expect({ kind: edit.change.kind, before: edit.change.before }).toEqual({
            kind: "renamed",
            before: old,
        });
        expect(edit.retiredDestination).toEqual(named(old));
    });

    it("throws when there is no workspace to store the file in", async () => {
        const c = createService({ folders: [] });

        await expect(
            c.service.saveTarget(
                {
                    name: "dev",
                    engine: "c7",
                    endpoint: "http://h",
                    tenantId: "",
                    authType: "none",
                },
                { authType: "none" },
                undefined,
                undefined,
            ),
        ).rejects.toThrow(/workspace/);
    });

    it("throws and leaves the file untouched on a rename collision", async () => {
        const existing = fileWith(target("dev"), target("prod"));
        const c = createService({ files: { [FILE_PATH]: existing } });
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);
        await c.host.secrets.saveBasicAuth("u", "p", slot("dev"));

        await expect(
            c.service.saveTarget(
                {
                    name: "prod",
                    engine: "c7",
                    endpoint: "http://h",
                    tenantId: "",
                    authType: "none",
                },
                { authType: "none" },
                "dev",
                DOC_DIR,
            ),
        ).rejects.toThrow(/already exists/);
        expect(c.host.workspace.files.get(FILE_PATH)).toBe(existing);
        await expect(c.host.secrets.getBasicAuth(slot("dev"))).resolves.toEqual({
            username: "u",
            password: "p",
        });
    });

    describe("when a rename fails part-way", () => {
        const old = target("old", { authType: "basic" });
        const OLD_APPROVALS = ["http://localhost:8080"];
        const failure = new Error("secret store unavailable");

        async function serviceWithOldTarget() {
            const c = serviceWithTargetsFile(fileWith(old));
            await seedOldTarget(c);
            await c.host.secrets.saveApprovedDestinations(slot("old"), OLD_APPROVALS);
            return c;
        }

        function renameOldToNew(c: ReturnType<typeof createService>) {
            return c.service.saveTarget(
                { ...toTargetPayload(old), name: "new" },
                { authType: "basic", username: "new-user", password: "new-pass" },
                "old",
                DOC_DIR,
            );
        }

        it.each<{ step: string; fail: (c: ReturnType<typeof createService>) => void }>([
            {
                step: "storing the renamed target's credentials",
                fail: (c) => vi.spyOn(c.host.secrets, "saveBasicAuth").mockRejectedValue(failure),
            },
            {
                step: "saving its approved destinations",
                fail: (c) =>
                    vi.spyOn(c.host.secrets, "saveApprovedDestinations").mockRejectedValue(failure),
            },
            {
                step: "writing the targets file",
                fail: (c) => vi.spyOn(c.host.workspace, "writeFile").mockRejectedValue(failure),
            },
        ])(
            "keeps the old name in the targets file and no secret under the new one when $step fails",
            async ({ fail }) => {
                const c = await serviceWithOldTarget();
                fail(c);

                await expect(renameOldToNew(c)).rejects.toThrow(failure);

                expect(c.host.workspace.files.get(FILE_PATH)).toBe(fileWith(old));
                await expectOldTargetUntouched(c);
                await expect(c.host.secrets.getApprovedDestinations(slot("old"))).resolves.toEqual(
                    OLD_APPROVALS,
                );
                await expect(c.host.secrets.getBasicAuth(slot("new"))).resolves.toBeUndefined();
                await expect(c.host.secrets.getApprovedDestinations(slot("new"))).resolves.toEqual(
                    [],
                );
            },
        );

        it("deletes the old slot of a renamed target when saving the active target name fails", async () => {
            const c = await serviceWithOldTarget();
            c.host.deploymentState.failSaves(
                (patch) => patch.activeTargetName !== undefined,
                failure,
            );

            await expect(renameOldToNew(c)).rejects.toThrow(failure);

            expect(writtenTarget(c, "new")).toBeDefined();
            await expect(c.host.secrets.getBasicAuth(slot("new"))).resolves.toEqual({
                username: "new-user",
                password: "new-pass",
            });
            await expect(c.host.secrets.getBasicAuth(slot("old"))).resolves.toBeUndefined();
            await expect(c.host.secrets.getApprovedDestinations(slot("old"))).resolves.toEqual([]);
        });

        it.each<{
            step: string;
            fail: (c: ReturnType<typeof createService>) => void;
            fileName: string;
        }>([
            {
                step: "storing the renamed target's credentials",
                fail: (c) => vi.spyOn(c.host.secrets, "saveBasicAuth").mockRejectedValue(failure),
                fileName: "old",
            },
            {
                step: "saving the active target name",
                fail: (c) =>
                    c.host.deploymentState.failSaves(
                        (patch) => patch.activeTargetName !== undefined,
                        failure,
                    ),
                fileName: "new",
            },
        ])(
            "reports the failure of $step and logs the failed cleanup when the store rejects deletes too",
            async ({ fail, fileName }) => {
                const c = await serviceWithOldTarget();
                const cleanupFailure = new Error("delete failed");
                fail(c);
                vi.spyOn(c.host.secrets, "delete").mockRejectedValue(cleanupFailure);

                await expect(renameOldToNew(c)).rejects.toThrow(failure);

                expect(c.host.notifier.loggedErrors).toEqual([cleanupFailure]);
                expect(writtenTarget(c, fileName)).toBeDefined();
            },
        );

        it.each<{ step: string; fail: (c: ReturnType<typeof createService>) => void }>([
            {
                step: "saving the active target name",
                fail: (c) =>
                    c.host.deploymentState.failSaves(
                        (patch) => patch.activeTargetName !== undefined,
                        failure,
                    ),
            },
            {
                step: "deleting the old slot",
                fail: (c) => vi.spyOn(c.host.secrets, "delete").mockRejectedValue(failure),
            },
        ])(
            "reports the failure and still publishes the written rename when $step fails",
            async ({ fail }) => {
                const c = await serviceWithOldTarget();
                const events: DeploymentTargetsEvent[] = [];
                c.service.onDidChange((event) => void events.push(event));
                fail(c);

                await expect(renameOldToNew(c)).rejects.toThrow(failure);

                expect(events).toEqual([
                    {
                        kind: "targetsChanged",
                        edit: expect.objectContaining({
                            change: expect.objectContaining({
                                kind: "renamed",
                                previousName: "old",
                            }),
                        }),
                        documentDir: DOC_DIR,
                    },
                ]);
            },
        );
    });

    it("keeps the credentials stored for a saved target when writing the targets file fails", async () => {
        const dev = target("dev", { authType: "basic" });
        const c = serviceWithTargetsFile(fileWith(dev));
        vi.spyOn(c.host.workspace, "writeFile").mockRejectedValue(new Error("EROFS"));

        await expect(
            c.service.saveTarget(
                { ...toTargetPayload(dev), tenantId: "edited" },
                { authType: "basic", username: "u", password: "p" },
                "dev",
                DOC_DIR,
            ),
        ).rejects.toThrow("EROFS");

        expect(c.host.workspace.files.get(FILE_PATH)).toBe(fileWith(dev));
        await expect(c.host.secrets.getBasicAuth(slot("dev"))).resolves.toEqual({
            username: "u",
            password: "p",
        });
    });

    it("keeps a saved target's credential ref in the file when storing its new literal fails", async () => {
        const dev = target("dev", {
            authType: "basic",
            credentialRefs: CredentialRefs.basic(undefined, "${env:MIRAGON_PW}"),
        });
        const c = serviceWithTargetsFile(fileWith(dev));
        await c.host.secrets.saveBasicAuth("u", "${env:MIRAGON_PW}", slot("dev"));
        vi.spyOn(c.host.secrets, "saveBasicAuth").mockRejectedValue(new Error("no keyring"));

        await expect(
            c.service.saveTarget(
                toTargetPayload(dev),
                { authType: "basic", username: "u", password: "literal" },
                "dev",
                DOC_DIR,
            ),
        ).rejects.toThrow("no keyring");

        expect(c.host.workspace.files.get(FILE_PATH)).toBe(fileWith(dev));
        await expect(c.service.getCredentials(named(dev))).resolves.toEqual(
            new BasicAuth("u", "${env:MIRAGON_PW}"),
        );
    });
});

describe("DeploymentTargetService.createTarget", () => {
    it("writes the appended file, stores secrets under the slot, and activates", async () => {
        const c = createService({ files: { [FILE_PATH]: fileWith(target("prod")) } });
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);

        await c.service.createTarget(
            {
                name: "dev",
                engine: "c7",
                endpoint: "http://h",
                tenantId: "",
                authType: "basic",
            },
            { authType: "basic", username: "u", password: "p" },
            DOC_DIR,
        );

        const written = c.host.workspace.files.get(FILE_PATH);
        expect(written).toContain('"prod"');
        expect(written).toContain('"dev"');
        await expect(c.host.secrets.getBasicAuth(slot("dev"))).resolves.toEqual({
            username: "u",
            password: "p",
        });
        expect(c.host.deploymentState.load().activeTargetName).toBe("dev");
    });

    it("throws and writes nothing when the name already exists", async () => {
        const existing = fileWith(target("dev"));
        const c = createService({ files: { [FILE_PATH]: existing } });
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);

        await expect(
            c.service.createTarget(
                {
                    name: "dev",
                    engine: "c7",
                    endpoint: "http://h",
                    tenantId: "",
                    authType: "basic",
                },
                { authType: "basic", username: "u", password: "p" },
                DOC_DIR,
            ),
        ).rejects.toThrow(/already exists/);
        expect(c.host.workspace.files.get(FILE_PATH)).toBe(existing);
        await expect(c.host.secrets.getBasicAuth(slot("dev"))).resolves.toBeUndefined();
        expect(c.host.deploymentState.load().activeTargetName).toBe("");
    });

    it("writes a padded whole-value credential ref to the JSON trimmed and stores it as typed", async () => {
        const c = serviceWithTargetsFile();

        await c.service.createTarget(
            { name: "dev", engine: "c7", endpoint: "http://h", tenantId: "", authType: "basic" },
            { authType: "basic", username: " ${env:MIRAGON_USER}", password: "p" },
            DOC_DIR,
        );

        expect(writtenTarget(c, "dev").auth).toEqual({
            type: "basic",
            username: "${env:MIRAGON_USER}",
        });
        await expect(c.host.secrets.getBasicAuth(slot("dev"))).resolves.toEqual({
            username: " ${env:MIRAGON_USER}",
            password: "p",
        });
    });

    it("rejects a foreign credential ref and writes nothing", async () => {
        const c = serviceWithTargetsFile();

        const creating = c.service.createTarget(
            { name: "dev", engine: "c7", endpoint: "http://h", tenantId: "", authType: "basic" },
            { authType: "basic", username: "admin", password: "${env:GITHUB_TOKEN}" },
            DOC_DIR,
        );

        await expect(creating).rejects.toBeInstanceOf(DisallowedEnvReferenceError);
        await expect(creating).rejects.toMatchObject({ field: "auth.password" });
        await expectNothingPersisted(c);
    });
});

describe("DeploymentTargetService.deleteTarget", () => {
    it("removes the target, deletes its slot, and clears the active target", async () => {
        const c = createService({
            files: { [FILE_PATH]: fileWith(target("dev"), target("prod")) },
        });
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);
        c.host.deploymentState.seed({ activeTargetName: "dev" });
        await c.host.secrets.saveBasicAuth("u", "p", slot("dev"));

        await c.service.deleteTarget("dev", DOC_DIR);

        expect(c.host.picker.prompts).toEqual([
            { method: "confirm", args: [deleteTargetConfirmation("dev")] },
        ]);
        const written = c.host.workspace.files.get(FILE_PATH);
        expect(written).not.toContain('"dev"');
        await expect(c.host.secrets.getBasicAuth(slot("dev"))).resolves.toBeUndefined();
        expect(c.host.deploymentState.load().activeTargetName).toBe("");
    });

    it("returns a removed change carrying the deleted target", async () => {
        const dev = target("dev", { tenantId: "saved" });
        const c = serviceWithTargetsFile(fileWith(dev, target("prod")));

        const edit = await c.service.deleteTarget("dev", DOC_DIR);

        expect({ kind: edit?.change.kind, before: edit?.change.before }).toEqual({
            kind: "removed",
            before: dev,
        });
        expect(edit?.retiredDestination).toEqual(named(dev));
    });

    it("is a no-op when the user cancels the confirm", async () => {
        const existing = fileWith(target("dev"));
        const c = createService({ files: { [FILE_PATH]: existing }, promptAnswers: {} });
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);

        expect(await c.service.deleteTarget("dev", DOC_DIR)).toBeUndefined();
        expect(c.host.workspace.files.get(FILE_PATH)).toBe(existing);
    });
});

describe("DeploymentTargetService.getActiveTarget", () => {
    it("returns undefined for a dangling active name", async () => {
        const c = createService({ files: { [FILE_PATH]: fileWith(target("dev")) } });
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);
        c.host.deploymentState.seed({ activeTargetName: "gone" });

        expect(await c.service.getActiveTarget(DOC_DIR)).toBeUndefined();
    });
});

describe("DeploymentTargetService.getActiveDestination", () => {
    const remembered = new AdHocDestination("https://remembered.example/engine-rest", "acme");

    function serviceRemembering(activeTargetName: string) {
        const c = serviceWithTargetsFile(fileWith(target("dev")));
        const { endpoint, tenantId } = remembered;
        c.host.deploymentState.seed({ endpoint, tenantId, activeTargetName });
        return c;
    }

    it("returns the active target at the file it was read from", async () => {
        const c = serviceRemembering("dev");

        await expect(c.service.getActiveDestination(DOC_DIR)).resolves.toEqual(
            named(target("dev")),
        );
    });

    it("returns the remembered ad-hoc connection in ad-hoc mode without reading the file", async () => {
        const c = serviceRemembering("");

        await expect(c.service.getActiveDestination(DOC_DIR)).resolves.toEqual(remembered);
        expect(c.artifactService.findConfigBaseDir).not.toHaveBeenCalled();
    });

    it("falls back to the remembered ad-hoc connection for a dangling active name", async () => {
        const c = serviceRemembering("gone");

        await expect(c.service.getActiveDestination(DOC_DIR)).resolves.toEqual(remembered);
    });

    it("reports an unreadable file and falls back to the remembered ad-hoc connection", async () => {
        const c = serviceRemembering("dev");
        c.host.workspace.files.set(FILE_PATH, "{ not valid json");

        await expect(c.service.getActiveDestination(DOC_DIR)).resolves.toEqual(remembered);
        expect(c.host.notifier.errors).toEqual([
            expect.stringMatching(/^Could not read deployment targets\n/),
        ]);
    });
});

describe("DeploymentTargetService.switchActiveTarget", () => {
    it("is a no-op on dismissal", async () => {
        const c = createService();
        c.host.deploymentState.seed({ activeTargetName: "prod" });

        await c.service.switchActiveTarget(DOC_DIR);

        expect(c.host.picker.prompts).toEqual([
            { method: "choose", args: [deploymentTargetPrompt([])] },
        ]);
        expect(c.host.deploymentState.load().activeTargetName).toBe("prod");
    });

    it("persists the picked target", async () => {
        const c = createService({
            files: { [FILE_PATH]: fileWith(target("dev"), target("prod")) },
            promptAnswers: { deploymentTarget: "dev" },
        });
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);

        await c.service.switchActiveTarget(DOC_DIR);

        expect(c.host.picker.prompts).toEqual([
            { method: "choose", args: [deploymentTargetPrompt(["dev", "prod"])] },
        ]);
        expect(c.host.deploymentState.load().activeTargetName).toBe("dev");
    });

    it("switches to the form values when the user picks them", async () => {
        const c = createService({
            files: { [FILE_PATH]: fileWith(target("dev")) },
            promptAnswers: { deploymentTarget: "" },
        });
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);
        c.host.deploymentState.seed({ activeTargetName: "dev" });

        await c.service.switchActiveTarget(DOC_DIR);

        expect(c.host.deploymentState.load().activeTargetName).toBe("");
    });
});

describe("DeploymentTargetService.onDidChange", () => {
    const noAuth: AuthConfigPayload = { authType: "none" };
    const payloadOf = (name: string) => toTargetPayload(target(name));

    const DEFAULT_ANSWERS: PromptAnswers = { deleteTarget: true, deploymentTarget: "prod" };

    /** `dev`, the active target, and `prod`; deletes are confirmed and the picker picks `prod`. */
    function listeningService(promptAnswers: PromptAnswers = DEFAULT_ANSWERS) {
        const c = createService({
            files: { [FILE_PATH]: fileWith(target("dev"), target("prod")) },
            promptAnswers,
        });
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);
        c.host.deploymentState.seed({ activeTargetName: "dev" });
        const events: DeploymentTargetsEvent[] = [];
        c.service.onDidChange((event) => void events.push(event));
        return { ...c, events };
    }

    const targetsChanged = (edit: TargetEdit | undefined): DeploymentTargetsEvent => {
        if (edit === undefined) throw new Error("the edit was not made");
        return { kind: "targetsChanged", edit, documentDir: DOC_DIR };
    };

    it.each<{
        mutation: string;
        change: (service: DeploymentTargetService) => Promise<DeploymentTargetsEvent>;
    }>([
        {
            mutation: "a create",
            change: async (service) =>
                targetsChanged(await service.createTarget(payloadOf("staging"), noAuth, DOC_DIR)),
        },
        {
            mutation: "a save",
            change: async (service) =>
                targetsChanged(await service.saveTarget(payloadOf("dev"), noAuth, "dev", DOC_DIR)),
        },
        {
            mutation: "a rename",
            change: async (service) =>
                targetsChanged(
                    await service.saveTarget(payloadOf("staging"), noAuth, "dev", DOC_DIR),
                ),
        },
        {
            mutation: "a delete",
            change: async (service) => targetsChanged(await service.deleteTarget("dev", DOC_DIR)),
        },
        {
            mutation: "a picked switch",
            change: async (service) => {
                await service.switchActiveTarget(DOC_DIR);
                return { kind: "activeTargetChanged", activeName: "prod" };
            },
        },
        {
            mutation: "a select",
            change: async (service) => {
                await service.setActiveTarget(" prod ");
                return { kind: "activeTargetChanged", activeName: "prod" };
            },
        },
    ])("notifies listeners once with the change after $mutation", async ({ change }) => {
        const c = listeningService();

        const expected = await change(c.service);

        expect(c.events).toEqual([expected]);
    });

    it.each<{
        mutation: string;
        promptAnswers?: PromptAnswers;
        attempt: (service: DeploymentTargetService) => Promise<unknown>;
    }>([
        {
            mutation: "a rejected create",
            attempt: (service) => service.createTarget(payloadOf("dev"), noAuth, DOC_DIR),
        },
        {
            mutation: "a rejected rename",
            attempt: (service) => service.saveTarget(payloadOf("prod"), noAuth, "dev", DOC_DIR),
        },
        {
            mutation: "a cancelled delete",
            promptAnswers: { deleteTarget: false },
            attempt: (service) => service.deleteTarget("dev", DOC_DIR),
        },
        {
            mutation: "a dismissed picker",
            promptAnswers: {},
            attempt: (service) => service.switchActiveTarget(DOC_DIR),
        },
    ])("never notifies for $mutation", async ({ promptAnswers, attempt }) => {
        const c = listeningService(promptAnswers);

        await attempt(c.service).catch(() => undefined);

        expect(c.events).toEqual([]);
    });

    it("notifies the listeners in subscription order, each after the previous one settled", async () => {
        const c = createService();
        const calls: string[] = [];
        let settleFirst: () => void = () => undefined;
        c.service.onDidChange(
            () =>
                new Promise<void>((resolve) => {
                    calls.push("first notified");
                    settleFirst = () => {
                        calls.push("first settled");
                        resolve();
                    };
                }),
        );
        c.service.onDidChange(() => void calls.push("second notified"));

        const selecting = c.service.setActiveTarget("prod");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(calls).toEqual(["first notified"]);
        settleFirst();
        await selecting;

        expect(calls).toEqual(["first notified", "first settled", "second notified"]);
    });

    it("logs a failing listener and still notifies the next one", async () => {
        const c = createService();
        const events: DeploymentTargetsEvent[] = [];
        c.service.onDidChange(() => {
            throw new Error("status bar is gone");
        });
        c.service.onDidChange(async () => {
            throw new Error("panel is gone");
        });
        c.service.onDidChange((event) => void events.push(event));

        await expect(c.service.setActiveTarget("prod")).resolves.toBeUndefined();

        expect(events).toEqual([{ kind: "activeTargetChanged", activeName: "prod" }]);
        expect(c.host.notifier.loggedErrors.map((error) => error.message)).toEqual([
            "status bar is gone",
            "panel is gone",
        ]);
    });

    it("stops notifying a listener once its subscription is disposed", async () => {
        const c = createService();
        const events: DeploymentTargetsEvent[] = [];
        c.service.onDidChange((event) => void events.push(event)).dispose();

        await c.service.setActiveTarget("prod");

        expect(events).toEqual([]);
    });
});

describe("DeploymentTargetService.getStoredCredentials", () => {
    it("resolves oauth2 secrets plus the target's token endpoint and audience", async () => {
        const c = createService({
            files: {
                [FILE_PATH]: fileWith(
                    target("dev", {
                        authType: "oauth2",
                        tokenEndpoint: "https://idp/token",
                        audience: "aud",
                    }),
                ),
            },
        });
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);
        await c.host.secrets.saveOAuth2("cid", "sec", slot("dev"));

        await expect(c.service.getStoredCredentials("dev", DOC_DIR)).resolves.toEqual({
            authType: "oauth2",
            clientId: "cid",
            clientSecret: "sec",
            tokenEndpoint: "https://idp/token",
            audience: "aud",
        });
    });

    it("drops a ref that a teammate removed from the file even though the store still holds it", async () => {
        const c = serviceWithTargetsFile(fileWith(target("dev", { authType: "basic" })));
        await c.host.secrets.saveBasicAuth("${env:MIRAGON_USER}", "s3cret", slot("dev"));

        await expect(c.service.getStoredCredentials("dev", DOC_DIR)).resolves.toEqual({
            authType: "basic",
            username: "",
            password: "s3cret",
        });
    });

    it("returns a none payload for an unknown target", async () => {
        const c = createService({ files: { [FILE_PATH]: fileWith(target("dev")) } });
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);

        await expect(c.service.getStoredCredentials("missing", DOC_DIR)).resolves.toEqual({
            authType: "none",
        });
    });

    it("prefers a file credential ref over the secret store (file wins)", async () => {
        const c = serviceWithTargetsFile(
            fileWith(
                target("dev", {
                    authType: "basic",
                    credentialRefs: CredentialRefs.basic(undefined, "${env:MIRAGON_PW}"),
                }),
            ),
        );
        await c.host.secrets.saveBasicAuth("admin", "old-stored", slot("dev"));

        await expect(c.service.getStoredCredentials("dev", DOC_DIR)).resolves.toEqual({
            authType: "basic",
            username: "admin",
            password: "${env:MIRAGON_PW}",
        });
    });

    it("prefers a file credential ref over a stale ref kept in the secret store", async () => {
        const c = serviceWithTargetsFile(
            fileWith(
                target("dev", {
                    authType: "basic",
                    credentialRefs: CredentialRefs.basic("${env:MIRAGON_USER}", undefined),
                }),
            ),
        );
        await c.host.secrets.saveBasicAuth("${env:MIRAGON_OLD_USER}", "s3cret", slot("dev"));

        await expect(c.service.getStoredCredentials("dev", DOC_DIR)).resolves.toEqual({
            authType: "basic",
            username: "${env:MIRAGON_USER}",
            password: "s3cret",
        });
    });

    it("prefills a saved ref username together with its literal password", async () => {
        const c = serviceWithTargetsFile();

        await c.service.saveTarget(
            { name: "dev", engine: "c7", endpoint: "http://h", tenantId: "", authType: "basic" },
            { authType: "basic", username: "${env:MIRAGON_USER}", password: "s3cret" },
            undefined,
            DOC_DIR,
        );

        await expect(c.service.getStoredCredentials("dev", DOC_DIR)).resolves.toEqual({
            authType: "basic",
            username: "${env:MIRAGON_USER}",
            password: "s3cret",
        });
    });

    it("returns only the auth type when neither the file nor the store has basic credentials", async () => {
        const c = serviceWithTargetsFile(fileWith(target("dev", { authType: "basic" })));

        await expect(c.service.getStoredCredentials("dev", DOC_DIR)).resolves.toEqual({
            authType: "basic",
        });
    });

    it("returns the token endpoint and audience when an oauth2 target has no client credentials", async () => {
        const c = serviceWithTargetsFile(
            fileWith(
                target("dev", {
                    authType: "oauth2",
                    tokenEndpoint: "https://idp/token",
                    audience: "aud",
                }),
            ),
        );

        await expect(c.service.getStoredCredentials("dev", DOC_DIR)).resolves.toEqual({
            authType: "oauth2",
            tokenEndpoint: "https://idp/token",
            audience: "aud",
        });
    });
});

describe("toTargetPayload", () => {
    it.each([
        ["none", target("dev"), { authType: "none" }],
        ["basic", target("dev", { authType: "basic" }), { authType: "basic" }],
        [
            "oauth2",
            target("dev", {
                authType: "oauth2",
                tokenEndpoint: "https://idp/token",
                audience: "aud",
            }),
            { authType: "oauth2", tokenEndpoint: "https://idp/token", audience: "aud" },
        ],
    ])("lists a %s target with only the auth settings of its type", (_type, saved, auth) => {
        expect(toTargetPayload(saved)).toEqual({
            name: "dev",
            engine: "c7",
            endpoint: "http://localhost:8080/engine-rest",
            tenantId: "",
            ...auth,
        });
    });

    it("lists the URL overrides", () => {
        expect(
            toTargetPayload(
                target("dev", {
                    deployUrl: "https://gw/deploy",
                    startInstanceUrl: "https://gw/{processDefinitionKey}/start",
                }),
            ),
        ).toMatchObject({
            deployUrl: "https://gw/deploy",
            startInstanceUrl: "https://gw/{processDefinitionKey}/start",
        });
    });
});

describe("DeploymentTargetService.getCredentials", () => {
    it("prefers basic file refs over stored values and falls back to the store per field", async () => {
        const c = serviceWithTargetsFile();
        await c.host.secrets.saveBasicAuth("admin", "old-stored", slot("dev"));
        const refTarget = target("dev", {
            authType: "basic",
            credentialRefs: CredentialRefs.basic(undefined, "${env:MIRAGON_PW}"),
        });

        await expect(c.service.getCredentials(named(refTarget))).resolves.toEqual(
            new BasicAuth("admin", "${env:MIRAGON_PW}"),
        );
    });

    it("prefers oauth2 file refs over stored values and keeps the target's token metadata", async () => {
        const c = serviceWithTargetsFile();
        await c.host.secrets.saveOAuth2("cid", "old-stored", slot("dev"));
        const refTarget = target("dev", {
            authType: "oauth2",
            tokenEndpoint: "https://idp/token",
            audience: "aud",
            credentialRefs: CredentialRefs.oauth2(undefined, "${env:MIRAGON_SECRET}"),
        });

        await expect(c.service.getCredentials(named(refTarget))).resolves.toEqual(
            new OAuth2Auth("cid", "${env:MIRAGON_SECRET}", "https://idp/token", "aud"),
        );
    });

    it("uses the stored literals of a target without refs", async () => {
        const c = serviceWithTargetsFile();
        await c.host.secrets.saveBasicAuth("u", "p", slot("dev"));

        await expect(
            c.service.getCredentials(named(target("dev", { authType: "basic" }))),
        ).resolves.toEqual(new BasicAuth("u", "p"));
    });

    it.each(["basic", "oauth2"] as const)(
        "falls back to no auth when a %s target has neither refs nor stored credentials",
        async (authType) => {
            const c = serviceWithTargetsFile();

            await expect(
                c.service.getCredentials(named(target("dev", { authType }))),
            ).resolves.toBeInstanceOf(NoAuth);
        },
    );

    it.each([
        ["basic", "getBasicAuth"],
        ["oauth2", "getOAuth2"],
    ] as const)(
        "rejects instead of falling back to no auth when the store cannot read a %s target's secrets",
        async (authType, read) => {
            const c = serviceWithTargetsFile();
            const unavailable = new Error("The OS keyring is not available.");
            vi.spyOn(c.host.secrets, read).mockRejectedValue(unavailable);

            await expect(c.service.getCredentials(named(target("dev", { authType })))).rejects.toBe(
                unavailable,
            );
        },
    );

    it("returns no auth for a none target without consulting the store", async () => {
        const c = serviceWithTargetsFile();
        const getBasicAuth = vi.spyOn(c.host.secrets, "getBasicAuth");
        const getOAuth2 = vi.spyOn(c.host.secrets, "getOAuth2");

        await expect(c.service.getCredentials(named(target("dev")))).resolves.toBeInstanceOf(
            NoAuth,
        );
        expect(getBasicAuth).not.toHaveBeenCalled();
        expect(getOAuth2).not.toHaveBeenCalled();
    });
});

describe("DeploymentTargetService.resolveDestination", () => {
    const adHoc = new AdHocDestination("https://typed.example/engine-rest", "");

    it("selects the ad-hoc connection for a blank name without reading the file", async () => {
        const c = serviceWithTargetsFile("{ not valid json");

        await expect(c.service.resolveDestination(" ", adHoc, DOC_DIR)).resolves.toBe(adHoc);
        expect(c.artifactService.findConfigBaseDir).not.toHaveBeenCalled();
    });

    it("resolves a saved target at the file it was read from, keyed by its slot", async () => {
        const c = serviceWithTargetsFile(fileWith(target("dev")));

        const destination = await c.service.resolveDestination("dev", adHoc, DOC_DIR);

        expect(destination).toEqual(named(target("dev")));
        expect((destination as NamedDestination).secretSlot).toBe(slot("dev"));
    });

    it("resolves a name the file no longer holds as unknown", async () => {
        const c = serviceWithTargetsFile(fileWith(target("dev")));

        await expect(c.service.resolveDestination("gone", adHoc, DOC_DIR)).resolves.toEqual(
            new UnknownTarget("gone"),
        );
    });

    it("rejects when the file cannot be read, unlike the sidebar", async () => {
        const c = serviceWithTargetsFile("{ not valid json");

        await expect(c.service.resolveDestination("dev", adHoc, DOC_DIR)).rejects.toThrow();
        expect(c.host.notifier.errors).toEqual([]);
    });
});

describe("DeploymentTargetService approved credential destinations", () => {
    const DEV_SLOT = slot("dev");
    const BASIC_AUTH: AuthConfigPayload = { authType: "basic", username: "u", password: "p" };

    function serviceWithTargets(...targets: DeploymentTarget[]) {
        return serviceWithTargetsFile(fileWith(...targets));
    }

    async function seedApprovals(
        c: ReturnType<typeof createService>,
        approvals: Record<string, string[]>,
    ): Promise<void> {
        for (const [approvedSlot, origins] of Object.entries(approvals)) {
            await c.host.secrets.saveApprovedDestinations(approvedSlot, origins);
        }
    }

    const approvalsOf = (c: ReturnType<typeof createService>, approvedSlot: string) =>
        c.host.secrets.getApprovedDestinations(approvedSlot);

    it("approves on create the typed origins of the endpoint, URL overrides and oauth2 token endpoint", async () => {
        const c = serviceWithTargets();
        const oauth = { tokenEndpoint: "https://idp.example.com/oauth/token", audience: "api" };

        await c.service.createTarget(
            {
                name: "dev",
                engine: "c8",
                endpoint: "https://engine.example.com/v2",
                tenantId: "",
                authType: "oauth2",
                ...oauth,
                deployUrl: "https://deploy.example.com:8443/deployments",
                startInstanceUrl:
                    "https://start.example.com/process-definition/key/{processDefinitionKey}/start",
            },
            { authType: "oauth2", clientId: "cid", clientSecret: "secret", ...oauth },
            DOC_DIR,
        );

        await expect(approvalsOf(c, DEV_SLOT)).resolves.toEqual([
            "https://deploy.example.com:8443",
            "https://engine.example.com",
            "https://idp.example.com",
            "https://start.example.com",
        ]);
    });

    it("replaces stale approvals left under the slot instead of inheriting them on create", async () => {
        const c = serviceWithTargets();
        await seedApprovals(c, { [DEV_SLOT]: ["https://stale.example.com"] });

        await c.service.createTarget(
            {
                name: "dev",
                engine: "c7",
                endpoint: "https://engine.example.com/engine-rest",
                tenantId: "",
                authType: "basic",
            },
            BASIC_AUTH,
            DOC_DIR,
        );

        await expect(approvalsOf(c, DEV_SLOT)).resolves.toEqual(["https://engine.example.com"]);
    });

    it("leaves the existing target's approvals untouched when a create collides with its name", async () => {
        const c = serviceWithTargets(
            target("dev", { endpoint: "https://trusted.example.com/engine-rest" }),
        );
        await seedApprovals(c, { [DEV_SLOT]: ["https://trusted.example.com"] });
        const saveApprovedDestinations = vi.spyOn(c.host.secrets, "saveApprovedDestinations");

        await expect(
            c.service.createTarget(
                {
                    name: "dev",
                    engine: "c7",
                    endpoint: "https://evil.example.com/engine-rest",
                    tenantId: "",
                    authType: "basic",
                },
                BASIC_AUTH,
                DOC_DIR,
            ),
        ).rejects.toThrow(/already exists/);
        expect(saveApprovedDestinations).not.toHaveBeenCalled();
        await expect(approvalsOf(c, DEV_SLOT)).resolves.toEqual(["https://trusted.example.com"]);
    });

    it.each([
        "https://${env:MIRAGON_CAMUNDA_HOST}/engine-rest",
        // Parses to engine.example.com, but a value like "evil.example.com/" moves the host.
        "https://${env:MIRAGON_CAMUNDA_USER}@engine.example.com/engine-rest",
    ])("never approves an endpoint holding an env ref at save time: %s", async (endpoint) => {
        const c = serviceWithTargets();

        await c.service.createTarget(
            {
                name: "dev",
                engine: "c7",
                endpoint,
                tenantId: "",
                authType: "basic",
                deployUrl: "https://deploy.example.com/deploy",
            },
            BASIC_AUTH,
            DOC_DIR,
        );

        await expect(approvalsOf(c, DEV_SLOT)).resolves.toEqual(["https://deploy.example.com"]);
    });

    it("re-saves only the inherited approvals when a save changes no destination", async () => {
        const saved = target("dev", {
            authType: "basic",
            endpoint: "https://engine.example.com/engine-rest",
        });
        const c = serviceWithTargets(saved);
        const inherited = ["https://engine.example.com", "https://resolved-from-env.example.com"];
        await seedApprovals(c, { [DEV_SLOT]: inherited });
        const saveApprovedDestinations = vi.spyOn(c.host.secrets, "saveApprovedDestinations");

        await c.service.saveTarget(
            { ...toTargetPayload(saved), tenantId: "tenant-a" },
            BASIC_AUTH,
            "dev",
            DOC_DIR,
        );

        expect(saveApprovedDestinations).toHaveBeenCalledExactlyOnceWith(DEV_SLOT, inherited);
        await expect(approvalsOf(c, DEV_SLOT)).resolves.toEqual(inherited);
    });

    it("approves a new endpoint host typed into the form and keeps the inherited approvals", async () => {
        const saved = target("dev", {
            authType: "basic",
            endpoint: "https://old.example.com/engine-rest",
        });
        const c = serviceWithTargets(saved);
        await seedApprovals(c, { [DEV_SLOT]: ["https://old.example.com"] });

        await c.service.saveTarget(
            { ...toTargetPayload(saved), endpoint: "https://new.example.com/engine-rest" },
            BASIC_AUTH,
            "dev",
            DOC_DIR,
        );

        await expect(approvalsOf(c, DEV_SLOT)).resolves.toEqual([
            "https://new.example.com",
            "https://old.example.com",
        ]);
    });

    it("does not approve a committed host the form merely carried over from the file", async () => {
        const committedByTeammate = target("dev", {
            authType: "basic",
            endpoint: "https://evil.example.com/engine-rest",
        });
        const c = serviceWithTargets(committedByTeammate);
        await seedApprovals(c, { [DEV_SLOT]: ["https://trusted.example.com"] });

        await c.service.saveTarget(
            {
                ...toTargetPayload(committedByTeammate),
                tenantId: "tenant-a",
                deployUrl: "https://deploy.trusted.example.com/deploy",
            },
            BASIC_AUTH,
            "dev",
            DOC_DIR,
        );

        await expect(approvalsOf(c, DEV_SLOT)).resolves.toEqual([
            "https://deploy.trusted.example.com",
            "https://trusted.example.com",
        ]);
    });

    describe("when New starts the form from another committed target", () => {
        const PROD_SLOT = slot("prod");
        const PROD_B_SLOT = slot("prod-b");
        const committedProd = target("prod", {
            authType: "basic",
            endpoint: "https://prod.example.com/engine-rest",
            deployUrl: "https://attacker.example.com/deploy",
        });

        it("approves none of that target's hosts for the new target", async () => {
            const c = serviceWithTargets(committedProd);
            await seedApprovals(c, { [PROD_SLOT]: ["https://prod.example.com"] });

            await c.service.createTarget(
                { ...toTargetPayload(committedProd), name: "prod-b" },
                BASIC_AUTH,
                DOC_DIR,
            );

            await expect(approvalsOf(c, PROD_B_SLOT)).resolves.toEqual([]);
            await expect(approvalsOf(c, PROD_SLOT)).resolves.toEqual(["https://prod.example.com"]);
        });

        it("approves a host the user typed over the prefill, and only that one", async () => {
            const c = serviceWithTargets(committedProd);
            await seedApprovals(c, { [PROD_SLOT]: ["https://prod.example.com"] });

            await c.service.createTarget(
                {
                    ...toTargetPayload(committedProd),
                    name: "prod-b",
                    endpoint: "https://prod-b.example.com/engine-rest",
                },
                BASIC_AUTH,
                DOC_DIR,
            );

            await expect(approvalsOf(c, PROD_B_SLOT)).resolves.toEqual([
                "https://prod-b.example.com",
            ]);
        });
    });

    it("does not approve a host another committed target already names when a save switches to it", async () => {
        const saved = target("dev", {
            authType: "basic",
            endpoint: "https://dev.example.com/engine-rest",
        });
        const committedStaging = target("staging", {
            authType: "basic",
            endpoint: "https://staging.example.com/engine-rest",
        });
        const c = serviceWithTargets(saved, committedStaging);
        await seedApprovals(c, { [DEV_SLOT]: ["https://dev.example.com"] });

        await c.service.saveTarget(
            {
                ...toTargetPayload(saved),
                endpoint: "https://staging.example.com/engine-rest",
            },
            BASIC_AUTH,
            "dev",
            DOC_DIR,
        );

        await expect(approvalsOf(c, DEV_SLOT)).resolves.toEqual(["https://dev.example.com"]);
    });

    it("does not approve a token endpoint hidden under a basic target once the form switches it to oauth2", async () => {
        const c = serviceWithTargetsFile(
            JSON.stringify({
                targets: [
                    {
                        name: "dev",
                        engine: "c8",
                        endpoint: "https://trusted.example.com/v2",
                        tenantId: "",
                        auth: { type: "basic", tokenEndpoint: "https://evil.example.com/token" },
                    },
                ],
            }),
        );
        await seedApprovals(c, { [DEV_SLOT]: ["https://trusted.example.com"] });
        const [committedByTeammate] = await c.service.listTargets(DOC_DIR);
        const formPayload = {
            ...toTargetPayload(committedByTeammate),
            authType: "oauth2" as const,
        };

        await c.service.saveTarget(
            formPayload,
            {
                authType: "oauth2",
                clientId: "cid",
                clientSecret: "secret",
                tokenEndpoint: formPayload.tokenEndpoint,
                audience: "",
            },
            "dev",
            DOC_DIR,
        );

        await expect(approvalsOf(c, DEV_SLOT)).resolves.toEqual(["https://trusted.example.com"]);
    });

    it("carries the approvals of the old slot to the renamed target and drops the old slot", async () => {
        const OLD_SLOT = slot("old");
        const NEW_SLOT = slot("new");
        const saved = target("old", {
            authType: "basic",
            endpoint: "https://engine.example.com/engine-rest",
        });
        const c = serviceWithTargets(saved);
        await seedApprovals(c, {
            [OLD_SLOT]: ["https://engine.example.com"],
            [NEW_SLOT]: ["https://stale.example.com"],
        });
        const deleteSlot = vi.spyOn(c.host.secrets, "delete");

        await c.service.saveTarget(
            { ...toTargetPayload(saved), name: "new" },
            BASIC_AUTH,
            "old",
            DOC_DIR,
        );

        await expect(approvalsOf(c, NEW_SLOT)).resolves.toEqual(["https://engine.example.com"]);
        expect(deleteSlot).toHaveBeenCalledWith(OLD_SLOT);
        await expect(approvalsOf(c, OLD_SLOT)).resolves.toEqual([]);
    });
});
