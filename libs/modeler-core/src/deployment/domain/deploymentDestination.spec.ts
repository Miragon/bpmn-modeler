import { describe, expect, it } from "vitest";

import { BasicAuth } from "./deployment";
import {
    activeDestination,
    AdHocDestination,
    DeploymentDestination,
    DestinationResolution,
    namesTarget,
    NamedDestination,
    prefillDestination,
    requestDestination,
    resolveNamedDestination,
    TargetEdit,
    TargetsLocation,
    targetSecretSlot,
    UnknownTarget,
} from "./deploymentDestination";
import { DeploymentTargetIdentity } from "./deploymentLedger";
import { DeploymentTarget, DeploymentTargets, TargetRequest } from "./deploymentTarget";
import { NO_ENV_VARIABLES } from "./envRef";
import { DeploymentTargetChangedError } from "./errors";

const TARGETS_FILE = "/ws/.camunda/deployment-targets.json";
const LOCATION: TargetsLocation = { filePath: TARGETS_FILE, exists: true, projectDir: "/ws" };
const PROD_SLOT = `${TARGETS_FILE}::prod`;
const PROD_ENDPOINT = "https://prod.example/engine-rest";
const TYPED_ENDPOINT = "https://typed.example/engine-rest";

const prod = new DeploymentTarget("prod", "c7", PROD_ENDPOINT, "acme", "basic", "", "");
const dev = new DeploymentTarget(
    "dev",
    "c7",
    "http://localhost:8080/engine-rest",
    "",
    "none",
    "",
    "",
);
const named = new NamedDestination(prod, LOCATION);
const adHoc = new AdHocDestination(TYPED_ENDPOINT, "acme");

const typedRequest = { carriesEnvValues: () => false };
const requestCarryingEnvValues = { carriesEnvValues: () => true };
const credentials = new BasicAuth("admin", "s3cret");

const deployRequest = (endpoint: string): TargetRequest => ({
    kind: "deploy",
    endpoint,
    engine: "c7",
    auth: new BasicAuth("admin", "s3cret"),
    tenantId: "acme",
});

interface PropertyCase {
    readonly property: string;
    readonly of: (destination: DeploymentDestination) => unknown;
    readonly named: unknown;
    readonly adHoc: unknown;
}

