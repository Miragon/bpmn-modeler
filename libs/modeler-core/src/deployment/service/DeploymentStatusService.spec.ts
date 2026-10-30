import { describe, expect, it, vi } from "vitest";

import { StatusView } from "../../kernel/domain/statusView";
import { createTestHost, PickerAnswers } from "../../testing";
import { CredentialRefs } from "../domain/credentialRefs";
import {
    AdHocDestination,
    DeploymentDestination,
    NamedDestination,
    TargetEdit,
} from "../domain/deploymentDestination";
import { DeploymentTarget, DeploymentTargets, TargetChange } from "../domain/deploymentTarget";
import { DeploymentTargetsEvent } from "../domain/deploymentTargetsEvent";
import {
    contentFingerprint,
    DeploymentFreshness,
    DeploymentTargetIdentity,
    ledgerKeyFor,
} from "../domain/deploymentLedger";
import {
    DeploymentStatus,
    deploymentStatusView,
    StatusConnection,
    timestampFormatter,
} from "../domain/deploymentStatusView";
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

function named(target: DeploymentTarget, projectDir = "/work"): NamedDestination {
    return new NamedDestination(target, {
        filePath: `${projectDir}/.camunda/deployment-targets.json`,
        exists: true,
        projectDir,
    });
}

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
}

const workspaceDotEnv = (dotEnv: Record<string, string>): ServiceOptions => ({
    dotEnvs: { [WORKSPACE_DOT_ENV]: dotEnv },
});

/** Workspace folder `/work` holding a nested project with its own targets file. */
const nestedProject = (dotEnvs: Record<string, Record<string, string>>): ServiceOptions => ({
    dotEnvs,
    filePath: `${NESTED_PROJECT_DIR}/order-process.bpmn`,
});

function createService({ answers = {}, dotEnvs = {}, filePath = FILE_PATH }: ServiceOptions = {}) {
    const files = Object.fromEntries(
        Object.entries(dotEnvs).map(([path, dotEnv]) => [path, dotEnvContent(dotEnv)]),
    );
    const host = createTestHost({ answers, folders: ["/work"], files });
    const editor = host.openEditor(filePath, "<a/>");
    editor.active = true;
    const deploymentTargetService = {
        getActiveTarget: vi.fn().mockResolvedValue(undefined),
        getActiveDestination: vi.fn(
            async (): Promise<DeploymentDestination> =>
                new AdHocDestination(
                    host.deploymentState.getEndpoint(),
                    host.deploymentState.getTenantId(),
                ),
        ),
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
        new EnvValueResolver(host.workspace),
        host.settings,
    );
    service.track(editor.id);

    return { service, host, editor, deploymentTargetService, dotEnvIo };
}

type ServiceContext = ReturnType<typeof createService>;

/** Moves focus from the service's diagram to a second one, as a click into it does. */
function focusOtherDiagram(c: ServiceContext) {
    c.editor.loseFocus();
    const other = c.host.openEditor("/work/other.bpmn", "<a/>");
    other.becomeActive();
    return other;
}

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

const namedConnection = (name: string): StatusConnection => ({ kind: "named", name });
const DEV_TARGET = namedConnection("dev");
const FORM_VALUES: StatusConnection = { kind: "formValues" };
// The language of a fresh test host.
const formatInEnglish = timestampFormatter("en");
/** What another refresh left in the slot. */
const SHOWN_VIEW: StatusView = { text: "shown", icon: "dot", tone: "success" };

function shownStatus(c: ServiceContext): StatusView | undefined {
    return c.host.statusBar.views.deploymentTarget;
}

/** The texts are the view table's; this pins which connection, freshness and times the service picked. */
function expectStatusShown(c: ServiceContext, status: DeploymentStatus): void {
    expect(shownStatus(c)).toEqual(deploymentStatusView(status, formatInEnglish));
}

function expectRecordedRevisionShown(c: ServiceContext, connection: StatusConnection): void {
    expectStatusShown(c, {
        connection,
        freshness: "deployed",
        deployedAt: RECORDED_REVISION.deployedAt,
    });
}

