import { describe, expect, it, vi } from "vitest";

import { createTestHost, PickerAnswers } from "../../testing";
import { CredentialRefs } from "../domain/credentialRefs";
import { DeploymentTarget } from "../domain/deploymentTarget";
import {
    contentFingerprint,
    DeploymentTargetIdentity,
    ledgerKeyFor,
} from "../domain/deploymentLedger";
import { EnvLookup, NO_ENV_VARIABLES } from "../domain/envRef";
import { DeploymentStatusService } from "./DeploymentStatusService";
import { EnvValueResolver } from "./EnvValueResolver";

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

const FILE_PATH = "/work/order-process.bpmn";
const WORKSPACE_DOT_ENV = "/work/.env";
const LITERAL_ENDPOINT = "http://localhost:8080/engine-rest";
const PROD_URL = "https://prod.example.com/engine-rest";
const PROD_HOST = "prod.example.com";
const PROD_DOT_ENV = { MIRAGON_URL: PROD_URL };
const lookupOf =
    (dotEnv: Record<string, string>): EnvLookup =>
    (name) =>
        dotEnv[name];
const target = (name: string): DeploymentTarget =>
    new DeploymentTarget(name, "c7", LITERAL_ENDPOINT, "", "none", "", "");
const endpointRefTarget = (): DeploymentTarget =>
    new DeploymentTarget("dev", "c7", "${env:MIRAGON_URL}", "", "none", "", "");
const credentialRefTarget = (): DeploymentTarget =>
    new DeploymentTarget(
        "dev",
        "c7",
        LITERAL_ENDPOINT,
        "",
        "basic",
        "",
        "",
        undefined,
        undefined,
        CredentialRefs.basic(undefined, "${env:MIRAGON_PW}"),
    );
const tenantRefTarget = (): DeploymentTarget =>
    new DeploymentTarget("dev", "c7", LITERAL_ENDPOINT, "${env:MIRAGON_TENANT}", "none", "", "");
const urlRefTarget = (): DeploymentTarget =>
    new DeploymentTarget(
        "dev",
        "c7",
        LITERAL_ENDPOINT,
        "",
        "none",
        "",
        "",
        "${env:MIRAGON_DEPLOY_URL}",
        "${env:MIRAGON_START_URL}",
    );
const NESTED_PROJECT_DIR = "/work/team";

function dotEnvContent(dotEnv: Record<string, string>): string {
    return Object.entries(dotEnv)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");
}

interface ServiceOptions {
    answers?: PickerAnswers;
    /** Variables of each `.env`, keyed by its path. */
    dotEnvs?: Record<string, Record<string, string>>;
    filePath?: string;
    /** Project directory of the targets file in use. */
    projectDir?: string;
}

const workspaceDotEnv = (dotEnv: Record<string, string>): ServiceOptions => ({
    dotEnvs: { [WORKSPACE_DOT_ENV]: dotEnv },
});

/** Workspace folder `/work` holding a nested project whose targets file is the one in use. */
const nestedProject = (dotEnvs: Record<string, Record<string, string>>): ServiceOptions => ({
    dotEnvs,
    filePath: `${NESTED_PROJECT_DIR}/order-process.bpmn`,
    projectDir: NESTED_PROJECT_DIR,
});

function createService({
    answers = {},
    dotEnvs = {},
    filePath = FILE_PATH,
    projectDir = "/work",
}: ServiceOptions = {}) {
    const files = Object.fromEntries(
        Object.entries(dotEnvs).map(([path, dotEnv]) => [path, dotEnvContent(dotEnv)]),
    );
    const host = createTestHost({ answers, folders: ["/work"], files });
    const editor = host.openEditor(filePath, "<a/>");
    const deploymentTargetService = {
        getActiveTarget: vi.fn().mockResolvedValue(undefined),
        locateTargetsFile: vi.fn().mockResolvedValue({
            filePath: `${projectDir}/.camunda/deployment-targets.json`,
            exists: true,
            projectDir,
        }),
    };
    const dotEnvIo = {
        isSymbolicLink: vi.spyOn(host.workspace, "isSymbolicLink"),
        readFile: vi.spyOn(host.workspace, "readFile"),
    };

    const service = new DeploymentStatusService(
        host.store,
        host.documents,
        deploymentTargetService as never,
        host.deploymentState,
        host.statusBar,
        host.picker,
        host.notifier,
        new EnvValueResolver(deploymentTargetService as never, host.workspace),
    );

    return { service, host, editor, deploymentTargetService, dotEnvIo };
}