describe("DeploymentDestination", () => {
    it.each<PropertyCase>([
        { property: "kind", of: (d) => d.kind, named: "named", adHoc: "adHoc" },
        { property: "target", of: (d) => d.target, named: prod, adHoc: undefined },
        {
            property: ".env directory of a document in a workspace folder",
            of: (d) => d.dotEnvDirectory("/workspace-folder"),
            named: "/ws",
            adHoc: "/workspace-folder",
        },
        {
            property: ".env directory of a document outside every workspace folder",
            of: (d) => d.dotEnvDirectory(undefined),
            named: undefined,
            adHoc: undefined,
        },
        {
            property: "approval slot",
            of: (d) => d.approvalSlot,
            named: PROD_SLOT,
            adHoc: "ad-hoc",
        },
        {
            property: "name in a declined approval",
            of: (d) => d.connectionName,
            named: "prod",
            adHoc: "ad-hoc",
        },
        {
            property: "connection the deployment status names",
            of: (d) => d.statusConnection,
            named: { kind: "named", name: "prod" },
            adHoc: { kind: "formValues" },
        },
        {
            property: "connection the approval prompt names",
            of: (d) => d.connectionLabel,
            named: 'target "prod"',
            adHoc: "the ad-hoc connection",
        },
        {
            property: "approval of a request with only typed values",
            of: (d) => d.requiresApproval(typedRequest),
            named: true,
            adHoc: false,
        },
        {
            property: "approval of a request carrying .env values",
            of: (d) => d.requiresApproval(requestCarryingEnvValues),
            named: true,
            adHoc: true,
        },
        {
            property: "ledger identity",
            of: (d) => d.ledgerIdentity(NO_ENV_VARIABLES),
            named: DeploymentTargetIdentity.fromTarget(prod, NO_ENV_VARIABLES),
            adHoc: DeploymentTargetIdentity.adHoc(TYPED_ENDPOINT, "acme", NO_ENV_VARIABLES),
        },
        {
            property: "what an accepted deploy remembers",
            of: (d) => d.credentialPersistence(credentials),
            named: { auth: credentials, secretSlot: PROD_SLOT, legacyConnection: undefined },
            adHoc: {
                auth: credentials,
                secretSlot: undefined,
                legacyConnection: { endpoint: TYPED_ENDPOINT, tenantId: "acme" },
            },
        },
    ])("$property", ({ of, named: namedValue, adHoc: adHocValue }) => {
        expect({ named: of(named), adHoc: of(adHoc) }).toEqual({
            named: namedValue,
            adHoc: adHocValue,
        });
    });

    it.each(["", "  "])(
        "names no connection in the deployment status while the ad-hoc endpoint is %j",
        (endpoint) => {
            expect(new AdHocDestination(endpoint, "acme").statusConnection).toEqual({
                kind: "none",
            });
        },
    );

    it("keeps a named target's credentials under its approval slot", () => {
        expect(named.secretSlot).toBe(PROD_SLOT);
    });

    const locatedAt = (filePath: string, projectDir: string): TargetsLocation => ({
        filePath,
        exists: true,
        projectDir,
    });

    it.each<[string, TargetsLocation]>([
        [
            "its project's config folder",
            locatedAt("/ws/sub/.camunda/deployment-targets.json", "/ws/sub"),
        ],
        ["the project itself", locatedAt("/ws/sub/deployment-targets.json", "/ws/sub")],
        [
            "a config folder whose name merely starts with dots",
            locatedAt("/ws/sub/..cfg/deployment-targets.json", "/ws/sub"),
        ],
        [
            "a project on a UNC share",
            locatedAt("//server/share/ws/.camunda/deployment-targets.json", "//server/share/ws"),
        ],
    ])("reads the .env of a named target's project for a targets file in %s", (_case, location) => {
        expect(new NamedDestination(prod, location).dotEnvDirectory("/ws")).toBe(
            location.projectDir,
        );
    });

    it.each<[string, TargetsLocation]>([
        ["../cfg", locatedAt("/ws/cfg/deployment-targets.json", "/ws/sub")],
        ["../../elsewhere", locatedAt("/elsewhere/deployment-targets.json", "/ws/sub")],
        [
            "../sub2, a sibling sharing its prefix",
            locatedAt("/ws/sub2/deployment-targets.json", "/ws/sub"),
        ],
    ])(
        "reads no .env for a named target whose config folder %s leaves its project",
        (_configFolder, location) => {
            expect(new NamedDestination(prod, location).dotEnvDirectory("/ws")).toBeUndefined();
        },
    );

    it.each([
        {
            refs: "only in the endpoint",
            endpoint: "${env:MIRAGON_URL}",
            tenantId: "acme",
            named: true,
            adHoc: true,
        },
        {
            refs: "only in the tenant",
            endpoint: PROD_ENDPOINT,
            tenantId: "${env:MIRAGON_TENANT}",
            named: false,
            adHoc: true,
        },
        { refs: "nowhere", endpoint: PROD_ENDPOINT, tenantId: "acme", named: false, adHoc: false },
    ])(
        "reads .env for the ledger identity with refs $refs only when the identity keys on them",
        ({ endpoint, tenantId, named: namedReads, adHoc: adHocReads }) => {
            const target = new DeploymentTarget("prod", "c7", endpoint, tenantId, "none", "", "");

            expect({
                named: new NamedDestination(target, LOCATION).ledgerEnvRefs().referencesEnv(),
                adHoc: new AdHocDestination(endpoint, tenantId).ledgerEnvRefs().referencesEnv(),
            }).toEqual({ named: namedReads, adHoc: adHocReads });
        },
    );

    it("admits only a request matching a named target as saved", () => {
        expect(() => named.assertAdmits(deployRequest(TYPED_ENDPOINT))).toThrow(
            DeploymentTargetChangedError,
        );
        expect(() => named.assertAdmits(deployRequest(PROD_ENDPOINT))).not.toThrow();
    });

    it("admits any ad-hoc request, which carries its own connection", () => {
        expect(() => adHoc.assertAdmits(deployRequest(PROD_ENDPOINT))).not.toThrow();
    });

    it("names a target from the shared file on a single shortened line in the approval prompt", () => {
        const target = new DeploymentTarget(
            `  prod\r\n"Approved"\t${"x".repeat(80)}`,
            "c7",
            PROD_ENDPOINT,
            "",
            "none",
            "",
            "",
        );

        expect(new NamedDestination(target, LOCATION).connectionLabel).toBe(
            `target "prod Approved ${"x".repeat(46)}…"`,
        );
    });

    it("keeps a name of exactly the shown length whole", () => {
        const name = "x".repeat(60);
        const target = new DeploymentTarget(name, "c7", PROD_ENDPOINT, "", "none", "", "");

        expect(new NamedDestination(target, LOCATION).connectionLabel).toBe(`target "${name}"`);
    });
});