function expectNoDotEnvIo(c: ServiceContext): void {
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

        await c.service.pruneTarget(
            await c.service.ledgerIdentity(named(endpointRefTarget()), "/work"),
        );

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
                .ledgerIdentity(named(endpointRefTarget()), "/work")
                .then((identity) => c.service.pruneTarget(identity));

            await expect(pruning).resolves.toBeUndefined();
            expect(c.host.deploymentState.listLedgerKeys()).toEqual([recordedRow]);
            expectDotEnvLoggedAsUnreadable(c);
        },
    );
});

describe("DeploymentStatusService status after a ledger write", () => {
    const devIdentity = () => DeploymentTargetIdentity.fromTarget(target("dev"), NO_ENV_VARIABLES);
    const engineRevisionOfOtherContent = {
        fingerprint: contentFingerprint("<b/>"),
        deployedAt: "2026-09-17T14:40:00.000Z",
        deploymentId: "dep-9",
        origin: "engine" as const,
        verifiedAt: "2026-09-17T15:00:00.000Z",
    };

    it.each<{
        write: string;
        recordedBefore: boolean;
        writeLedger: (service: DeploymentStatusService) => Promise<void>;
        shown: DeploymentFreshness;
    }>([
        {
            write: "recording a deployment of the active diagram",
            recordedBefore: false,
            writeLedger: (service) => service.recordDeployment(FILE_PATH, "<a/>", devIdentity()),
            shown: "deployed",
        },
        {
            write: "adopting an engine revision of the active diagram",
            recordedBefore: false,
            writeLedger: (service) =>
                service.adoptRevision(FILE_PATH, devIdentity(), engineRevisionOfOtherContent),
            shown: "superseded",
        },
        {
            write: "forgetting the revision of the active diagram",
            recordedBefore: true,
            writeLedger: (service) => service.forgetRevision(FILE_PATH, devIdentity()),
            shown: "unknown",
        },
        {
            write: "pruning the rows of the active target",
            recordedBefore: true,
            writeLedger: (service) => service.pruneTarget(devIdentity()),
            shown: "unknown",
        },
    ])("refreshes the status bar after $write", async ({ recordedBefore, writeLedger, shown }) => {
        const c = createService();
        c.deploymentTargetService.getActiveDestination.mockResolvedValue(named(target("dev")));
        if (recordedBefore) await recordRevisionUnder(c, DEV_KEY);
        await c.service.refresh(c.editor.id);

        await writeLedger(c.service);

        const revision = c.host.deploymentState.ledger.get(DEV_KEY);
        expectStatusShown(c, {
            connection: DEV_TARGET,
            freshness: shown,
            deployedAt: revision?.deployedAt,
            verifiedAt: revision?.verifiedAt,
        });
    });

    it("refreshes the status bar for the saved ad-hoc connection when its ledger row cannot be written", async () => {
        const c = createService();
        const localRow = ledgerKeyFor(
            DeploymentTargetIdentity.adHoc(LITERAL_ENDPOINT, "", NO_ENV_VARIABLES),
            FILE_PATH,
        );
        useAdHocConnection(c, LITERAL_ENDPOINT, "");
        await recordRevisionUnder(c, localRow);
        await c.service.refresh(c.editor.id);
        useAdHocConnection(c, PROD_URL, "");
        vi.spyOn(c.host.deploymentState, "saveDeployedRevision").mockRejectedValue(
            new Error("workspace state is read-only"),
        );

        const recording = c.service.recordDeployment(
            FILE_PATH,
            "<a/>",
            DeploymentTargetIdentity.adHoc(PROD_URL, "", NO_ENV_VARIABLES),
        );

        await expect(recording).rejects.toThrow("workspace state is read-only");
        expectStatusShown(c, { connection: FORM_VALUES, freshness: "unknown" });
    });
});