type ServiceContext = ReturnType<typeof createService>;

const UNREADABLE_DOT_ENVS: [string, (c: ServiceContext) => void][] = [
    ["symlinked", (c) => c.host.workspace.symbolicLinks.add(WORKSPACE_DOT_ENV)],
    [
        "a directory",
        (c) => c.dotEnvIo.readFile.mockRejectedValue(new Error("EISDIR: illegal operation")),
    ],
];

function useAdHocConnection(c: ServiceContext, endpoint: string, tenantId: string): void {
    c.host.deploymentState.endpoint = endpoint;
    c.host.deploymentState.tenantId = tenantId;
}

const RECORDED_REVISION = {
    fingerprint: contentFingerprint("<a/>"),
    deployedAt: "2026-09-17T14:32:00.000Z",
};

/** The item shows this revision only if refresh reads the ledger under `ledgerKey`. */
async function recordRevisionUnder(c: ServiceContext, ledgerKey: string): Promise<void> {
    await c.host.deploymentState.saveDeployedRevision(ledgerKey, RECORDED_REVISION);
}

function expectRecordedRevisionShown(c: ServiceContext, targetName: string | undefined): void {
    expect(c.host.statusBar.deploymentTarget).toEqual({
        name: targetName,
        freshness: "deployed",
        deployedAt: RECORDED_REVISION.deployedAt,
        verifiedAt: undefined,
    });
}

function expectNoDotEnvIo(c: ServiceContext): void {
    expect(c.deploymentTargetService.locateTargetsFile).not.toHaveBeenCalled();
    expect(c.dotEnvIo.isSymbolicLink).not.toHaveBeenCalled();
    expect(c.dotEnvIo.readFile).not.toHaveBeenCalled();
}

function expectDotEnvLoggedAsUnreadable(c: ServiceContext): void {
    expect(c.host.notifier.logged("debug")).toContainEqual(expect.stringContaining(".env"));
}

const DEV_KEY = "target:dev@localhost:8080::/work/order-process.bpmn";

describe("DeploymentStatusService.recordDeployment", () => {
    it("stores a fingerprint + timestamp under the identity/file ledger key", async () => {
        const c = createService();

        await c.service.recordDeployment(
            FILE_PATH,
            "<a/>",
            DeploymentTargetIdentity.fromTarget(target("dev"), NO_ENV_VARIABLES),
            "dep-42",
        );

        expect(c.host.deploymentState.ledger.get(DEV_KEY)).toEqual(
            expect.objectContaining({
                fingerprint: contentFingerprint("<a/>"),
                deploymentId: "dep-42",
                origin: "local",
            }),
        );
    });
});

