import { describe, expect, it } from "vitest";

import {
    DisallowedEnvReferenceError,
    InvalidCredentialDestinationError,
    InvalidDeploymentConfigError,
    UnresolvedEnvVariableError,
} from "./errors";

import { AuthConfig, BasicAuth, DeploymentConfigBuilder, NoAuth, OAuth2Auth } from "./deployment";
import { emptyEnvLookup, EnvLookup, referenceableVariables } from "./envRef";
import { InspectionRequest } from "./inspectionRequest";

const ENDPOINT = "https://camunda.example/engine-rest";

const lookup =
    (map: Record<string, string>): EnvLookup =>
    (name) =>
        map[name];

const envFile = (variables: Record<string, string>) =>
    referenceableVariables(new Map(Object.entries(variables)), "/ws/.env");

function errorFrom(action: () => unknown): unknown {
    try {
        action();
    } catch (error) {
        return error;
    }
    throw new Error("expected the action to throw");
}

interface RequestFields {
    readonly endpoint?: string;
    readonly tenantId?: string;
    readonly processKey?: string;
    readonly auth?: AuthConfig;
}

function request(fields: RequestFields = {}): InspectionRequest {
    return new InspectionRequest(
        fields.endpoint ?? ENDPOINT,
        fields.tenantId ?? "",
        fields.processKey ?? "order",
        fields.auth ?? new NoAuth(),
    );
}

/** The deploy config of the same connection, which sends to its endpoint without an override. */
function deployConfig(fields: RequestFields = {}) {
    return new DeploymentConfigBuilder()
        .withDeploymentName("order")
        .withEndpoint(fields.endpoint ?? ENDPOINT)
        .withTenantId(fields.tenantId ?? "")
        .withMainFilePath("/ws/order.bpmn")
        .withAuth(fields.auth ?? new NoAuth())
        .build();
}