describe("targetSecretSlot", () => {
    it("keys a slot by the targets file path and the trimmed target name", () => {
        expect(targetSecretSlot(LOCATION, " prod ")).toBe(PROD_SLOT);
    });
});

describe("resolving a target name", () => {
    it.each([
        { name: undefined, names: false },
        { name: "", names: false },
        { name: " \t", names: false },
        { name: "prod", names: true },
        { name: " prod ", names: true },
    ])("$name names a target: $names", ({ name, names }) => {
        expect(namesTarget(name)).toBe(names);
    });

    const file = new DeploymentTargets([dev, prod]);

    it.each([
        {
            behaviour: "a name the file holds resolves to that target at the file's location",
            name: "prod",
            location: LOCATION,
            resolution: named,
        },
        {
            behaviour: "a padded name resolves to the target of its trimmed name",
            name: " prod ",
            location: LOCATION,
            resolution: named,
        },
        {
            behaviour: "a name the file no longer holds is unknown",
            name: " staging ",
            location: LOCATION,
            resolution: new UnknownTarget("staging"),
        },
        {
            behaviour: "a name without a targets file location is unknown",
            name: "prod",
            location: undefined,
            resolution: new UnknownTarget("prod"),
        },
    ])("$behaviour", ({ name, location, resolution }) => {
        expect(resolveNamedDestination(name, location, file)).toEqual(resolution);
    });
});

describe("what an unknown target name means", () => {
    const rememberedAdHoc = new AdHocDestination("https://remembered.example", "");
    const unknown = new UnknownTarget("staging");

    interface PolicyCase {
        readonly caller: string;
        readonly policy: (resolution: DestinationResolution) => DeploymentDestination | undefined;
        readonly unknown: DeploymentDestination | undefined;
    }

    it.each<PolicyCase>([
        {
            caller: "the active target falls back to the remembered ad-hoc connection",
            policy: (resolution) => activeDestination(resolution, rememberedAdHoc),
            unknown: rememberedAdHoc,
        },
        {
            caller: "the credentials prefill shows none",
            policy: prefillDestination,
            unknown: undefined,
        },
    ])("$caller", ({ policy, unknown: unknownValue }) => {
        expect({
            adHoc: policy(adHoc),
            named: policy(named),
            unknown: policy(unknown),
        }).toEqual({ adHoc, named, unknown: unknownValue });
    });

    it("a deploy or start request fails, so it never runs against another connection", () => {
        expect({ adHoc: requestDestination(adHoc), named: requestDestination(named) }).toEqual({
            adHoc,
            named,
        });
        expect(() => requestDestination(unknown)).toThrow(
            new DeploymentTargetChangedError(
                "The deployment target no longer exists. Select a target again.",
            ),
        );
    });
});

describe("TargetEdit", () => {
    const saved = new DeploymentTargets([dev, prod]);
    const staging = new DeploymentTarget("staging", "c7", PROD_ENDPOINT, "", "none", "", "");

    it.each([
        {
            behaviour: "a rename retires the old target at the edited file's location",
            edit: new TargetEdit(saved.upsert(staging, "dev"), LOCATION),
            retired: new NamedDestination(dev, LOCATION),
        },
        {
            behaviour: "a remove retires the removed target",
            edit: new TargetEdit(saved.remove("prod"), LOCATION),
            retired: named,
        },
        {
            behaviour: "a remove of a name the file no longer holds retires no destination",
            edit: new TargetEdit(saved.remove("staging"), LOCATION),
            retired: undefined,
        },
        {
            behaviour: "a save under the same name retires nothing",
            edit: new TargetEdit(saved.upsert(prod), LOCATION),
            retired: undefined,
        },
    ])("$behaviour", ({ edit, retired }) => {
        expect(edit.retiredDestination).toEqual(retired);
    });
});