describe("DeploymentStatusService ledger writes", () => {
    const identity = () => DeploymentTargetIdentity.fromTarget(target("dev"), NO_ENV_VARIABLES);

    it("adopts an engine revision under the identity/file key", async () => {
        const c = createService();
        const revision = {
            fingerprint: contentFingerprint("<a/>"),
            deployedAt: "2026-09-17T14:40:00.000Z",
            deploymentId: "dep-9",
            origin: "engine" as const,
            verifiedAt: "2026-09-17T15:00:00.000Z",
        };

        await c.service.adoptRevision(FILE_PATH, identity(), revision);

        expect(c.host.deploymentState.ledger.get(DEV_KEY)).toEqual(revision);
    });

    it("forgets a single revision", async () => {
        const c = createService();
        const otherKey = "target:dev@localhost:8080::/work/other.bpmn";
        await c.host.deploymentState.saveDeployedRevision(DEV_KEY, {
            fingerprint: "a",
            deployedAt: "",
        });
        await c.host.deploymentState.saveDeployedRevision(otherKey, {
            fingerprint: "b",
            deployedAt: "",
        });

        await c.service.forgetRevision(FILE_PATH, identity());

        expect(c.host.deploymentState.listLedgerKeys()).toEqual([otherKey]);
    });

    it("prunes exactly the identity's rows", async () => {
        const c = createService();
        const keys = [
            "target:dev@localhost:8080::/work/a.bpmn",
            "target:dev@localhost:8080::/work/b.bpmn",
            "target:dev@other.example.com::/work/a.bpmn",
            "target:prod@localhost:8080::/work/a.bpmn",
        ];
        for (const key of keys) {
            await c.host.deploymentState.saveDeployedRevision(key, {
                fingerprint: "f",
                deployedAt: "",
            });
        }

        await c.service.pruneTarget(identity());

        expect(c.host.deploymentState.listLedgerKeys()).toEqual([
            "target:dev@other.example.com::/work/a.bpmn",
            "target:prod@localhost:8080::/work/a.bpmn",
        ]);
    });

    it("skips the delete round-trip when nothing matches", async () => {
        const c = createService();
        const deleteDeployedRevisions = vi.spyOn(c.host.deploymentState, "deleteDeployedRevisions");

        await c.service.pruneTarget(identity());

        expect(deleteDeployedRevisions).not.toHaveBeenCalled();
    });

    it("prunes the rows an endpoint-ref target recorded under its resolved host", async () => {
        const c = createService(workspaceDotEnv(PROD_DOT_ENV));
        const recordedRow = ledgerKeyFor(
            DeploymentTargetIdentity.fromTarget(endpointRefTarget(), lookupOf(PROD_DOT_ENV)),
            "/work/a.bpmn",
        );
        const otherHostRow = ledgerKeyFor(
            DeploymentTargetIdentity.fromTarget(
                endpointRefTarget(),
                lookupOf({ MIRAGON_URL: "https://staging.example.com/engine-rest" }),
            ),
            "/work/a.bpmn",
        );
        for (const key of [recordedRow, otherHostRow]) {
            await c.host.deploymentState.saveDeployedRevision(key, {
                fingerprint: "f",
                deployedAt: "",
            });
        }

        await c.service.pruneTarget(await c.service.targetIdentity(endpointRefTarget(), "/work"));

        expect(c.host.deploymentState.listLedgerKeys()).toEqual([otherHostRow]);
    });

    it.each(UNREADABLE_DOT_ENVS)(
        "does not fail pruning an endpoint-ref target when .env is %s, leaving its resolved-key rows in place",
        async (_desc, breakDotEnv) => {
            const c = createService(workspaceDotEnv(PROD_DOT_ENV));
            breakDotEnv(c);
            // Recorded while .env was still readable; unreachable now, an accepted residual.
            const recordedRow = ledgerKeyFor(
                DeploymentTargetIdentity.fromTarget(endpointRefTarget(), lookupOf(PROD_DOT_ENV)),
                "/work/a.bpmn",
            );
            await c.host.deploymentState.saveDeployedRevision(recordedRow, {
                fingerprint: "f",
                deployedAt: "",
            });

            const pruning = c.service
                .targetIdentity(endpointRefTarget(), "/work")
                .then((identity) => c.service.pruneTarget(identity));

            await expect(pruning).resolves.toBeUndefined();
            expect(c.host.deploymentState.listLedgerKeys()).toEqual([recordedRow]);
            expectDotEnvLoggedAsUnreadable(c);
        },
    );
});