describe("InspectionRequest", () => {
    describe("referencesEnv", () => {
        it("is false for a literal request", () => {
            expect(
                request({
                    tenantId: "acme",
                    auth: new OAuth2Auth("cid", "s", "https://idp.example/token", "aud"),
                }).referencesEnv(),
            ).toBe(false);
        });

        it.each<[string, RequestFields]>([
            ["endpoint", { endpoint: "${env:MIRAGON_URL}/engine-rest" }],
            ["tenantId", { tenantId: "${env:MIRAGON_TENANT}" }],
            ["auth.password", { auth: new BasicAuth("admin", "${env:MIRAGON_PW}") }],
            [
                "auth.tokenEndpoint",
                { auth: new OAuth2Auth("cid", "s", "https://${env:MIRAGON_IDP}/token", "aud") },
            ],
        ])("is true when %s holds a ref", (_field, fields) => {
            expect(request(fields).referencesEnv()).toBe(true);
        });

        it("counts a malformed ref so it reaches validation", () => {
            expect(request({ tenantId: "${env:" }).referencesEnv()).toBe(true);
        });
    });

    describe("expandEnvRefs", () => {
        it("expands endpoint, tenant and auth but not the process key", () => {
            const literal = request({
                endpoint: "${env:MIRAGON_URL}/engine-rest",
                tenantId: "${env:MIRAGON_TENANT}",
                processKey: "${env:MIRAGON_KEY}",
                auth: new BasicAuth("${env:MIRAGON_USER}", "${env:MIRAGON_PW}"),
            });

            const expanded = literal.expandEnvRefs(
                lookup({
                    MIRAGON_URL: "https://c.example",
                    MIRAGON_TENANT: "acme",
                    MIRAGON_KEY: "resolved-key",
                    MIRAGON_USER: "u",
                    MIRAGON_PW: "p",
                }),
            );

            expect(expanded).toEqual(
                new InspectionRequest(
                    "https://c.example/engine-rest",
                    "acme",
                    "${env:MIRAGON_KEY}",
                    new BasicAuth("u", "p"),
                    expect.any(Array),
                ),
            );
            expect([...expanded.envValues].sort()).toEqual(["acme", "https://c.example", "p", "u"]);
        });

        it("carries only the .env values it used", () => {
            const expanded = request({ tenantId: "${env:MIRAGON_TENANT}" }).expandEnvRefs(
                envFile({ MIRAGON_TENANT: "acme", MIRAGON_UNUSED: "sp4re" }),
            );

            expect(expanded.envValues).toEqual(["acme"]);
        });

        it("leaves the original request literal", () => {
            const literal = request({
                endpoint: "${env:MIRAGON_URL}",
                auth: new BasicAuth("admin", "${env:MIRAGON_PW}"),
            });

            literal.expandEnvRefs(lookup({ MIRAGON_URL: "https://c.example", MIRAGON_PW: "p" }));

            expect(literal.endpoint).toBe("${env:MIRAGON_URL}");
            expect(literal.auth).toEqual(new BasicAuth("admin", "${env:MIRAGON_PW}"));
            expect(literal.envValues).toEqual([]);
        });

        it("expands a literal request without consulting the lookup", () => {
            const unusableLookup = () => {
                throw new Error("lookup must not be consulted");
            };

            expect(
                request({ tenantId: "acme", auth: new BasicAuth("admin", "pw") }).expandEnvRefs(
                    unusableLookup,
                ),
            ).toEqual(request({ tenantId: "acme", auth: new BasicAuth("admin", "pw") }));
        });

        it.each(["", "   "])(
            "rejects an endpoint variable set to %j like an empty field",
            (value) => {
                expect(() =>
                    request({ endpoint: "${env:MIRAGON_URL}" }).expandEnvRefs(
                        lookup({ MIRAGON_URL: value }),
                    ),
                ).toThrow(new InvalidDeploymentConfigError(["endpoint"]));
            },
        );

        it("keeps a tenant variable set to an empty value empty", () => {
            expect(
                request({ tenantId: "${env:MIRAGON_TENANT}" }).expandEnvRefs(
                    lookup({ MIRAGON_TENANT: "" }),
                ).tenantId,
            ).toBe("");
        });

        it.each<[string, RequestFields, string]>([
            ["endpoint", { endpoint: "${env:MIRAGON_URL}" }, "MIRAGON_URL"],
            ["tenantId", { tenantId: "${env:MIRAGON_TENANT}" }, "MIRAGON_TENANT"],
            ["auth.password", { auth: new BasicAuth("admin", "${env:MIRAGON_PW}") }, "MIRAGON_PW"],
        ])("names the JSON field %s of an unset variable", (field, fields, variable) => {
            const error = errorFrom(() =>
                request(fields).expandEnvRefs(emptyEnvLookup("/ws/.env")),
            );

            expect(error).toBeInstanceOf(UnresolvedEnvVariableError);
            expect(error).toMatchObject({ field, variable });
            expect((error as Error).message).toContain("/ws/.env");
        });

        it.each<[string, RequestFields]>([
            ["endpoint", { endpoint: "${env:HOME}/engine-rest" }],
            ["tenantId", { tenantId: "${env:TENANT}" }],
        ])("rejects a foreign ref in %s even when the lookup could resolve it", (field, fields) => {
            const error = errorFrom(() =>
                request(fields).expandEnvRefs(lookup({ HOME: "/Users/me", TENANT: "acme" })),
            );

            expect(error).toBeInstanceOf(DisallowedEnvReferenceError);
            expect(error).toMatchObject({ field });
        });
    });

    describe("sensitiveDestinations", () => {
        it.each<[string, RequestFields, Record<string, string>, string[]]>([
            [
                "the endpoint origin for credentials",
                {
                    endpoint: "https://camunda.example:8443/engine-rest",
                    auth: new BasicAuth("admin", "secret"),
                },
                {},
                ["https://camunda.example:8443"],
            ],
            [
                "the endpoint and token endpoint origins for oauth2",
                {
                    endpoint: "https://zeebe.example",
                    auth: new OAuth2Auth("cid", "s", "https://idp.example/token", "aud"),
                },
                {},
                ["https://idp.example", "https://zeebe.example"],
            ],
            ["nothing for a literal request without credentials", {}, {}, []],
            [
                "nothing for a literal request without credentials beside a .env with values",
                {},
                { MIRAGON_HOST: "camunda.example" },
                [],
            ],
            [
                "nothing for a request whose only ref resolves to an empty value",
                { tenantId: "${env:MIRAGON_TENANT}" },
                { MIRAGON_TENANT: "" },
                [],
            ],
            [
                "the endpoint origin for a request without credentials whose only ref is the tenant",
                { tenantId: "${env:MIRAGON_TENANT}" },
                { MIRAGON_TENANT: "acme" },
                ["https://camunda.example"],
            ],
            [
                "the resolved host once env refs are expanded",
                {
                    endpoint: "https://${env:MIRAGON_HOST}/engine-rest",
                    auth: new BasicAuth("admin", "secret"),
                },
                { MIRAGON_HOST: "evil.example" },
                ["https://evil.example"],
            ],
        ])("is %s, as for a deploy to the same connection", (_case, fields, variables, origins) => {
            const env = envFile(variables);

            expect(request(fields).expandEnvRefs(env).sensitiveDestinations().origins).toEqual(
                origins,
            );
            expect(deployConfig(fields).expandEnvRefs(env).sensitiveDestinations().origins).toEqual(
                origins,
            );
        });

        it("refuses an endpoint without a host when it sends credentials", () => {
            const hostless = request({
                endpoint: "localhost:8080/engine-rest",
                auth: new BasicAuth("admin", "pw"),
            });

            expect(() => hostless.sensitiveDestinations()).toThrow(
                InvalidCredentialDestinationError,
            );
        });
    });

    describe("redactor", () => {
        it("masks the literal credentials", () => {
            expect(
                request({ auth: new BasicAuth("admin", "s3cret") })
                    .redactor()
                    .redact("admin:s3cret rejected"),
            ).toBe("***:*** rejected");
        });

        it("masks the expanded credentials and the .env values the request used, but no other", () => {
            const redactor = request({
                endpoint: "https://${env:MIRAGON_HOST}/engine-rest",
                auth: new BasicAuth("admin", "${env:MIRAGON_PASSWORD}"),
            })
                .expandEnvRefs(
                    envFile({
                        MIRAGON_HOST: "camunda.example",
                        MIRAGON_PASSWORD: "s3cret",
                        MIRAGON_UNUSED: "sp4re",
                    }),
                )
                .redactor();

            expect(redactor.redact("admin s3cret camunda.example sp4re")).toBe("*** *** *** sp4re");
        });

        it("masks nothing for a literal request without credentials", () => {
            const message = `${ENDPOINT} rejected`;

            expect(request().redactor().redact(message)).toBe(message);
        });
    });
});