describe("DeploymentStatusService.targetsChanged", () => {
    const LOCATION = named(target("dev")).location;
    const SAVED = new DeploymentTargets([target("dev"), target("prod")]);
    const rowOf = (name: string) =>
        ledgerKeyFor(
            DeploymentTargetIdentity.fromTarget(target(name), NO_ENV_VARIABLES),
            FILE_PATH,
        );
    const edited = (change: TargetChange): DeploymentTargetsEvent => ({
        kind: "targetsChanged",
        edit: new TargetEdit(change, LOCATION),
        documentDir: "/work",
    });

    /** The item shows `dev` deployed; `dev` and `prod` each have a row for the diagram. */
    async function serviceShowingDev() {
        const c = createService();
        await recordRevisionUnder(c, rowOf("dev"));
        await recordRevisionUnder(c, rowOf("prod"));
        c.deploymentTargetService.getActiveDestination.mockResolvedValue(named(target("dev")));
        await c.service.refresh(c.editor.id);
        return c;
    }

    it.each<{
        change: string;
        event: DeploymentTargetsEvent;
        activeAfter: DeploymentDestination;
        shownAfter: DeploymentStatus;
        keptRows: string[];
    }>([
        {
            change: "a rename",
            event: edited(SAVED.upsert(target("staging"), "dev")),
            activeAfter: named(target("staging")),
            shownAfter: { connection: namedConnection("staging"), freshness: "unknown" },
            keptRows: ["prod"],
        },
        {
            change: "a delete",
            event: edited(SAVED.remove("dev")),
            activeAfter: new AdHocDestination("", ""),
            shownAfter: { connection: { kind: "none" }, freshness: "unknown" },
            keptRows: ["prod"],
        },
        {
            change: "a create",
            event: edited(SAVED.add(target("staging"))),
            activeAfter: named(target("staging")),
            shownAfter: { connection: namedConnection("staging"), freshness: "unknown" },
            keptRows: ["dev", "prod"],
        },
        {
            change: "a save under the same name",
            event: edited(SAVED.upsert(target("dev"))),
            activeAfter: named(target("dev")),
            shownAfter: {
                connection: DEV_TARGET,
                freshness: "deployed",
                deployedAt: RECORDED_REVISION.deployedAt,
            },
            keptRows: ["dev", "prod"],
        },
        {
            change: "a switch",
            event: { kind: "activeTargetChanged", activeName: "prod" },
            activeAfter: named(target("prod")),
            shownAfter: {
                connection: namedConnection("prod"),
                freshness: "deployed",
                deployedAt: RECORDED_REVISION.deployedAt,
            },
            keptRows: ["dev", "prod"],
        },
    ])(
        "drops only a retired target's rows after $change and shows the active target",
        async ({ event, activeAfter, shownAfter, keptRows }) => {
            const c = await serviceShowingDev();
            c.deploymentTargetService.getActiveDestination.mockResolvedValue(activeAfter);

            await c.service.targetsChanged(event);

            expect(c.host.deploymentState.listLedgerKeys()).toEqual(keptRows.map(rowOf));
            expectStatusShown(c, shownAfter);
        },
    );

    it.each([
        { document: "inside the workspace folder", documentDir: "/work", prunesResolvedRow: true },
        {
            document: "outside every workspace folder",
            documentDir: "/elsewhere",
            prunesResolvedRow: false,
        },
    ])(
        "keys a retired endpoint-ref target by the .env a document $document may read",
        async ({ documentDir, prunesResolvedRow }) => {
            const c = createService(workspaceDotEnv(PROD_DOT_ENV));
            const resolvedRow = ledgerKeyFor(
                DeploymentTargetIdentity.fromTarget(endpointRefTarget(), lookupOf(PROD_DOT_ENV)),
                FILE_PATH,
            );
            await recordRevisionUnder(c, resolvedRow);

            await c.service.targetsChanged({
                kind: "targetsChanged",
                edit: new TargetEdit(
                    new DeploymentTargets([endpointRefTarget()]).remove("dev"),
                    LOCATION,
                ),
                documentDir,
            });

            expect(c.host.deploymentState.ledger.has(resolvedRow)).toBe(!prunesResolvedRow);
        },
    );
});

