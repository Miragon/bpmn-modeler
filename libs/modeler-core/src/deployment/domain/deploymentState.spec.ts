import { describe, expect, it } from "vitest";

import { AuthConfig, BasicAuth, NoAuth, OAuth2Auth } from "./deployment";
import { DeployedRevision } from "./deploymentLedger";
import {
    applyDeploymentStatePatch,
    connectionPatch,
    DEFAULT_DEPLOYMENT_STATE,
    DeploymentState,
    DeploymentStatePatch,
    deploymentStateFrom,
    patchedKeys,
    RawDeploymentState,
} from "./deploymentState";

const LOCAL_ROW = "adhoc:localhost:8080/::/work/order.bpmn";
const DEV_ROW = "target:dev@localhost:8080::/work/order.bpmn";
const PROD_ROW = "target:prod@localhost:8080::/work/order.bpmn";

const localRevision: DeployedRevision = {
    fingerprint: "0123456789abcdef",
    deployedAt: "2026-09-17T14:32:00.000Z",
};

const engineRevision: DeployedRevision = {
    fingerprint: "fedcba9876543210",
    deployedAt: "2026-09-18T09:00:00.000Z",
    deploymentId: "dep-7",
    origin: "engine",
    verifiedAt: "2026-09-18T09:05:00.000Z",
};

const FRESH_WORKSPACE: DeploymentState = {
    endpoint: "",
    tenantId: "",
    authType: "none",
    tokenEndpoint: "",
    audience: "",
    activeTargetName: "",
    ledger: {},
};

const STORED: DeploymentState = {
    endpoint: "https://engine.example/engine-rest",
    tenantId: "acme",
    authType: "oauth2",
    tokenEndpoint: "https://idp.example/token",
    audience: "zeebe-api",
    activeTargetName: "dev",
    ledger: { [DEV_ROW]: localRevision, [PROD_ROW]: engineRevision },
};

describe("deploymentStateFrom", () => {
    it("reads a fresh workspace as the ad-hoc defaults", () => {
        expect(deploymentStateFrom({})).toEqual(FRESH_WORKSPACE);
        expect(DEFAULT_DEPLOYMENT_STATE).toEqual(FRESH_WORKSPACE);
    });

    it("keeps every value the host stored", () => {
        expect(deploymentStateFrom({ ...STORED })).toEqual(STORED);
    });

    it.each<[string, RawDeploymentState]>([
        ["a numeric endpoint", { endpoint: 8080 }],
        ["a null tenant", { tenantId: null }],
        ["an unknown auth type", { authType: "kerberos" }],
        ["a boolean token endpoint", { tokenEndpoint: true }],
        ["an object audience", { audience: { value: "zeebe-api" } }],
        ["a list as the active target", { activeTargetName: ["dev"] }],
        ["a ledger stored as text", { ledger: JSON.stringify({ [DEV_ROW]: localRevision }) }],
        ["a ledger stored as a list", { ledger: [localRevision] }],
        ["a null ledger", { ledger: null }],
    ])("reads %s as the default", (_case, raw) => {
        expect(deploymentStateFrom(raw)).toEqual(FRESH_WORKSPACE);
    });

    it.each<[string, unknown]>([
        ["null", null],
        ["text", "0123456789abcdef"],
        ["a list", [localRevision]],
        ["without a fingerprint", { deployedAt: localRevision.deployedAt }],
        ["with a numeric fingerprint", { ...localRevision, fingerprint: 42 }],
        ["without a deploy time", { fingerprint: localRevision.fingerprint }],
        ["with a numeric deploy time", { ...localRevision, deployedAt: 1758119520000 }],
    ])("drops a ledger row that is %s and keeps the others", (_case, row) => {
        expect(
            deploymentStateFrom({ ledger: { [DEV_ROW]: row, [PROD_ROW]: engineRevision } }).ledger,
        ).toEqual({ [PROD_ROW]: engineRevision });
    });
});

