import { describe, expect, it } from "vitest";

import {
    InvalidDeploymentConfigError,
    UnresolvedEnvVariableError,
} from "../../shared/domain/errors";

import { BasicAuth, DeploymentConfigBuilder, NoAuth, OAuth2Auth } from "./deployment";

function completeBuilder(): DeploymentConfigBuilder {
    return new DeploymentConfigBuilder()
        .withDeploymentName("my-process")
        .withEndpoint("https://camunda.example/engine-rest")
        .withMainFilePath("/abs/main.bpmn");
}

describe("NoAuth", () => {
    describe("toHeaders", () => {
        it("should return an empty header set", () => {
            expect(new NoAuth().toHeaders()).toEqual({});
        });
    });
});

describe("BasicAuth", () => {
    describe("toHeaders", () => {
        it("should return a Base64-encoded Authorization header", () => {
            const expected = Buffer.from("admin:secret").toString("base64");

            expect(new BasicAuth("admin", "secret").toHeaders()).toEqual({
                Authorization: `Basic ${expected}`,
            });
        });

        // Guards the RFC 7617 UTF-8 contract — Latin-1 (e.g. btoa) would
        // produce a different base64 string and break interoperability.
        it("should UTF-8-encode non-ASCII credentials before base64", () => {
            const expected = Buffer.from("user:name:p@ss:wörd").toString("base64");

            expect(new BasicAuth("user:name", "p@ss:wörd").toHeaders()).toEqual({
                Authorization: `Basic ${expected}`,
            });
        });
    });
});

describe("DeploymentConfigBuilder", () => {
    describe("build", () => {
        it("passes every field through and defaults auth to NoAuth", () => {
            const auth = new BasicAuth("admin", "secret");

            const config = completeBuilder()
                .withTenantId("tenant-1")
                .withEngine("c8")
                .withAdditionalFilePaths(["/abs/form.form"])
                .withAuth(auth)
                .build();

            expect(config).toMatchObject({
                deploymentName: "my-process",
                tenantId: "tenant-1",
                endpoint: "https://camunda.example/engine-rest",
                engine: "c8",
                mainFilePath: "/abs/main.bpmn",
                additionalFilePaths: ["/abs/form.form"],
                auth,
            });
        });

        it("defaults auth to NoAuth when left unset", () => {
            expect(completeBuilder().build().auth).toBeInstanceOf(NoAuth);
        });

        it("carries a deployUrl override and normalises blank values to undefined", () => {
            expect(completeBuilder().withDeployUrl("https://gw/deploy").build().deployUrl).toBe(
                "https://gw/deploy",
            );
            expect(completeBuilder().withDeployUrl("   ").build().deployUrl).toBeUndefined();
            expect(completeBuilder().build().deployUrl).toBeUndefined();
        });

        it.each([
            ["deploymentName", (b: DeploymentConfigBuilder) => b.withDeploymentName("")],
            ["endpoint", (b: DeploymentConfigBuilder) => b.withEndpoint("")],
            ["mainFilePath", (b: DeploymentConfigBuilder) => b.withMainFilePath("")],
        ])("throws listing %s when it is missing", (field, clear) => {
            expect(() => clear(completeBuilder()).build()).toThrow(
                new InvalidDeploymentConfigError([field]),
            );
        });

        // Whitespace-only values are functionally empty: build() trims before
        // the emptiness check (deployment.ts:186), so they must be rejected too.
        it("treats whitespace-only required fields as missing", () => {
            expect(() => completeBuilder().withDeploymentName("   ").build()).toThrow(
                new InvalidDeploymentConfigError(["deploymentName"]),
            );
        });

        it("lists all missing fields together in declared order", () => {
            expect(() => new DeploymentConfigBuilder().build()).toThrow(
                new InvalidDeploymentConfigError(["deploymentName", "endpoint", "mainFilePath"]),
            );
        });
    });
});

describe("env reference expansion", () => {
    const lookup = (map: Record<string, string>) => (name: string) => map[name];

    it("expands every oauth2 field", () => {
        const resolved = new OAuth2Auth(
            "${env:CID}",
            "${env:SECRET}",
            "https://idp/token",
            "${env:AUD}",
        ).expandEnvRefs(lookup({ CID: "cid", SECRET: "sec", AUD: "aud" }));
        expect(resolved).toEqual(new OAuth2Auth("cid", "sec", "https://idp/token", "aud"));
    });

    it("returns NoAuth untouched", () => {
        const auth = new NoAuth();
        expect(auth.expandEnvRefs(lookup({}))).toBe(auth);
    });

    it("expands the connection fields of a config and leaves the original literal", () => {
        const config = completeBuilder()
            .withEndpoint("${env:URL}")
            .withTenantId("${env:TENANT}")
            .withDeployUrl("${env:URL}/deployment/create")
            .withAuth(new BasicAuth("${env:USER}", "${env:PASS}"))
            .build();
        const resolved = config.expandEnvRefs(
            lookup({ URL: "https://c.example", TENANT: "acme", USER: "u", PASS: "p" }),
        );
        expect(resolved.endpoint).toBe("https://c.example");
        expect(resolved.tenantId).toBe("acme");
        expect(resolved.deployUrl).toBe("https://c.example/deployment/create");
        expect(resolved.auth).toEqual(new BasicAuth("u", "p"));
        expect(resolved.mainFilePath).toBe(config.mainFilePath);
        expect(config.endpoint).toBe("${env:URL}");
    });

    it("throws naming the field when a variable is unset", () => {
        const config = completeBuilder().withEndpoint("${env:URL}").build();
        expect(() => config.expandEnvRefs(lookup({}))).toThrow(UnresolvedEnvVariableError);
    });

    it("blanks whole-ref credentials but keeps literals and partial interpolation", () => {
        expect(new BasicAuth("${env:U}", "x-${env:P}").withoutWholeEnvRefs()).toEqual(
            new BasicAuth("", "x-${env:P}"),
        );
        expect(
            new OAuth2Auth("cid", "${env:S}", "${env:TOKEN_URL}", "aud").withoutWholeEnvRefs(),
        ).toEqual(new OAuth2Auth("cid", "", "${env:TOKEN_URL}", "aud"));
    });
});