describe("DeploymentStatusService.targetIdentity", () => {
    it("keys a literal target endpoint without any .env IO", async () => {
        const c = createService();

        const identity = await c.service.targetIdentity(target("dev"), "/work");

        expect(identity.key()).toBe("target:dev@localhost:8080");
        expectNoDotEnvIo(c);
    });

    it.each<[string, DeploymentTarget]>([
        ["its credentials", credentialRefTarget()],
        ["its tenant", tenantRefTarget()],
        ["its deploy and start-instance URLs", urlRefTarget()],
    ])(
        "keys a target whose only refs are in %s by the literal host without any .env IO",
        async (_location, refOutsideEndpointTarget) => {
            const c = createService(workspaceDotEnv(PROD_DOT_ENV));

            const identity = await c.service.targetIdentity(refOutsideEndpointTarget, "/work");

            expect(identity.key()).toBe("target:dev@localhost:8080");
            expectNoDotEnvIo(c);
        },
    );

    it("keys an endpoint ref by the .env beside the targets file, not the workspace folder's", async () => {
        const c = createService(
            nestedProject({
                [WORKSPACE_DOT_ENV]: { MIRAGON_URL: "https://workspace.example.com/engine-rest" },
                [`${NESTED_PROJECT_DIR}/.env`]: PROD_DOT_ENV,
            }),
        );

        const identity = await c.service.targetIdentity(endpointRefTarget(), NESTED_PROJECT_DIR);

        expect(identity.key()).toBe(
            DeploymentTargetIdentity.fromTarget(endpointRefTarget(), lookupOf(PROD_DOT_ENV)).key(),
        );
        expect(c.deploymentTargetService.locateTargetsFile).toHaveBeenCalledExactlyOnceWith(
            NESTED_PROJECT_DIR,
        );
        expect(c.dotEnvIo.readFile).toHaveBeenCalledExactlyOnceWith(`${NESTED_PROJECT_DIR}/.env`);
    });

    it("keys an endpoint ref by a fingerprint of the host it resolves to, never the host itself", async () => {
        const c = createService(workspaceDotEnv(PROD_DOT_ENV));

        const identity = await c.service.targetIdentity(endpointRefTarget(), "/work");

        expect(c.deploymentTargetService.locateTargetsFile).toHaveBeenCalledWith("/work");
        expect(identity.key()).toContain("env:");
        expect(identity.key()).not.toContain(PROD_HOST);
        expect(identity.key()).toBe(
            DeploymentTargetIdentity.fromTarget(endpointRefTarget(), lookupOf(PROD_DOT_ENV)).key(),
        );
        expect(identity.key()).not.toBe(
            DeploymentTargetIdentity.fromTarget(endpointRefTarget(), NO_ENV_VARIABLES).key(),
        );
    });

    it("changes the key when .env points the endpoint ref at another host", async () => {
        const prod = createService(workspaceDotEnv(PROD_DOT_ENV));
        const staging = createService(
            workspaceDotEnv({ MIRAGON_URL: "https://staging.example.com/engine-rest" }),
        );

        const prodKey = (await prod.service.targetIdentity(endpointRefTarget(), "/work")).key();
        const stagingKey = (
            await staging.service.targetIdentity(endpointRefTarget(), "/work")
        ).key();

        expect(stagingKey).not.toBe(prodKey);
    });

    it.each(UNREADABLE_DOT_ENVS)(
        "keys an endpoint ref by its unresolved reference when .env is %s",
        async (_desc, breakDotEnv) => {
            const c = createService(workspaceDotEnv(PROD_DOT_ENV));
            breakDotEnv(c);

            const identity = await c.service.targetIdentity(endpointRefTarget(), "/work");

            expect(identity.key()).toBe(
                DeploymentTargetIdentity.fromTarget(endpointRefTarget(), NO_ENV_VARIABLES).key(),
            );
            expect(identity.key()).not.toContain(PROD_HOST);
            expectDotEnvLoggedAsUnreadable(c);
        },
    );

    it("propagates a failure other than an unreadable .env", async () => {
        const c = createService();
        c.deploymentTargetService.locateTargetsFile.mockRejectedValue(
            new Error("targets lookup failed"),
        );

        await expect(c.service.targetIdentity(endpointRefTarget(), "/work")).rejects.toThrow(
            "targets lookup failed",
        );
        expect(c.host.notifier.logged("debug")).toEqual([]);
    });
});