describe("DeploymentStatusService.ledgerIdentity", () => {
    it("keys a literal target endpoint without any .env IO", async () => {
        const c = createService();

        const identity = await c.service.ledgerIdentity(named(target("dev")), "/work");

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

            const identity = await c.service.ledgerIdentity(
                named(refOutsideEndpointTarget),
                "/work",
            );

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

        const identity = await c.service.ledgerIdentity(
            named(endpointRefTarget(), NESTED_PROJECT_DIR),
            NESTED_PROJECT_DIR,
        );

        expect(identity.key()).toBe(
            DeploymentTargetIdentity.fromTarget(endpointRefTarget(), lookupOf(PROD_DOT_ENV)).key(),
        );
        expect(c.dotEnvIo.readFile).toHaveBeenCalledExactlyOnceWith(`${NESTED_PROJECT_DIR}/.env`);
    });

    it("keys an endpoint ref by a fingerprint of the host it resolves to, never the host itself", async () => {
        const c = createService(workspaceDotEnv(PROD_DOT_ENV));

        const identity = await c.service.ledgerIdentity(named(endpointRefTarget()), "/work");
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

        const prodKey = (
            await prod.service.ledgerIdentity(named(endpointRefTarget()), "/work")
        ).key();
        const stagingKey = (
            await staging.service.ledgerIdentity(named(endpointRefTarget()), "/work")
        ).key();

        expect(stagingKey).not.toBe(prodKey);
    });

    it.each(UNREADABLE_DOT_ENVS)(
        "keys an endpoint ref by its unresolved reference when .env is %s",
        async (_desc, breakDotEnv) => {
            const c = createService(workspaceDotEnv(PROD_DOT_ENV));
            breakDotEnv(c);

            const identity = await c.service.ledgerIdentity(named(endpointRefTarget()), "/work");

            expect(identity.key()).toBe(
                DeploymentTargetIdentity.fromTarget(endpointRefTarget(), NO_ENV_VARIABLES).key(),
            );
            expect(identity.key()).not.toContain(PROD_HOST);
            expectDotEnvLoggedAsUnreadable(c);
        },
    );

    it("propagates a failure other than an unreadable .env", async () => {
        const c = createService();
        vi.spyOn(c.host.workspace, "findWorkspaceFolderForDocument").mockImplementation(() => {
            throw new Error("workspace folder lookup failed");
        });

        await expect(c.service.ledgerIdentity(named(endpointRefTarget()), "/work")).rejects.toThrow(
            "workspace folder lookup failed",
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
    it("keeps the item hidden when a refresh runs after the diagram lost focus to a text editor", async () => {
        const c = createService();
        await c.service.refresh(c.editor.id);
        expect(shownStatus(c)).toBeDefined();

        // DeploymentStatusParticipant's blur release; the store pointer stays.
        c.editor.loseFocus();
        c.service.hide();
        // e.g. Deploy Files run from the command palette.
        await c.service.refreshFocused();

        expect(shownStatus(c)).toBeUndefined();
    });

    it("refreshes the focused diagram, not one resolved behind it", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveDestination.mockResolvedValue(named(target("old")));
        await c.service.refresh(c.editor.id);
        // Registering moves the store's pointer to the background diagram.
        c.host.openEditor("/work/background.bpmn", "<a/>");
        c.deploymentTargetService.getActiveDestination.mockResolvedValue(named(target("new")));

        await c.service.refreshFocused();

        expect(shownStatus(c)?.text).toBe("new");
    });

    it("hides the item when a command refreshes with no editor focused", async () => {
        const c = createService();
        await c.service.refresh(c.editor.id);
        expect(shownStatus(c)).toBeDefined();
        // No participant hid it on blur.
        c.editor.loseFocus();

        await c.service.refreshFocused();

        expect(shownStatus(c)).toBeUndefined();
    });

    it("shows no item for a focused editor without a status participant", async () => {
        const c = createService();
        // A DMN or Form editor: nothing would hide the item on its blur or close.
        c.editor.loseFocus();
        c.host.openEditor("/work/decision.dmn", "<a/>").becomeActive();

        await c.service.refreshFocused();

        expect(shownStatus(c)).toBeUndefined();
    });

    it("finishes the focused diagram's refresh when a background diagram asks for one meanwhile", async () => {
        const c = createService();
        const pending = deferred<DeploymentDestination>();
        c.deploymentTargetService.getActiveDestination.mockReturnValueOnce(pending.promise);
        const focusedRefresh = c.service.refresh(c.editor.id);
        const background = c.host.openEditor("/work/background.bpmn", "<a/>");

        await c.service.refresh(background.id);
        pending.resolve(named(target("dev")));
        await focusedRefresh;

        expect(shownStatus(c)?.text).toBe("dev");
    });

    it("ignores requests from an inactive editor", async () => {
        const c = createService();
        c.host.statusBar.show("deploymentTarget", SHOWN_VIEW);
        await c.service.refresh("background");
        expect(shownStatus(c)).toBe(SHOWN_VIEW);
    });

    it.each(["resolve", "reject"])("ignores a stale lookup that later %s", async (outcome) => {
        const c = createService();
        const pending = deferred<DeploymentDestination>();
        c.deploymentTargetService.getActiveDestination.mockReturnValueOnce(pending.promise);
        const oldRefresh = c.service.refresh(c.editor.id);
        const other = focusOtherDiagram(c);
        await c.service.refresh(other.id);
        const shown = shownStatus(c);
        if (outcome === "resolve") pending.resolve(named(target("old")));
        else pending.reject(new Error("stale error"));
        await oldRefresh;
        expect(shownStatus(c)).toBe(shown);
    });

    it("invalidates pending refreshes when hidden, even if the active pointer is unchanged", async () => {
        const c = createService();
        const pending = deferred<DeploymentDestination>();
        c.deploymentTargetService.getActiveDestination.mockReturnValueOnce(pending.promise);
        const refresh = c.service.refresh(c.editor.id);
        c.service.hide();
        pending.resolve(named(target("old")));
        await refresh;
        expect(shownStatus(c)).toBeUndefined();
    });

    it.each<{ invalidation: string; invalidate: (c: ServiceContext) => void; outcome: string }>([
        { invalidation: "hidden", invalidate: (c) => c.service.hide(), outcome: "resolves" },
        { invalidation: "hidden", invalidate: (c) => c.service.hide(), outcome: "fails" },
        {
            invalidation: "switched to another editor",
            invalidate: focusOtherDiagram,
            outcome: "resolves",
        },
        {
            invalidation: "switched to another editor",
            invalidate: focusOtherDiagram,
            outcome: "fails",
        },
    ])(
        "drops a refresh whose .env read $outcome after the item was $invalidation",
        async ({ invalidate, outcome }) => {
            const c = createService();
            const ledgerReads = vi.spyOn(c.host.deploymentState, "getDeployedRevision");
            const dotEnvRead = deferred<string>();
            c.dotEnvIo.readFile.mockReturnValueOnce(dotEnvRead.promise);
            c.deploymentTargetService.getActiveDestination.mockResolvedValue(
                named(endpointRefTarget()),
            );

            const staleRefresh = c.service.refresh(c.editor.id);
            await vi.waitFor(() =>
                expect(c.dotEnvIo.readFile).toHaveBeenCalledWith(WORKSPACE_DOT_ENV),
            );
            invalidate(c);
            c.host.statusBar.show("deploymentTarget", SHOWN_VIEW);
            if (outcome === "resolves") dotEnvRead.resolve(dotEnvContent(PROD_DOT_ENV));
            else dotEnvRead.reject(new Error("EISDIR: illegal operation"));
            await staleRefresh;

            expect(ledgerReads).not.toHaveBeenCalled();
            expect(shownStatus(c)).toBe(SHOWN_VIEW);
        },
    );

    it("only publishes the newest lookup for the same editor", async () => {
        const c = createService();
        const pending = deferred<DeploymentDestination>();
        c.deploymentTargetService.getActiveDestination.mockReturnValueOnce(pending.promise);
        const old = c.service.refresh(c.editor.id);
        c.deploymentTargetService.getActiveDestination.mockResolvedValue(named(target("new")));
        await c.service.refresh(c.editor.id);
        const shown = shownStatus(c);
        pending.resolve(named(target("old")));
        await old;
        expect(shown).toEqual(
            deploymentStatusView(
                { connection: namedConnection("new"), freshness: "unknown" },
                formatInEnglish,
            ),
        );
        expect(shownStatus(c)).toBe(shown);
    });

    it("renders unknown when no revision is recorded", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveDestination.mockResolvedValue(named(target("dev")));

        await c.service.refresh(c.editor.id);

        expectStatusShown(c, { connection: DEV_TARGET, freshness: "unknown" });
    });

    it("shows the deployment time in the modeler language", async () => {
        const c = createService();
        c.host.settings.values.language = "de";
        c.deploymentTargetService.getActiveDestination.mockResolvedValue(named(target("dev")));
        await recordRevisionUnder(c, DEV_KEY);

        await c.service.refresh(c.editor.id);

        expect(shownStatus(c)?.tooltip).toBe(
            `Deployed — last deployed ${timestampFormatter("de")(RECORDED_REVISION.deployedAt)}`,
        );
    });

    it("renders deployed (green) when content matches the recorded fingerprint", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveDestination.mockResolvedValue(named(target("dev")));
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

        expectStatusShown(c, {
            connection: DEV_TARGET,
            freshness: "deployed",
            deployedAt: "2026-09-17T14:32:00.000Z",
        });
    });

    it("reads the ledger under the fingerprinted host the endpoint ref resolves to", async () => {
        const c = createService(workspaceDotEnv(PROD_DOT_ENV));
        c.deploymentTargetService.getActiveDestination.mockResolvedValue(
            named(endpointRefTarget()),
        );
        const ledgerKey = ledgerKeyFor(
            DeploymentTargetIdentity.fromTarget(endpointRefTarget(), lookupOf(PROD_DOT_ENV)),
            FILE_PATH,
        );
        await recordRevisionUnder(c, ledgerKey);

        await c.service.refresh(c.editor.id);
        expectRecordedRevisionShown(c, DEV_TARGET);
        expect(ledgerKey).toContain("env:");
        expect(ledgerKey).not.toContain(PROD_HOST);
    });

    it.each(UNREADABLE_DOT_ENVS)(
        "still renders an endpoint-ref target when .env is %s",
        async (_desc, breakDotEnv) => {
            const c = createService(workspaceDotEnv(PROD_DOT_ENV));
            breakDotEnv(c);
            c.deploymentTargetService.getActiveDestination.mockResolvedValue(
                named(endpointRefTarget()),
            );
            await recordRevisionUnder(
                c,
                ledgerKeyFor(
                    DeploymentTargetIdentity.fromTarget(endpointRefTarget(), NO_ENV_VARIABLES),
                    FILE_PATH,
                ),
            );

            await c.service.refresh(c.editor.id);

            expectRecordedRevisionShown(c, DEV_TARGET);
            expectDotEnvLoggedAsUnreadable(c);
        },
    );

    it("reads the ledger of a literal endpoint without touching .env", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveDestination.mockResolvedValue(named(target("dev")));
        await recordRevisionUnder(c, `target:dev@localhost:8080::${FILE_PATH}`);

        await c.service.refresh(c.editor.id);

        expectRecordedRevisionShown(c, DEV_TARGET);
        expect(c.dotEnvIo.isSymbolicLink).not.toHaveBeenCalled();
        expect(c.dotEnvIo.readFile).not.toHaveBeenCalled();
    });

    it.each(UNREADABLE_DOT_ENVS)(
        "renders a target whose only refs are in its credentials without touching .env when it is %s",
        async (_desc, breakDotEnv) => {
            const c = createService();
            breakDotEnv(c);
            c.deploymentTargetService.getActiveDestination.mockResolvedValue(
                named(credentialRefTarget()),
            );
            await recordRevisionUnder(c, `target:dev@localhost:8080::${FILE_PATH}`);

            await c.service.refresh(c.editor.id);

            expectRecordedRevisionShown(c, DEV_TARGET);
            expectNoDotEnvIo(c);
            expect(c.host.notifier.logged("debug")).toEqual([]);
        },
    );

    it("renders changed (yellow) when content differs from the recorded fingerprint", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveDestination.mockResolvedValue(named(target("dev")));
        c.editor.content = "<b/>";
        await c.host.deploymentState.saveDeployedRevision(DEV_KEY, {
            fingerprint: contentFingerprint("<a/>"),
            deployedAt: "2026-09-17T14:32:00.000Z",
        });

        await c.service.refresh(c.editor.id);

        expectStatusShown(c, {
            connection: DEV_TARGET,
            freshness: "changed",
            deployedAt: "2026-09-17T14:32:00.000Z",
        });
    });

    it("renders superseded (blue) with the verification time for an engine-origin mismatch", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveDestination.mockResolvedValue(named(target("dev")));
        c.editor.content = "<b/>";
        await c.host.deploymentState.saveDeployedRevision(DEV_KEY, {
            fingerprint: contentFingerprint("<a/>"),
            deployedAt: "2026-09-17T14:40:00.000Z",
            origin: "engine",
            verifiedAt: "2026-09-17T15:00:00.000Z",
        });

        await c.service.refresh(c.editor.id);

        expectStatusShown(c, {
            connection: DEV_TARGET,
            freshness: "superseded",
            deployedAt: "2026-09-17T14:40:00.000Z",
            verifiedAt: "2026-09-17T15:00:00.000Z",
        });
    });

    it("hides the item when the editor has no resolvable document", async () => {
        const c = createService();
        c.host.statusBar.show("deploymentTarget", SHOWN_VIEW);
        vi.spyOn(c.host.documents, "getFilePath").mockImplementation(() => {
            throw new Error("no active editor");
        });

        await c.service.refresh(c.editor.id);

        expect(shownStatus(c)).toBeUndefined();
    });
});