describe("applyDeploymentStatePatch", () => {
    it("writes the patched fields and ledger rows together and keeps the rest", () => {
        const patch: DeploymentStatePatch = {
            endpoint: "http://localhost:8080/engine-rest",
            tenantId: "",
            authType: "basic",
            ledger: { put: { [LOCAL_ROW]: localRevision }, remove: [DEV_ROW] },
        };

        expect(applyDeploymentStatePatch(STORED, patch)).toEqual({
            endpoint: "http://localhost:8080/engine-rest",
            tenantId: "",
            authType: "basic",
            tokenEndpoint: "https://idp.example/token",
            audience: "zeebe-api",
            activeTargetName: "dev",
            ledger: { [PROD_ROW]: engineRevision, [LOCAL_ROW]: localRevision },
        });
    });

    it.each<[string, DeploymentStatePatch, DeploymentState]>([
        ["an empty patch", {}, STORED],
        ["a field set to undefined", { endpoint: undefined }, STORED],
        ["an empty ledger patch", { ledger: {} }, STORED],
        ["removing a row the ledger lacks", { ledger: { remove: [LOCAL_ROW] } }, STORED],
        [
            "selecting the ad-hoc connection",
            { activeTargetName: "" },
            { ...STORED, activeTargetName: "" },
        ],
        [
            "putting over a recorded row",
            { ledger: { put: { [DEV_ROW]: engineRevision } } },
            { ...STORED, ledger: { [DEV_ROW]: engineRevision, [PROD_ROW]: engineRevision } },
        ],
        [
            "removing and putting the same row",
            { ledger: { remove: [DEV_ROW], put: { [DEV_ROW]: engineRevision } } },
            { ...STORED, ledger: { [PROD_ROW]: engineRevision, [DEV_ROW]: engineRevision } },
        ],
        [
            "removing every row",
            { ledger: { remove: [DEV_ROW, PROD_ROW] } },
            { ...STORED, ledger: {} },
        ],
    ])("applies %s", (_case, patch, expected) => {
        expect(applyDeploymentStatePatch(STORED, patch)).toEqual(expected);
    });

    it("leaves the state it was given unchanged", () => {
        const before = structuredClone(STORED);

        applyDeploymentStatePatch(STORED, {
            activeTargetName: "prod",
            ledger: { put: { [LOCAL_ROW]: localRevision }, remove: [DEV_ROW] },
        });

        expect(STORED).toEqual(before);
    });
});

describe("patchedKeys", () => {
    it.each<[string, DeploymentStatePatch, (keyof DeploymentState)[]]>([
        ["nothing for an empty patch", {}, []],
        ["nothing for a field set to undefined", { tenantId: undefined }, []],
        ["a field set to an empty text", { activeTargetName: "" }, ["activeTargetName"]],
        ["the ledger for an empty ledger patch", { ledger: {} }, ["ledger"]],
        [
            "the fields in state order, then the ledger",
            {
                ledger: { remove: [DEV_ROW] },
                audience: "zeebe-api",
                endpoint: "https://engine.example/engine-rest",
                authType: "oauth2",
                tokenEndpoint: "https://idp.example/token",
                tenantId: "acme",
                activeTargetName: "dev",
            },
            [
                "endpoint",
                "tenantId",
                "authType",
                "tokenEndpoint",
                "audience",
                "activeTargetName",
                "ledger",
            ],
        ],
    ])("names %s", (_case, patch, expected) => {
        expect(patchedKeys(patch)).toEqual(expected);
    });
});

describe("connectionPatch", () => {
    const connection = { endpoint: "https://engine.example/engine-rest", tenantId: "acme" };

    it.each<[string, AuthConfig, DeploymentStatePatch]>([
        [
            "no auth, keeping the stored OAuth2 settings",
            new NoAuth(),
            { ...connection, authType: "none" },
        ],
        [
            "basic auth, keeping the stored OAuth2 settings",
            new BasicAuth("admin", "secret"),
            { ...connection, authType: "basic" },
        ],
        [
            "OAuth2 with its token endpoint and audience, never its client",
            new OAuth2Auth("cid", "csecret", "https://idp.example/token", "zeebe-api"),
            {
                ...connection,
                authType: "oauth2",
                tokenEndpoint: "https://idp.example/token",
                audience: "zeebe-api",
            },
        ],
    ])("remembers a deploy with %s", (_case, auth, expected) => {
        expect(connectionPatch(connection, auth)).toStrictEqual(expected);
    });
});
