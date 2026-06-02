import { describe, expect, it } from "vitest";

import { InvalidDeploymentConfigError } from "../../shared/domain/errors";

import { BasicAuth, DeploymentConfigBuilder, NoAuth } from "./deployment";

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
