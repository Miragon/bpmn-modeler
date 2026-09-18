import { describe, expect, it } from "vitest";

import { InvalidDeploymentTargetsFileError } from "../../shared/domain/errors";

import {
    DeploymentTarget,
    DeploymentTargets,
    parseDeploymentTargetsFile,
    serializeDeploymentTargets,
} from "./deploymentTarget";

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
    );
}

describe("parseDeploymentTargetsFile", () => {
    it("parses a full target including auth and endpoint overrides", () => {
        const [parsed] = parseDeploymentTargetsFile({
            targets: [
                {
                    name: "  dev  ",
                    engine: "c7",
                    endpoint: "http://localhost:8080/engine-rest",
                    tenantId: "acme",
                    auth: {
                        type: "oauth2",
                        tokenEndpoint: "https://login/oauth/token",
                        audience: "aud",
                    },
                    endpoints: {
                        deploy: "https://gw/deploy",
                        startInstance: "https://gw/{processDefinitionKey}/start",
                    },
                },
            ],
        });

        expect(parsed).toEqual(
            new DeploymentTarget(
                "dev",
                "c7",
                "http://localhost:8080/engine-rest",
                "acme",
                "oauth2",
                "https://login/oauth/token",
                "aud",
                "https://gw/deploy",
                "https://gw/{processDefinitionKey}/start",
            ),
        );
    });

    it("defaults auth to none and leaves overrides undefined when absent", () => {
        const [parsed] = parseDeploymentTargetsFile({
            targets: [{ name: "dev", engine: "c8", endpoint: "http://host" }],
        });

        expect(parsed.authType).toBe("none");
        expect(parsed.tenantId).toBe("");
        expect(parsed.deployUrl).toBeUndefined();
        expect(parsed.startInstanceUrl).toBeUndefined();
    });

    it("ignores a top-level $schema reference", () => {
        const parsed = parseDeploymentTargetsFile({
            $schema: "./deployment-targets.schema.json",
            targets: [{ name: "dev", engine: "c7", endpoint: "http://host" }],
        });

        expect(parsed.map((t) => t.name)).toEqual(["dev"]);
    });

    it.each([
        ["a non-object", 42],
        ["a missing targets array", { targets: "nope" }],
        ["an empty name", { targets: [{ name: "  ", engine: "c7", endpoint: "http://h" }] }],
        ["an unknown engine", { targets: [{ name: "d", engine: "c9", endpoint: "http://h" }] }],
        ["a missing endpoint", { targets: [{ name: "d", engine: "c7" }] }],
        [
            "an unknown auth type",
            { targets: [{ name: "d", engine: "c7", endpoint: "http://h", auth: { type: "x" } }] },
        ],
    ])("throws on %s", (_desc, json) => {
        expect(() => parseDeploymentTargetsFile(json)).toThrow(InvalidDeploymentTargetsFileError);
    });

    it("rejects duplicate names", () => {
        expect(() =>
            parseDeploymentTargetsFile({
                targets: [
                    { name: "dev", engine: "c7", endpoint: "http://h" },
                    { name: "dev", engine: "c8", endpoint: "http://h2" },
                ],
            }),
        ).toThrow(InvalidDeploymentTargetsFileError);
    });
});

describe("serializeDeploymentTargets", () => {
    it("round-trips through the parser", () => {
        const targets = [
            target("dev", {
                authType: "oauth2",
                tokenEndpoint: "https://login/token",
                audience: "aud",
                deployUrl: "https://gw/deploy",
            }),
            target("prod", { engine: "c8" }),
        ];

        const parsed = parseDeploymentTargetsFile(JSON.parse(serializeDeploymentTargets(targets)));

        expect(parsed).toEqual(targets);
    });

    it("omits the endpoints block when there are no overrides", () => {
        expect(serializeDeploymentTargets([target("dev")])).not.toContain("endpoints");
    });
});

describe("DeploymentTargets", () => {
    it("appends a new target on upsert", () => {
        const result = new DeploymentTargets([target("dev")]).upsert(target("prod"));
        expect(result.map((t) => t.name)).toEqual(["dev", "prod"]);
    });

    it("replaces an existing target by name", () => {
        const result = new DeploymentTargets([target("dev", { tenantId: "old" })]).upsert(
            target("dev", { tenantId: "new" }),
        );
        expect(result).toHaveLength(1);
        expect(result[0].tenantId).toBe("new");
    });

    it("drops the previous name on rename", () => {
        const result = new DeploymentTargets([target("dev"), target("prod")]).upsert(
            target("staging"),
            "dev",
        );
        expect(result.map((t) => t.name)).toEqual(["prod", "staging"]);
    });

    it("removes by name", () => {
        const result = new DeploymentTargets([target("dev"), target("prod")]).remove("dev");
        expect(result.map((t) => t.name)).toEqual(["prod"]);
    });

    it("finds by trimmed name", () => {
        const targets = new DeploymentTargets([target("dev")]);
        expect(targets.find("  dev  ")?.name).toBe("dev");
        expect(targets.find("missing")).toBeUndefined();
    });
});