describe("DeploymentStatusService.pickStatusBarAction", () => {
    it("offers verify for a named C7 target", async () => {
        const c = createService({ answers: { deploymentStatusAction: "verify" } });
        c.deploymentTargetService.getActiveTarget.mockResolvedValue(target("dev"));

        await expect(c.service.pickStatusBarAction("/work")).resolves.toBe("verify");

        expect(c.host.picker.prompts).toEqual([
            {
                method: "pickDeploymentStatusAction",
                args: [{ targetName: "dev", canVerify: true }],
            },
        ]);
    });

    it("withholds verify without a named target", async () => {
        const c = createService();

        await c.service.pickStatusBarAction();

        expect(c.host.picker.prompts).toEqual([
            {
                method: "pickDeploymentStatusAction",
                args: [{ targetName: undefined, canVerify: false }],
            },
        ]);
    });

    it("withholds verify for a Camunda 8 target", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveTarget.mockResolvedValue(
            new DeploymentTarget("cloud", "c8", "https://c8.example.com", "", "none", "", ""),
        );

        await c.service.pickStatusBarAction();

        expect(c.host.picker.prompts).toEqual([
            {
                method: "pickDeploymentStatusAction",
                args: [{ targetName: "cloud", canVerify: false }],
            },
        ]);
    });
});

