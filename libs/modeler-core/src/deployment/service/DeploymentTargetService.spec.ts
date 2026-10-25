import { describe, expect, it, vi } from "vitest";

import { AuthConfigPayload, DeploymentTargetPayload } from "@miragon/bpmn-modeler-shared";

import { DisallowedEnvReferenceError } from "../../shared/domain/errors";
import { createTestHost, TestHostOptions } from "../../testing";
import { CredentialRefs } from "../domain/credentialRefs";
import { BasicAuth, NoAuth, OAuth2Auth } from "../domain/deployment";
import { serializeDeploymentTargets, DeploymentTarget } from "../domain/deploymentTarget";
import { DeploymentTargetService, toTargetPayload } from "./DeploymentTargetService";

const CONFIG_FOLDER = ".camunda";
const TARGETS_FILE_NAME = "deployment-targets.json";
const WORKSPACE_ROOT = "/ws";
const FILE_PATH = `${WORKSPACE_ROOT}/${CONFIG_FOLDER}/${TARGETS_FILE_NAME}`;
const DOC_DIR = "/ws/src";

function fileWith(...targets: DeploymentTarget[]): string {
    return serializeDeploymentTargets(targets);
}

function target(name: string, overrides: Partial<DeploymentTarget> = {}): DeploymentTarget {
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
        answers: { confirmDestructive: true },
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
    expect(c.host.deploymentState.activeTargetName).toBe("");
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
        c.host.deploymentState.activeTargetName = "old";
    }

    async function expectOldTargetUntouched(c: ReturnType<typeof createService>) {
        await expect(c.host.secrets.getBasicAuth(slot("old"))).resolves.toEqual({
            username: "old-user",
            password: "old-pass",
        });
        expect(c.host.deploymentState.activeTargetName).toBe("old");
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
        c.host.deploymentState.activeTargetName = "old";
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
        expect(c.host.deploymentState.activeTargetName).toBe("old");
    });

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
        expect(c.host.deploymentState.activeTargetName).toBe("dev");
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
        expect(c.host.deploymentState.activeTargetName).toBe("dev");
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
        expect(c.host.deploymentState.activeTargetName).toBe("");
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

it("returns OAuth metadata even when this machine has no credentials", async () => {
    const c = createService({
        files: {
            [FILE_PATH]: fileWith(
                target("shared", {
                    authType: "oauth2",
                    tokenEndpoint: "https://login/token",
                    audience: "api",
                }),
            ),
        },
    });
    c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);
    expect(await c.service.getStoredCredentials("shared", DOC_DIR)).toEqual({
        authType: "oauth2",
        tokenEndpoint: "https://login/token",
        audience: "api",
    });
});

describe("DeploymentTargetService.deleteTarget", () => {
    it("removes the target, deletes its slot, and clears the active target", async () => {
        const c = createService({
            files: { [FILE_PATH]: fileWith(target("dev"), target("prod")) },
        });
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);
        c.host.deploymentState.activeTargetName = "dev";
        await c.host.secrets.saveBasicAuth("u", "p", slot("dev"));

        const deleted = await c.service.deleteTarget("dev", DOC_DIR);

        expect(deleted).toBe(true);
        const written = c.host.workspace.files.get(FILE_PATH);
        expect(written).not.toContain('"dev"');
        await expect(c.host.secrets.getBasicAuth(slot("dev"))).resolves.toBeUndefined();
        expect(c.host.deploymentState.activeTargetName).toBe("");
    });

    it("is a no-op when the user cancels the confirm", async () => {
        const existing = fileWith(target("dev"));
        const c = createService({ files: { [FILE_PATH]: existing }, answers: {} });
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);

        expect(await c.service.deleteTarget("dev", DOC_DIR)).toBe(false);
        expect(c.host.workspace.files.get(FILE_PATH)).toBe(existing);
    });
});

describe("DeploymentTargetService.getActiveTarget", () => {
    it("returns undefined for a dangling active name", async () => {
        const c = createService({ files: { [FILE_PATH]: fileWith(target("dev")) } });
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);
        c.host.deploymentState.activeTargetName = "gone";

        expect(await c.service.getActiveTarget(DOC_DIR)).toBeUndefined();
    });
});

describe("DeploymentTargetService.switchActiveTarget", () => {
    it("is a no-op on dismissal", async () => {
        const c = createService();
        c.host.deploymentState.activeTargetName = "prod";

        await c.service.switchActiveTarget(DOC_DIR);

        expect(c.host.deploymentState.activeTargetName).toBe("prod");
    });

    it("persists the picked target", async () => {
        const c = createService({
            files: { [FILE_PATH]: fileWith(target("dev")) },
            answers: { deploymentTarget: "dev" },
        });
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);

        await c.service.switchActiveTarget(DOC_DIR);

        expect(c.host.deploymentState.activeTargetName).toBe("dev");
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
});

describe("DeploymentTargetService.getCredentials", () => {
    it("prefers basic file refs over stored values and falls back to the store per field", async () => {
        const c = serviceWithTargetsFile();
        await c.host.secrets.saveBasicAuth("admin", "old-stored", slot("dev"));
        const refTarget = target("dev", {
            authType: "basic",
            credentialRefs: CredentialRefs.basic(undefined, "${env:MIRAGON_PW}"),
        });

        await expect(c.service.getCredentials(refTarget, DOC_DIR)).resolves.toEqual(
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

        await expect(c.service.getCredentials(refTarget, DOC_DIR)).resolves.toEqual(
            new OAuth2Auth("cid", "${env:MIRAGON_SECRET}", "https://idp/token", "aud"),
        );
    });

    it("uses the stored literals of a target without refs", async () => {
        const c = serviceWithTargetsFile();
        await c.host.secrets.saveBasicAuth("u", "p", slot("dev"));

        await expect(
            c.service.getCredentials(target("dev", { authType: "basic" }), DOC_DIR),
        ).resolves.toEqual(new BasicAuth("u", "p"));
    });

    it.each(["basic", "oauth2"] as const)(
        "falls back to no auth when a %s target has neither refs nor stored credentials",
        async (authType) => {
            const c = serviceWithTargetsFile();

            await expect(
                c.service.getCredentials(target("dev", { authType }), DOC_DIR),
            ).resolves.toBeInstanceOf(NoAuth);
        },
    );

    it("returns no auth for a none target without consulting the store", async () => {
        const c = serviceWithTargetsFile();
        const getBasicAuth = vi.spyOn(c.host.secrets, "getBasicAuth");
        const getOAuth2 = vi.spyOn(c.host.secrets, "getOAuth2");

        await expect(c.service.getCredentials(target("dev"), DOC_DIR)).resolves.toBeInstanceOf(
            NoAuth,
        );
        expect(getBasicAuth).not.toHaveBeenCalled();
        expect(getOAuth2).not.toHaveBeenCalled();
    });
});

describe("DeploymentTargetService.resolveSlot", () => {
    it("returns undefined for ad-hoc mode", async () => {
        const c = createService();
        expect(await c.service.resolveSlot("", DOC_DIR)).toBeUndefined();
    });

    it("returns the slot for a named target", async () => {
        const c = createService();
        c.artifactService.findConfigBaseDir.mockResolvedValue(WORKSPACE_ROOT);

        expect(await c.service.resolveSlot("dev", DOC_DIR)).toBe(`${FILE_PATH}::dev`);
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