describe("DeploymentStatusService.refresh in ad-hoc mode", () => {
    it("labels the form values connection", async () => {
        const c = createService();
        useAdHocConnection(c, LITERAL_ENDPOINT, "");
        await recordRevisionUnder(
            c,
            ledgerKeyFor(
                DeploymentTargetIdentity.adHoc(LITERAL_ENDPOINT, "", NO_ENV_VARIABLES),
                FILE_PATH,
            ),
        );

        await c.service.refresh(c.editor.id);

        expect(shownStatus(c)).toEqual({
            text: "Form values",
            icon: "dot",
            tooltip: `Deployed with the form values — last deployed ${formatInEnglish(RECORDED_REVISION.deployedAt)}`,
            tone: "success",
            action: "deploymentMenu",
        });
    });

    it("asks for a target when no connection is saved", async () => {
        const c = createService();

        await c.service.refresh(c.editor.id);

        expect(shownStatus(c)).toEqual({
            text: "No deployment target",
            icon: "dot",
            tooltip: "No deployment target selected — click to choose one",
            tone: "neutral",
            action: "deploymentMenu",
        });
    });

    it("keys a literal endpoint and tenant without any .env IO", async () => {
        const c = createService();
        useAdHocConnection(c, LITERAL_ENDPOINT, "acme");
        await recordRevisionUnder(c, `adhoc:localhost:8080/acme::${FILE_PATH}`);

        await c.service.refresh(c.editor.id);

        expectRecordedRevisionShown(c, FORM_VALUES);
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

        expectRecordedRevisionShown(c, FORM_VALUES);
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

        expectRecordedRevisionShown(c, FORM_VALUES);
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

            expectRecordedRevisionShown(c, FORM_VALUES);
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

        expectRecordedRevisionShown(c, FORM_VALUES);
        expect(c.dotEnvIo.readFile).toHaveBeenCalledExactlyOnceWith(WORKSPACE_DOT_ENV);
    });

    it("hides the item on a failure other than an unreadable .env", async () => {
        const c = createService();
        const ledgerReads = vi.spyOn(c.host.deploymentState, "getDeployedRevision");
        useAdHocConnection(c, "${env:MIRAGON_URL}", "");
        vi.spyOn(c.host.workspace, "findWorkspaceFolderForDocument").mockImplementation(() => {
            throw new Error("workspace folders unavailable");
        });
        c.host.statusBar.show("deploymentTarget", SHOWN_VIEW);

        await c.service.refresh(c.editor.id);

        expect(ledgerReads).not.toHaveBeenCalled();
        expect(shownStatus(c)).toBeUndefined();
    });
});