describe("DeploymentStatusService.refresh", () => {
    it("ignores requests from an inactive editor", async () => {
        const c = createService();
        c.host.statusBar.showDeploymentTarget("shown", "deployed");
        const shown = c.host.statusBar.deploymentTarget;
        await c.service.refresh("background");
        expect(c.host.statusBar.deploymentTarget).toBe(shown);
    });

    it.each(["resolve", "reject"])("ignores a stale lookup that later %s", async (outcome) => {
        const c = createService();
        const pending = deferred<DeploymentTarget | undefined>();
        c.deploymentTargetService.getActiveTarget.mockReturnValueOnce(pending.promise);
        const oldRefresh = c.service.refresh(c.editor.id);
        const other = c.host.openEditor("/work/other.bpmn", "<a/>");
        await c.service.refresh(other.id);
        const shown = c.host.statusBar.deploymentTarget;
        if (outcome === "resolve") pending.resolve(target("old"));
        else pending.reject(new Error("stale error"));
        await oldRefresh;
        expect(c.host.statusBar.deploymentTarget).toBe(shown);
    });

    it("invalidates pending refreshes when hidden, even if the active pointer is unchanged", async () => {
        const c = createService();
        const pending = deferred<DeploymentTarget | undefined>();
        c.deploymentTargetService.getActiveTarget.mockReturnValueOnce(pending.promise);
        const refresh = c.service.refresh(c.editor.id);
        c.service.hide();
        pending.resolve(target("old"));
        await refresh;
        expect(c.host.statusBar.deploymentTarget).toBeUndefined();
    });

    it.each<{ invalidation: string; invalidate: (c: ServiceContext) => void; outcome: string }>([
        { invalidation: "hidden", invalidate: (c) => c.service.hide(), outcome: "resolves" },
        { invalidation: "hidden", invalidate: (c) => c.service.hide(), outcome: "fails" },
        {
            invalidation: "switched to another editor",
            invalidate: (c) => c.host.openEditor("/work/other.bpmn", "<a/>"),
            outcome: "resolves",
        },
        {
            invalidation: "switched to another editor",
            invalidate: (c) => c.host.openEditor("/work/other.bpmn", "<a/>"),
            outcome: "fails",
        },
    ])(
        "drops a refresh whose .env read $outcome after the item was $invalidation",
        async ({ invalidate, outcome }) => {
            const c = createService();
            const ledgerReads = vi.spyOn(c.host.deploymentState, "getDeployedRevision");
            const dotEnvRead = deferred<string>();
            c.dotEnvIo.readFile.mockReturnValueOnce(dotEnvRead.promise);
            c.deploymentTargetService.getActiveTarget.mockResolvedValue(endpointRefTarget());

            const staleRefresh = c.service.refresh(c.editor.id);
            await vi.waitFor(() =>
                expect(c.dotEnvIo.readFile).toHaveBeenCalledWith(WORKSPACE_DOT_ENV),
            );
            invalidate(c);
            c.host.statusBar.showDeploymentTarget("shown", "deployed");
            const shown = c.host.statusBar.deploymentTarget;
            if (outcome === "resolves") dotEnvRead.resolve(dotEnvContent(PROD_DOT_ENV));
            else dotEnvRead.reject(new Error("EISDIR: illegal operation"));
            await staleRefresh;

            expect(ledgerReads).not.toHaveBeenCalled();
            expect(c.host.statusBar.deploymentTarget).toBe(shown);
        },
    );

    it("only publishes the newest lookup for the same editor", async () => {
        const c = createService();
        const pending = deferred<DeploymentTarget | undefined>();
        c.deploymentTargetService.getActiveTarget.mockReturnValueOnce(pending.promise);
        const old = c.service.refresh(c.editor.id);
        c.deploymentTargetService.getActiveTarget.mockResolvedValue(target("new"));
        await c.service.refresh(c.editor.id);
        const shown = c.host.statusBar.deploymentTarget;
        pending.resolve(target("old"));
        await old;
        expect(shown).toEqual({
            name: "new",
            freshness: "unknown",
            deployedAt: undefined,
            verifiedAt: undefined,
        });
        expect(c.host.statusBar.deploymentTarget).toBe(shown);
    });

    it("renders unknown when no revision is recorded", async () => {
        const c = createService();

        await c.service.refresh(c.editor.id);

        expect(c.host.statusBar.deploymentTarget).toEqual({
            name: undefined,
            freshness: "unknown",
            deployedAt: undefined,
            verifiedAt: undefined,
        });
    });

    it("renders deployed (green) when content matches the recorded fingerprint", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveTarget.mockResolvedValue(target("dev"));
        await c.host.deploymentState.saveDeployedRevision(
            ledgerKeyFor(
                DeploymentTargetIdentity.fromTarget(target("dev"), NO_ENV_VARIABLES),
                FILE_PATH,
            ),
            {
                fingerprint: contentFingerprint("<a/>"),
                deployedAt: "2026-09-17T14:32:00.000Z",
            },
        );

        await c.service.refresh(c.editor.id);

        expect(c.host.statusBar.deploymentTarget).toEqual({
            name: "dev",
            freshness: "deployed",
            deployedAt: "2026-09-17T14:32:00.000Z",
            verifiedAt: undefined,
        });
    });

    it("reads the ledger under the fingerprinted host the endpoint ref resolves to", async () => {
        const c = createService(workspaceDotEnv(PROD_DOT_ENV));
        c.deploymentTargetService.getActiveTarget.mockResolvedValue(endpointRefTarget());
        const ledgerKey = ledgerKeyFor(
            DeploymentTargetIdentity.fromTarget(endpointRefTarget(), lookupOf(PROD_DOT_ENV)),
            FILE_PATH,
        );
        await recordRevisionUnder(c, ledgerKey);

        await c.service.refresh(c.editor.id);

        expect(c.deploymentTargetService.locateTargetsFile).toHaveBeenCalledWith("/work");
        expectRecordedRevisionShown(c, "dev");
        expect(ledgerKey).toContain("env:");
        expect(ledgerKey).not.toContain(PROD_HOST);
    });

    it.each(UNREADABLE_DOT_ENVS)(
        "still renders an endpoint-ref target when .env is %s",
        async (_desc, breakDotEnv) => {
            const c = createService(workspaceDotEnv(PROD_DOT_ENV));
            breakDotEnv(c);
            c.deploymentTargetService.getActiveTarget.mockResolvedValue(endpointRefTarget());
            await recordRevisionUnder(
                c,
                ledgerKeyFor(
                    DeploymentTargetIdentity.fromTarget(endpointRefTarget(), NO_ENV_VARIABLES),
                    FILE_PATH,
                ),
            );

            await c.service.refresh(c.editor.id);

            expectRecordedRevisionShown(c, "dev");
            expectDotEnvLoggedAsUnreadable(c);
        },
    );

    it("reads the ledger of a literal endpoint without touching .env", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveTarget.mockResolvedValue(target("dev"));
        await recordRevisionUnder(c, `target:dev@localhost:8080::${FILE_PATH}`);

        await c.service.refresh(c.editor.id);

        expectRecordedRevisionShown(c, "dev");
        expect(c.dotEnvIo.isSymbolicLink).not.toHaveBeenCalled();
        expect(c.dotEnvIo.readFile).not.toHaveBeenCalled();
    });

    it.each(UNREADABLE_DOT_ENVS)(
        "renders a target whose only refs are in its credentials without touching .env when it is %s",
        async (_desc, breakDotEnv) => {
            const c = createService();
            breakDotEnv(c);
            c.deploymentTargetService.getActiveTarget.mockResolvedValue(credentialRefTarget());
            await recordRevisionUnder(c, `target:dev@localhost:8080::${FILE_PATH}`);

            await c.service.refresh(c.editor.id);

            expectRecordedRevisionShown(c, "dev");
            expectNoDotEnvIo(c);
            expect(c.host.notifier.logged("debug")).toEqual([]);
        },
    );

    it("renders changed (yellow) when content differs from the recorded fingerprint", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveTarget.mockResolvedValue(target("dev"));
        c.editor.content = "<b/>";
        await c.host.deploymentState.saveDeployedRevision(DEV_KEY, {
            fingerprint: contentFingerprint("<a/>"),
            deployedAt: "2026-09-17T14:32:00.000Z",
        });

        await c.service.refresh(c.editor.id);

        expect(c.host.statusBar.deploymentTarget).toEqual({
            name: "dev",
            freshness: "changed",
            deployedAt: "2026-09-17T14:32:00.000Z",
            verifiedAt: undefined,
        });
    });

    it("renders superseded (blue) and passes verifiedAt for an engine-origin mismatch", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveTarget.mockResolvedValue(target("dev"));
        c.editor.content = "<b/>";
        await c.host.deploymentState.saveDeployedRevision(DEV_KEY, {
            fingerprint: contentFingerprint("<a/>"),
            deployedAt: "2026-09-17T14:40:00.000Z",
            origin: "engine",
            verifiedAt: "2026-09-17T15:00:00.000Z",
        });

        await c.service.refresh(c.editor.id);

        expect(c.host.statusBar.deploymentTarget).toEqual({
            name: "dev",
            freshness: "superseded",
            deployedAt: "2026-09-17T14:40:00.000Z",
            verifiedAt: "2026-09-17T15:00:00.000Z",
        });
    });

    it("hides the item when the editor has no resolvable document", async () => {
        const c = createService();
        c.host.statusBar.showDeploymentTarget("shown", "deployed");
        vi.spyOn(c.host.documents, "getFilePath").mockImplementation(() => {
            throw new Error("no active editor");
        });

        await c.service.refresh(c.editor.id);

        expect(c.host.statusBar.deploymentTarget).toBeUndefined();
    });
});

