import { describe, expect, it } from "vitest";

import {
    DisallowedEnvReferenceError,
    InvalidCredentialDestinationError,
    InvalidDeploymentConfigError,
    UnresolvedEnvVariableError,
} from "../../shared/domain/errors";

import { BasicAuth, DeploymentConfigBuilder, NoAuth, OAuth2Auth } from "./deployment";
import { referenceableVariables } from "./envRef";

function completeBuilder(): DeploymentConfigBuilder {
    return new DeploymentConfigBuilder()
        .withDeploymentName("my-process")
        .withEndpoint("https://camunda.example/engine-rest")
        .withMainFilePath("/abs/main.bpmn");
}

function errorFrom(action: () => unknown): unknown {
    try {
        action();
    } catch (error) {
        return error;
    }
    throw new Error("expected the action to throw");
}

describe("NoAuth", () => {
    describe("toHeaders", () => {
        it("should return an empty header set", () => {
            expect(new NoAuth().toHeaders()).toEqual({});
        });
    });

    describe("destinationsFor", () => {
        it("has no destination to approve, even for an unparseable URL", () => {
            expect(new NoAuth().destinationsFor("https://camunda.example").isEmpty()).toBe(true);
            expect(new NoAuth().destinationsFor("not a url").isEmpty()).toBe(true);
        });
    });

    describe("redactor", () => {
        it("masks nothing", () => {
            expect(new NoAuth().redactor().redact("admin s3cret")).toBe("admin s3cret");
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

    describe("destinationsFor", () => {
        it("is the origin of the request URL", () => {
            expect(
                new BasicAuth("admin", "secret").destinationsFor(
                    "https://camunda.example:8443/engine-rest/deployment/create",
                ).origins,
            ).toEqual(["https://camunda.example:8443"]);
        });

        it("throws for a request URL without a host", () => {
            expect(() => new BasicAuth("admin", "secret").destinationsFor("/engine-rest")).toThrow(
                InvalidCredentialDestinationError,
            );
        });
    });

    describe("redactor", () => {
        it("masks the username and the password", () => {
            expect(
                new BasicAuth("admin", "s3cret").redactor().redact("user admin, password s3cret"),
            ).toBe("user ***, password ***");
        });

        it("skips a blank username instead of masking every space", () => {
            expect(new BasicAuth(" ", "s3cret").redactor().redact("bad password s3cret")).toBe(
                "bad password ***",
            );
        });
    });
});

describe("OAuth2Auth", () => {
    const auth = new OAuth2Auth(
        "client-1",
        "s3cret",
        "https://idp.example/oauth/token",
        "zeebe-api",
    );

    describe("destinationsFor", () => {
        it("is the request origin and the token endpoint origin", () => {
            expect(auth.destinationsFor("https://zeebe.example/v2/deployments").origins).toEqual([
                "https://idp.example",
                "https://zeebe.example",
            ]);
        });

        it("collapses a token endpoint on the request origin", () => {
            expect(auth.destinationsFor("https://idp.example/v2/deployments").origins).toEqual([
                "https://idp.example",
            ]);
        });

        it("throws for a token endpoint without a host", () => {
            const withoutTokenEndpoint = new OAuth2Auth("client-1", "s3cret", "", "zeebe-api");

            expect(() =>
                withoutTokenEndpoint.destinationsFor("https://zeebe.example/v2/deployments"),
            ).toThrow(InvalidCredentialDestinationError);
        });
    });

    describe("redactor", () => {
        it("masks the client id and secret but not the token endpoint or audience", () => {
            expect(
                auth.redactor().redact("client-1 s3cret https://idp.example/oauth/token zeebe-api"),
            ).toBe("*** *** https://idp.example/oauth/token zeebe-api");
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

describe("env references", () => {
    const lookup = (map: Record<string, string>) => (name: string) => map[name];

    describe("referencesEnv", () => {
        it("is false for NoAuth", () => {
            expect(new NoAuth().referencesEnv()).toBe(false);
        });

        it.each([
            ["username", new BasicAuth("${env:MIRAGON_USER}", "secret")],
            ["password", new BasicAuth("admin", "${env:MIRAGON_PASSWORD}")],
        ])("is true when the basic %s holds a ref", (_field, auth) => {
            expect(auth.referencesEnv()).toBe(true);
        });

        it.each([
            ["clientId", new OAuth2Auth("${env:MIRAGON_CID}", "s", "https://idp/token", "aud")],
            ["clientSecret", new OAuth2Auth("cid", "${env:MIRAGON_S}", "https://idp/token", "aud")],
            ["tokenEndpoint", new OAuth2Auth("cid", "s", "${env:MIRAGON_IDP}/token", "aud")],
            ["audience", new OAuth2Auth("cid", "s", "https://idp/token", "${env:MIRAGON_AUD}")],
        ])("is true when the oauth2 %s holds a ref", (_field, auth) => {
            expect(auth.referencesEnv()).toBe(true);
        });

        it("is false for literal credentials", () => {
            expect(new BasicAuth("admin", "secret").referencesEnv()).toBe(false);
            expect(new OAuth2Auth("cid", "s", "https://idp/token", "aud").referencesEnv()).toBe(
                false,
            );
        });

        it.each([
            ["endpoint", completeBuilder().withEndpoint("${env:MIRAGON_URL}")],
            ["tenantId", completeBuilder().withTenantId("${env:MIRAGON_TENANT}")],
            ["deployUrl", completeBuilder().withDeployUrl("${env:MIRAGON_URL}/deploy")],
            ["auth", completeBuilder().withAuth(new BasicAuth("admin", "${env:MIRAGON_PW}"))],
        ])("is true when the config's %s holds a ref", (_field, builder) => {
            expect(builder.build().referencesEnv()).toBe(true);
        });

        it("is false for a fully literal config", () => {
            const config = completeBuilder()
                .withTenantId("acme")
                .withDeployUrl("https://gw/deploy")
                .withAuth(new BasicAuth("admin", "secret"))
                .build();

            expect(config.referencesEnv()).toBe(false);
        });

        it("counts a malformed ref so it reaches validation", () => {
            expect(completeBuilder().withEndpoint("${env:").build().referencesEnv()).toBe(true);
        });
    });

    describe("assertCredentialEnvRefsValid", () => {
        it("passes literals and prefixed refs", () => {
            expect(() => new NoAuth().assertCredentialEnvRefsValid()).not.toThrow();
            expect(() =>
                new BasicAuth("${env:MIRAGON_USER}", "literal").assertCredentialEnvRefsValid(),
            ).not.toThrow();
            expect(() =>
                new OAuth2Auth(
                    "${env:MIRAGON_CID}",
                    "secret",
                    "https://${env:MIRAGON_IDP}/token",
                    "aud",
                ).assertCredentialEnvRefsValid(),
            ).not.toThrow();
        });

        it.each([
            ["auth.username", new BasicAuth("${env:GITHUB_TOKEN}", "secret")],
            ["auth.password", new BasicAuth("admin", "${env:MIRAGON_PW")],
            ["auth.clientId", new OAuth2Auth("${env:CID}", "s", "https://idp/token", "aud")],
            ["auth.clientSecret", new OAuth2Auth("cid", "${env:}", "https://idp/token", "aud")],
        ])("names the JSON field %s of a disallowed ref", (field, auth) => {
            const error = errorFrom(() => auth.assertCredentialEnvRefsValid());

            expect(error).toBeInstanceOf(DisallowedEnvReferenceError);
            expect(error).toMatchObject({ field });
        });

        it("leaves the oauth2 token endpoint and audience to the target's validation", () => {
            const auth = new OAuth2Auth("cid", "s", "${env:HOME}/token", "${env:MIRAGON_}");

            expect(() => auth.assertCredentialEnvRefsValid()).not.toThrow();
        });
    });

    describe.each([
        ["an unclosed ref", "p${env:hunter2rest"],
        ["a ref name with a space", "${env:hunter 2}"],
        ["a well-formed foreign ref", "p${env:hunter2}rest"],
    ])("a credential holding %s", (_desc, secret) => {
        function thrownMessage(action: () => unknown): string {
            const error = errorFrom(action);
            expect(error).toBeInstanceOf(DisallowedEnvReferenceError);
            return (error as Error).message;
        }

        it.each([
            ["auth.password", new BasicAuth("admin", secret)],
            ["auth.clientSecret", new OAuth2Auth("cid", secret, "https://idp", "aud")],
        ])("is never echoed from %s on validation or expansion", (field, auth) => {
            const messages = [
                thrownMessage(() => auth.assertCredentialEnvRefsValid()),
                thrownMessage(() => auth.expandEnvRefs(lookup({}))),
            ];

            for (const message of messages) {
                expect(message).toContain(`"${field}" contains an invalid environment reference`);
                expect(message).not.toContain("hunter");
            }
        });
    });

    describe("expandEnvRefs", () => {
        it("expands every oauth2 field", () => {
            const resolved = new OAuth2Auth(
                "${env:MIRAGON_CID}",
                "${env:MIRAGON_SECRET}",
                "${env:MIRAGON_IDP}/token",
                "${env:MIRAGON_AUD}",
            ).expandEnvRefs(
                lookup({
                    MIRAGON_CID: "cid",
                    MIRAGON_SECRET: "sec",
                    MIRAGON_IDP: "https://idp",
                    MIRAGON_AUD: "aud",
                }),
            );
            expect(resolved).toEqual(new OAuth2Auth("cid", "sec", "https://idp/token", "aud"));
        });

        it("expands a padded whole basic ref without the padding", () => {
            const resolved = new BasicAuth(
                " ${env:MIRAGON_USER}",
                "  ${env:MIRAGON_PW}  ",
            ).expandEnvRefs(lookup({ MIRAGON_USER: "u", MIRAGON_PW: "s3cret" }));

            expect(resolved).toEqual(new BasicAuth("u", "s3cret"));
        });

        it("expands a padded whole oauth2 client ref without the padding", () => {
            const resolved = new OAuth2Auth(
                "${env:MIRAGON_CID} ",
                "\t${env:MIRAGON_SECRET}\n",
                "https://idp/token",
                "aud",
            ).expandEnvRefs(lookup({ MIRAGON_CID: "cid", MIRAGON_SECRET: "sec" }));

            expect(resolved).toEqual(new OAuth2Auth("cid", "sec", "https://idp/token", "aud"));
        });

        it("keeps padded literals and partial interpolation in credentials as typed", () => {
            expect(
                new BasicAuth(" admin ", " p-${env:MIRAGON_PW} ").expandEnvRefs(
                    lookup({ MIRAGON_PW: "x" }),
                ),
            ).toEqual(new BasicAuth(" admin ", " p-x "));
        });

        it.each([
            ["auth.username", new BasicAuth("${env:MIRAGON_U}", "p"), "MIRAGON_U"],
            ["auth.password", new BasicAuth("u", "${env:MIRAGON_P}"), "MIRAGON_P"],
            [
                "auth.clientId",
                new OAuth2Auth("${env:MIRAGON_CID}", "s", "https://idp/token", "aud"),
                "MIRAGON_CID",
            ],
            [
                "auth.clientSecret",
                new OAuth2Auth("cid", "${env:MIRAGON_S}", "https://idp/token", "aud"),
                "MIRAGON_S",
            ],
            [
                "auth.tokenEndpoint",
                new OAuth2Auth("cid", "s", "${env:MIRAGON_IDP}/token", "aud"),
                "MIRAGON_IDP",
            ],
            [
                "auth.audience",
                new OAuth2Auth("cid", "s", "https://idp/token", "${env:MIRAGON_AUD}"),
                "MIRAGON_AUD",
            ],
        ])("names the JSON field %s of an unset variable", (field, auth, variable) => {
            const error = errorFrom(() => auth.expandEnvRefs(lookup({})));

            expect(error).toBeInstanceOf(UnresolvedEnvVariableError);
            expect(error).toMatchObject({ field, variable });
        });

        it.each([
            ["auth.tokenEndpoint", new OAuth2Auth("cid", "s", "${env:HOME}/token", "aud")],
            ["auth.audience", new OAuth2Auth("cid", "s", "https://idp/token", "${env:MIRAGON_}")],
        ])("rejects a disallowed ref in %s on expansion", (field, auth) => {
            const error = errorFrom(() => auth.expandEnvRefs(lookup({ HOME: "/Users/me" })));

            expect(error).toBeInstanceOf(DisallowedEnvReferenceError);
            expect(error).toMatchObject({ field });
        });

        it("returns NoAuth untouched", () => {
            const auth = new NoAuth();
            expect(auth.expandEnvRefs(lookup({}))).toBe(auth);
        });

        it("expands the connection fields of a config and leaves the original literal", () => {
            const config = completeBuilder()
                .withEndpoint("${env:MIRAGON_URL}")
                .withTenantId("${env:MIRAGON_TENANT}")
                .withEngine("c8")
                .withAdditionalFilePaths(["/abs/form.form"])
                .withDeployUrl("${env:MIRAGON_URL}/deployment/create")
                .withAuth(new BasicAuth("${env:MIRAGON_USER}", "${env:MIRAGON_PASS}"))
                .build();
            const resolved = config.expandEnvRefs(
                lookup({
                    MIRAGON_URL: "https://c.example",
                    MIRAGON_TENANT: "acme",
                    MIRAGON_USER: "u",
                    MIRAGON_PASS: "p",
                }),
            );
            expect(resolved).toMatchObject({
                deploymentName: "my-process",
                endpoint: "https://c.example",
                tenantId: "acme",
                engine: "c8",
                mainFilePath: "/abs/main.bpmn",
                additionalFilePaths: ["/abs/form.form"],
                deployUrl: "https://c.example/deployment/create",
                auth: new BasicAuth("u", "p"),
            });
            expect(config.endpoint).toBe("${env:MIRAGON_URL}");
            expect(config.tenantId).toBe("${env:MIRAGON_TENANT}");
            expect(config.deployUrl).toBe("${env:MIRAGON_URL}/deployment/create");
            expect(config.auth).toEqual(
                new BasicAuth("${env:MIRAGON_USER}", "${env:MIRAGON_PASS}"),
            );
        });

        it.each([
            ["endpoint", completeBuilder().withEndpoint("${env:MIRAGON_URL}"), "MIRAGON_URL"],
            ["tenantId", completeBuilder().withTenantId("${env:MIRAGON_TENANT}"), "MIRAGON_TENANT"],
            [
                "endpoints.deploy",
                completeBuilder().withDeployUrl("${env:MIRAGON_GW}/deploy"),
                "MIRAGON_GW",
            ],
            [
                "auth.password",
                completeBuilder().withAuth(new BasicAuth("admin", "${env:MIRAGON_PW}")),
                "MIRAGON_PW",
            ],
        ])("names the JSON field %s of an unset variable", (field, builder, variable) => {
            const config = builder.build();

            const error = errorFrom(() => config.expandEnvRefs(lookup({})));

            expect(error).toBeInstanceOf(UnresolvedEnvVariableError);
            expect(error).toMatchObject({ field, variable });
        });

        it.each([
            ["endpoint", completeBuilder().withEndpoint("${env:HOME}/engine-rest")],
            ["tenantId", completeBuilder().withTenantId("${env:TENANT}")],
            ["endpoints.deploy", completeBuilder().withDeployUrl("${env:HOME}/deploy")],
            [
                "auth.password",
                completeBuilder().withAuth(new BasicAuth("admin", "${env:GITHUB_TOKEN}")),
            ],
        ])(
            "rejects a foreign ref in %s even when the lookup could resolve it",
            (field, builder) => {
                const config = builder.build();
                const foreignLookup = lookup({
                    HOME: "/Users/me",
                    TENANT: "acme",
                    GITHUB_TOKEN: "ghp_secret",
                });

                const error = errorFrom(() => config.expandEnvRefs(foreignLookup));

                expect(error).toBeInstanceOf(DisallowedEnvReferenceError);
                expect(error).toMatchObject({ field });
            },
        );

        it.each([
            ["empty", ""],
            ["blank", "   "],
        ])(
            "falls back to the convention route when the deploy URL variable is %s",
            (_desc, value) => {
                const config = completeBuilder().withDeployUrl("${env:MIRAGON_DEPLOY_URL}").build();

                expect(
                    config.expandEnvRefs(lookup({ MIRAGON_DEPLOY_URL: value })).deployUrl,
                ).toBeUndefined();
            },
        );

        it("trims the expanded deploy URL like a typed one", () => {
            const config = completeBuilder().withDeployUrl("${env:MIRAGON_DEPLOY_URL}").build();

            expect(
                config.expandEnvRefs(lookup({ MIRAGON_DEPLOY_URL: "  https://gw/deploy  " }))
                    .deployUrl,
            ).toBe("https://gw/deploy");
        });

        it.each([
            ["empty", ""],
            ["blank", "   "],
        ])("rejects an endpoint whose variable is %s", (_desc, value) => {
            const config = completeBuilder().withEndpoint("${env:MIRAGON_URL}").build();

            expect(() => config.expandEnvRefs(lookup({ MIRAGON_URL: value }))).toThrow(
                new InvalidDeploymentConfigError(["endpoint"]),
            );
        });

        it("accepts a tenant variable set to an empty value", () => {
            const config = completeBuilder().withTenantId("${env:MIRAGON_TENANT}").build();

            expect(config.expandEnvRefs(lookup({ MIRAGON_TENANT: "" })).tenantId).toBe("");
        });
    });
});

describe("DeploymentConfig", () => {
    const envFile = (variables: Record<string, string>) =>
        referenceableVariables(new Map(Object.entries(variables)), "/ws/.env");

    describe("sensitiveDestinations", () => {
        it("is the endpoint origin, which the conventional route keeps", () => {
            const config = completeBuilder()
                .withEndpoint("https://camunda.example:8443/engine-rest")
                .withAuth(new BasicAuth("admin", "secret"))
                .build();

            expect(config.sensitiveDestinations().origins).toEqual([
                "https://camunda.example:8443",
            ]);
        });

        it("prefers the deploy URL override over the endpoint", () => {
            const config = completeBuilder()
                .withEndpoint("https://camunda.example/engine-rest")
                .withDeployUrl("https://gateway.example/deploy")
                .withAuth(new BasicAuth("admin", "secret"))
                .build();

            expect(config.sensitiveDestinations().origins).toEqual(["https://gateway.example"]);
        });

        it("adds the token endpoint for oauth2", () => {
            const config = completeBuilder()
                .withEndpoint("https://zeebe.example")
                .withAuth(new OAuth2Auth("cid", "s", "https://idp.example/token", "aud"))
                .build();

            expect(config.sensitiveDestinations().origins).toEqual([
                "https://idp.example",
                "https://zeebe.example",
            ]);
        });

        it("is empty for a literal config without credentials", () => {
            expect(completeBuilder().build().sensitiveDestinations().isEmpty()).toBe(true);
        });

        it.each([
            [
                "a literal config beside a .env with values",
                completeBuilder(),
                { MIRAGON_HOST: "camunda.example" },
            ],
            [
                "a config whose only ref resolves to an empty value",
                completeBuilder().withTenantId("${env:MIRAGON_TENANT}"),
                { MIRAGON_TENANT: "" },
            ],
        ])(
            "is empty for %s without credentials, as the request carries no .env value",
            (_case, builder, variables) => {
                const expanded = builder.build().expandEnvRefs(envFile(variables));

                expect(expanded.carriesEnvValues()).toBe(false);
                expect(expanded.sensitiveDestinations().isEmpty()).toBe(true);
            },
        );

        it("is the request origin for a config without credentials whose only ref is the tenant", () => {
            const config = completeBuilder().withTenantId("${env:MIRAGON_TENANT}").build();

            const expanded = config.expandEnvRefs(envFile({ MIRAGON_TENANT: "acme" }));

            expect(expanded.carriesEnvValues()).toBe(true);
            expect(expanded.sensitiveDestinations().origins).toEqual(["https://camunda.example"]);
        });

        it("is the request origin for a config without credentials expanded from .env values", () => {
            const config = completeBuilder()
                .withEndpoint("https://${env:MIRAGON_HOST}/engine-rest")
                .build();

            expect(
                config
                    .expandEnvRefs(envFile({ MIRAGON_HOST: "camunda.example" }))
                    .sensitiveDestinations().origins,
            ).toEqual(["https://camunda.example"]);
        });

        it("is the deploy URL origin for a config carrying .env values", () => {
            const config = completeBuilder()
                .withDeployUrl("https://gateway.example/deploy?token=${env:MIRAGON_TOKEN}")
                .build();

            expect(
                config.expandEnvRefs(envFile({ MIRAGON_TOKEN: "t0ken" })).sensitiveDestinations()
                    .origins,
            ).toEqual(["https://gateway.example"]);
        });

        it("is the resolved host once env refs are expanded", () => {
            const config = completeBuilder()
                .withEndpoint("https://${env:MIRAGON_HOST}/engine-rest")
                .withAuth(new BasicAuth("admin", "secret"))
                .build();

            expect(
                config
                    .expandEnvRefs((name) => (name === "MIRAGON_HOST" ? "evil.example" : undefined))
                    .sensitiveDestinations().origins,
            ).toEqual(["https://evil.example"]);
        });
    });

    describe("redactor", () => {
        it("masks the literal credentials", () => {
            const config = completeBuilder().withAuth(new BasicAuth("admin", "s3cret")).build();

            expect(config.redactor().redact("admin:s3cret rejected")).toBe("***:*** rejected");
        });

        it("masks the expanded credentials and the .env values the request used, but no other", () => {
            const config = completeBuilder()
                .withEndpoint("https://${env:MIRAGON_HOST}/engine-rest")
                .withAuth(new BasicAuth("admin", "${env:MIRAGON_PASSWORD}"))
                .build();

            const redactor = config
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

        it("masks nothing for a literal config without credentials", () => {
            const message = "https://camunda.example/engine-rest rejected";

            expect(completeBuilder().build().redactor().redact(message)).toBe(message);
        });
    });
});