describe("DeploymentStatusService.refresh in ad-hoc mode", () => {
    it("keys a literal endpoint and tenant without any .env IO", async () => {
        const c = createService();
        useAdHocConnection(c, LITERAL_ENDPOINT, "acme");
        await recordRevisionUnder(c, `adhoc:localhost:8080/acme::${FILE_PATH}`);

        await c.service.refresh(c.editor.id);

        expectRecordedRevisionShown(c, undefined);
        expectNoDotEnvIo(c);
    });

    it("reads .env when only the tenant holds a ref and fingerprints the resolved tenant", async () => {
        const dotEnv = { MIRAGON_TENANT: "acme" };
        const c = createService(workspaceDotEnv(dotEnv));
        useAdHocConnection(c, LITERAL_ENDPOINT, "${env:MIRAGON_TENANT}");
        const ledgerKey = ledgerKeyFor(
            DeploymentTargetIdentity.adHoc(
                LITERAL_ENDPOINT,
                "${env:MIRAGON_TENANT}",
                lookupOf(dotEnv),
            ),
            FILE_PATH,
        );
        await recordRevisionUnder(c, ledgerKey);

        await c.service.refresh(c.editor.id);

        expectRecordedRevisionShown(c, undefined);
        expect(ledgerKey).toMatch(/^adhoc:localhost:8080\/env:/);
        expect(ledgerKey).not.toContain("acme");
    });

    it("fingerprints a resolved endpoint and tenant so neither value is persisted", async () => {
        const dotEnv = { ...PROD_DOT_ENV, MIRAGON_TENANT: "acme" };
        const c = createService(workspaceDotEnv(dotEnv));
        useAdHocConnection(c, "${env:MIRAGON_URL}", "${env:MIRAGON_TENANT}");
        const ledgerKey = ledgerKeyFor(
            DeploymentTargetIdentity.adHoc(
                "${env:MIRAGON_URL}",
                "${env:MIRAGON_TENANT}",
                lookupOf(dotEnv),
            ),
            FILE_PATH,
        );
        await recordRevisionUnder(c, ledgerKey);

        await c.service.refresh(c.editor.id);

        expectRecordedRevisionShown(c, undefined);
        expect(ledgerKey).toMatch(/^adhoc:env:[0-9a-f]+\/env:[0-9a-f]+::/);
        expect(ledgerKey).not.toContain(PROD_HOST);
        expect(ledgerKey).not.toContain("acme");
    });

    it.each(UNREADABLE_DOT_ENVS)(
        "keys endpoint and tenant refs by their unresolved references when .env is %s",
        async (_desc, breakDotEnv) => {
            const c = createService(workspaceDotEnv({ ...PROD_DOT_ENV, MIRAGON_TENANT: "acme" }));
            breakDotEnv(c);
            useAdHocConnection(c, "${env:MIRAGON_URL}", "${env:MIRAGON_TENANT}");
            await recordRevisionUnder(
                c,
                ledgerKeyFor(
                    DeploymentTargetIdentity.adHoc(
                        "${env:MIRAGON_URL}",
                        "${env:MIRAGON_TENANT}",
                        NO_ENV_VARIABLES,
                    ),
                    FILE_PATH,
                ),
            );

            await c.service.refresh(c.editor.id);

            expectRecordedRevisionShown(c, undefined);
            expectDotEnvLoggedAsUnreadable(c);
        },
    );

    it("resolves refs from the workspace folder's .env, never a nested targets file's", async () => {
        const workspaceVariables = { ...PROD_DOT_ENV, MIRAGON_TENANT: "acme" };
        const c = createService(
            nestedProject({
                [WORKSPACE_DOT_ENV]: workspaceVariables,
                [`${NESTED_PROJECT_DIR}/.env`]: {
                    MIRAGON_URL: "https://team.example.com/engine-rest",
                    MIRAGON_TENANT: "team",
                },
            }),
        );
        useAdHocConnection(c, "${env:MIRAGON_URL}", "${env:MIRAGON_TENANT}");
        await recordRevisionUnder(
            c,
            ledgerKeyFor(
                DeploymentTargetIdentity.adHoc(
                    "${env:MIRAGON_URL}",
                    "${env:MIRAGON_TENANT}",
                    lookupOf(workspaceVariables),
                ),
                `${NESTED_PROJECT_DIR}/order-process.bpmn`,
            ),
        );

        await c.service.refresh(c.editor.id);

        expectRecordedRevisionShown(c, undefined);
        expect(c.deploymentTargetService.locateTargetsFile).not.toHaveBeenCalled();
        expect(c.dotEnvIo.readFile).toHaveBeenCalledExactlyOnceWith(WORKSPACE_DOT_ENV);
    });

    it("hides the item on a failure other than an unreadable .env", async () => {
        const c = createService();
        const ledgerReads = vi.spyOn(c.host.deploymentState, "getDeployedRevision");
        useAdHocConnection(c, "${env:MIRAGON_URL}", "");
        vi.spyOn(c.host.workspace, "findWorkspaceFolderForDocument").mockImplementation(() => {
            throw new Error("workspace folders unavailable");
        });
        c.host.statusBar.showDeploymentTarget("shown", "deployed");

        await c.service.refresh(c.editor.id);

        expect(ledgerReads).not.toHaveBeenCalled();
        expect(c.host.statusBar.deploymentTarget).toBeUndefined();
    });
});
