import { describe, expect, it } from "vitest";

import {
    DisallowedEnvReferenceError,
    InvalidDeploymentConfigError,
    DuplicateDeploymentTargetError,
    InvalidDeploymentTargetsFileError,
    UnresolvedEnvVariableError,
} from "../../shared/domain/errors";

import { CredentialRefs } from "./credentialRefs";
import { BasicAuth, NoAuth, OAuth2Auth } from "./deployment";
import {
    DeploymentTarget,
    DeploymentTargets,
    parseDeploymentTargetsFile,
    serializeDeploymentTargets,
} from "./deploymentTarget";
import { emptyEnvLookup } from "./envRef";

const lookup = (map: Record<string, string>) => (name: string) => map[name];

function errorFrom(action: () => unknown): unknown {
    try {
        action();
    } catch (error) {
        return error;
    }
    throw new Error("expected the action to throw");
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

/** Parses a file whose second entry is `entry`, so errors must name `targets[1]`. */
function parseSecondTarget(entry: Record<string, unknown>): DeploymentTarget {
    return parseDeploymentTargetsFile({
        targets: [
            { name: "first", engine: "c7", endpoint: "http://first" },
            { name: "second", engine: "c7", endpoint: "http://second", ...entry },
        ],
    })[1];
}

function parseErrorMessage(entry: Record<string, unknown>): string {
    try {
        parseSecondTarget(entry);
    } catch (error) {
        expect(error).toBeInstanceOf(InvalidDeploymentTargetsFileError);
        return (error as Error).message;
    }
    throw new Error("expected the targets file to be rejected");
}

function templateFieldEntries(reference: string): [string, Record<string, unknown>][] {
    return [
        ["endpoint", { endpoint: `https://${reference}` }],
        ["tenantId", { tenantId: reference }],
        [
            "auth.tokenEndpoint",
            { auth: { type: "oauth2", tokenEndpoint: reference, audience: "aud" } },
        ],
        [
            "auth.audience",
            { auth: { type: "oauth2", tokenEndpoint: "https://idp", audience: reference } },
        ],
        ["endpoints.deploy", { endpoints: { deploy: reference } }],
        ["endpoints.startInstance", { endpoints: { startInstance: reference } }],
    ];
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

    it("parses whole-value env references in the active auth type's credential fields", () => {
        const basic = parseSecondTarget({
            auth: {
                type: "basic",
                username: "${env:MIRAGON_USER}",
                password: "${env:MIRAGON_PASSWORD}",
            },
        });
        const oauth2 = parseSecondTarget({
            auth: {
                type: "oauth2",
                tokenEndpoint: "https://login/token",
                audience: "aud",
                clientId: "${env:MIRAGON_CLIENT_ID}",
                clientSecret: "${env:MIRAGON_CLIENT_SECRET}",
            },
        });

        expect(basic.credentialRefs).toEqual(
            CredentialRefs.basic("${env:MIRAGON_USER}", "${env:MIRAGON_PASSWORD}"),
        );
        expect(oauth2.credentialRefs).toEqual(
            CredentialRefs.oauth2("${env:MIRAGON_CLIENT_ID}", "${env:MIRAGON_CLIENT_SECRET}"),
        );
    });

    it("keeps only the active auth type's credential refs", () => {
        const parsed = parseSecondTarget({
            auth: {
                type: "basic",
                username: "${env:MIRAGON_USER}",
                clientId: "${env:MIRAGON_CLIENT_ID}",
                clientSecret: "${env:MIRAGON_CLIENT_SECRET}",
            },
        });
        const none = parseSecondTarget({
            auth: { type: "none", password: "${env:MIRAGON_PASSWORD}" },
        });

        expect(parsed.credentialRefs).toEqual(
            CredentialRefs.basic("${env:MIRAGON_USER}", undefined),
        );
        expect(none.credentialRefs).toEqual(CredentialRefs.none());
    });

    it.each(["basic", "none"])(
        "drops the token endpoint and audience a %s target's file carries",
        (type) => {
            const parsed = parseSecondTarget({
                auth: {
                    type,
                    tokenEndpoint: "https://${env:MIRAGON_IDP}/token",
                    audience: "aud",
                },
            });

            expect(parsed.tokenEndpoint).toBe("");
            expect(parsed.audience).toBe("");
        },
    );

    it("still rejects a non-string token endpoint on a target that drops it", () => {
        expect(() => parseSecondTarget({ auth: { type: "basic", tokenEndpoint: 42 } })).toThrow(
            'targets[1] "auth.tokenEndpoint" must be a string',
        );
    });

    describe.each([
        ["a literal secret", "plain-secret"],
        ["partial interpolation", "user-${env:MIRAGON_PW}"],
        ["a ref without the prefix", "${env:CAMUNDA_PASSWORD}"],
        ["a whitespace-padded ref", "  ${env:MIRAGON_PASSWORD}  "],
    ])("a credential field holding %s", (_desc, value) => {
        it.each([
            ["basic", "username"],
            ["basic", "password"],
            ["oauth2", "clientId"],
            ["oauth2", "clientSecret"],
            ["none", "password"],
            ["basic", "clientSecret"],
            ["oauth2", "username"],
        ])("is rejected under auth type %s in %s", (type, field) => {
            const parse = () => parseSecondTarget({ auth: { type, [field]: value } });

            expect(parse).toThrow(InvalidDeploymentTargetsFileError);
            expect(parse).toThrow(`targets[1] "auth.${field}"`);
        });
    });

    it("rejects a non-string credential field", () => {
        expect(() => parseSecondTarget({ auth: { type: "basic", password: 42 } })).toThrow(
            'targets[1] "auth.password" must be a string',
        );
    });

    it("accepts prefixed env references in every template field", () => {
        const parsed = parseSecondTarget({
            endpoint: "${env:MIRAGON_URL}",
            tenantId: "${env:MIRAGON_TENANT}",
            auth: {
                type: "oauth2",
                tokenEndpoint: "https://${env:MIRAGON_IDP}/token",
                audience: "${env:MIRAGON_AUD}",
            },
            endpoints: {
                deploy: "${env:MIRAGON_URL}/deploy",
                startInstance: "${env:MIRAGON_URL}/{processDefinitionKey}/start",
            },
        });

        expect(parsed.endpoint).toBe("${env:MIRAGON_URL}");
        expect(parsed.tenantId).toBe("${env:MIRAGON_TENANT}");
        expect(parsed.tokenEndpoint).toBe("https://${env:MIRAGON_IDP}/token");
        expect(parsed.audience).toBe("${env:MIRAGON_AUD}");
        expect(parsed.deployUrl).toBe("${env:MIRAGON_URL}/deploy");
        expect(parsed.startInstanceUrl).toBe("${env:MIRAGON_URL}/{processDefinitionKey}/start");
    });

    describe.each([
        ["a foreign ref", "${env:GITHUB_TOKEN}"],
        ["a ref missing its closing brace", "${env:MIRAGON_URL"],
        ["a ref with an empty name", "${env:}"],
    ])("a template field holding %s", (_desc, reference) => {
        it.each(templateFieldEntries(reference))("is rejected in %s", (field, entry) => {
            const parse = () => parseSecondTarget(entry);

            expect(parse).toThrow(InvalidDeploymentTargetsFileError);
            expect(parse).toThrow(
                `targets[1] "${field}" contains an invalid environment reference`,
            );
        });
    });

    describe.each([
        ["an unclosed ref", "p${env:hunter2rest"],
        ["a ref name with a space", "${env:hunter 2}"],
        ["a well-formed foreign ref", "p${env:hunter2}rest"],
    ])("a value holding %s", (_desc, value) => {
        it.each(templateFieldEntries(value))("is never echoed from %s", (field, entry) => {
            const message = parseErrorMessage(entry);

            expect(message).toContain(
                `targets[1] "${field}" contains an invalid environment reference`,
            );
            expect(message).not.toContain("hunter");
        });

        it.each([
            ["basic", "password"],
            ["oauth2", "clientSecret"],
        ])("is never echoed from the %s auth.%s credential", (type, field) => {
            const message = parseErrorMessage({ auth: { type, [field]: value } });

            expect(message).toContain(`targets[1] "auth.${field}"`);
            expect(message).not.toContain("hunter");
        });
    });
});

describe("DeploymentTarget", () => {
    describe("authWith", () => {
        const basicTarget = (credentialRefs?: CredentialRefs) =>
            target("dev", { authType: "basic", credentialRefs });
        const oauth2Target = (credentialRefs?: CredentialRefs) =>
            target("dev", {
                authType: "oauth2",
                tokenEndpoint: "https://login/token",
                audience: "aud",
                credentialRefs,
            });

        it("lets file refs win over stored credentials", () => {
            const auth = basicTarget(
                CredentialRefs.basic("${env:MIRAGON_USER}", "${env:MIRAGON_PW}"),
            ).authWith({ username: "stale-user", password: "stale-secret" });

            expect(auth).toEqual(new BasicAuth("${env:MIRAGON_USER}", "${env:MIRAGON_PW}"));
        });

        it.each(["${env:MIRAGON_USER}", " ${env:MIRAGON_USER} "])(
            "ignores a ref %j found only in the store, so a ref removed from the file stays removed",
            (storedRef) => {
                const auth = basicTarget().authWith({ username: storedRef, password: "s3cret" });

                expect(auth).toEqual(new BasicAuth("", "s3cret"));
            },
        );

        it("ignores store-only refs for oauth2 and keeps stored literals", () => {
            const auth = oauth2Target().authWith({
                clientId: "client-1",
                clientSecret: "${env:MIRAGON_SECRET}",
            });

            expect(auth).toEqual(new OAuth2Auth("client-1", "", "https://login/token", "aud"));
        });

        it("falls back to stored credentials per field", () => {
            const auth = basicTarget(
                CredentialRefs.basic("${env:MIRAGON_USER}", undefined),
            ).authWith({
                username: "stale-user",
                password: "stored-secret",
            });

            expect(auth).toEqual(new BasicAuth("${env:MIRAGON_USER}", "stored-secret"));
        });

        it("uses stored credentials when the file has no refs, blanking a missing field", () => {
            expect(basicTarget().authWith({ password: "stored-secret" })).toEqual(
                new BasicAuth("", "stored-secret"),
            );
        });

        it("returns NoAuth when neither the file nor the store has credentials", () => {
            expect(basicTarget().authWith(undefined)).toBeInstanceOf(NoAuth);
            expect(oauth2Target().authWith({})).toBeInstanceOf(NoAuth);
        });

        it("keeps the oauth2 token endpoint and audience of the target", () => {
            const auth = oauth2Target(
                CredentialRefs.oauth2("${env:MIRAGON_CLIENT_ID}", undefined),
            ).authWith({ clientId: "stale-id", clientSecret: "stored-secret" });

            expect(auth).toEqual(
                new OAuth2Auth(
                    "${env:MIRAGON_CLIENT_ID}",
                    "stored-secret",
                    "https://login/token",
                    "aud",
                ),
            );
        });

        it("ignores credentials stored for another auth type", () => {
            expect(oauth2Target().authWith({ username: "u", password: "p" })).toBeInstanceOf(
                NoAuth,
            );
            expect(
                target("dev").authWith({ username: "u", password: "p", clientId: "c" }),
            ).toBeInstanceOf(NoAuth);
        });
    });

    describe("connectionEnvRefs", () => {
        it("is false for a fully literal target", () => {
            expect(
                target("dev", {
                    tenantId: "acme",
                    authType: "oauth2",
                    tokenEndpoint: "https://login/token",
                    audience: "aud",
                    deployUrl: "https://gw/deploy",
                    startInstanceUrl: "https://gw/{processDefinitionKey}/start",
                })
                    .connectionEnvRefs()
                    .referencesEnv(),
            ).toBe(false);
        });

        it.each<[string, Partial<DeploymentTarget>]>([
            ["endpoint", { endpoint: "${env:MIRAGON_URL}/engine-rest" }],
            ["tenantId", { tenantId: "${env:MIRAGON_TENANT}" }],
        ])("is true when %s holds a ref", (_field, overrides) => {
            expect(target("dev", overrides).connectionEnvRefs().referencesEnv()).toBe(true);
        });

        it("counts a malformed ref so it reaches validation", () => {
            expect(target("dev", { tenantId: "${env:" }).connectionEnvRefs().referencesEnv()).toBe(
                true,
            );
        });

        it.each<[string, Partial<DeploymentTarget>]>([
            ["endpoints.deploy", { deployUrl: "${env:MIRAGON_URL}/deploy" }],
            ["endpoints.startInstance", { startInstanceUrl: "${env:MIRAGON_URL}/start" }],
            [
                "auth.tokenEndpoint",
                {
                    authType: "oauth2",
                    tokenEndpoint: "https://${env:MIRAGON_IDP}/token",
                    audience: "aud",
                },
            ],
            [
                "auth.audience",
                {
                    authType: "oauth2",
                    tokenEndpoint: "https://login/token",
                    audience: "${env:MIRAGON_AUD}",
                },
            ],
            [
                "the basic credentials",
                {
                    authType: "basic",
                    credentialRefs: CredentialRefs.basic(
                        "${env:MIRAGON_USER}",
                        "${env:MIRAGON_PW}",
                    ),
                },
            ],
            [
                "the oauth2 credentials",
                {
                    authType: "oauth2",
                    tokenEndpoint: "https://login/token",
                    audience: "aud",
                    credentialRefs: CredentialRefs.oauth2(
                        "${env:MIRAGON_CLIENT_ID}",
                        "${env:MIRAGON_CLIENT_SECRET}",
                    ),
                },
            ],
        ])(
            "is false when only %s holds a ref, since the connection never reads it",
            (_field, overrides) => {
                expect(target("dev", overrides).connectionEnvRefs().referencesEnv()).toBe(false);
            },
        );

        it("is false exactly when expandConnection needs no lookup", () => {
            const nonConnectionRefsOnly = target("dev", {
                tenantId: "acme",
                deployUrl: "${env:MIRAGON_URL}/deploy",
                startInstanceUrl: "${env:MIRAGON_URL}/start",
            });
            const unusableLookup = () => {
                throw new Error("lookup must not be consulted");
            };

            expect(nonConnectionRefsOnly.connectionEnvRefs().referencesEnv()).toBe(false);
            expect(nonConnectionRefsOnly.expandConnection(unusableLookup)).toEqual({
                endpoint: "http://localhost:8080/engine-rest",
                tenantId: "acme",
            });
        });
    });

    describe("expandConnection", () => {
        it("expands the endpoint and tenant only", () => {
            const connectionTarget = target("dev", {
                endpoint: "${env:MIRAGON_URL}/engine-rest",
                tenantId: "${env:MIRAGON_TENANT}",
                deployUrl: "${env:MIRAGON_UNSET}/deploy",
                credentialRefs: CredentialRefs.basic("${env:MIRAGON_UNSET}", undefined),
            });

            expect(
                connectionTarget.expandConnection(
                    lookup({ MIRAGON_URL: "https://c.example", MIRAGON_TENANT: "acme" }),
                ),
            ).toEqual({ endpoint: "https://c.example/engine-rest", tenantId: "acme" });
            expect(connectionTarget.endpoint).toBe("${env:MIRAGON_URL}/engine-rest");
        });

        it.each(["", "   "])(
            "rejects an endpoint variable set to %j like an empty field",
            (value) => {
                expect(() =>
                    target("dev", { endpoint: "${env:MIRAGON_URL}" }).expandConnection(
                        lookup({ MIRAGON_URL: value }),
                    ),
                ).toThrow(InvalidDeploymentConfigError);
            },
        );

        it("returns a literal connection unchanged", () => {
            expect(target("dev", { tenantId: "acme" }).expandConnection(lookup({}))).toEqual({
                endpoint: "http://localhost:8080/engine-rest",
                tenantId: "acme",
            });
        });

        it.each<[string, Partial<DeploymentTarget>, string]>([
            ["endpoint", { endpoint: "${env:MIRAGON_URL}" }, "MIRAGON_URL"],
            ["tenantId", { tenantId: "${env:MIRAGON_TENANT}" }, "MIRAGON_TENANT"],
        ])("names the JSON field %s of an unset variable", (field, overrides, variable) => {
            const error = errorFrom(() =>
                target("dev", overrides).expandConnection(emptyEnvLookup("/ws/.env")),
            );

            expect(error).toBeInstanceOf(UnresolvedEnvVariableError);
            expect(error).toMatchObject({ field, variable });
            expect((error as Error).message).toContain("/ws/.env");
        });

        it.each<[string, Partial<DeploymentTarget>]>([
            ["endpoint", { endpoint: "${env:HOME}/engine-rest" }],
            ["tenantId", { tenantId: "${env:TENANT}" }],
        ])(
            "rejects a foreign ref in %s even when the lookup could resolve it",
            (field, overrides) => {
                const error = errorFrom(() =>
                    target("dev", overrides).expandConnection(
                        lookup({ HOME: "/Users/me", TENANT: "acme" }),
                    ),
                );

                expect(error).toBeInstanceOf(DisallowedEnvReferenceError);
                expect(error).toMatchObject({ field });
            },
        );
    });

    describe("knownCredentialDestinations", () => {
        it("lists the endpoint and both overrides of a basic target", () => {
            expect(
                target("dev", {
                    authType: "basic",
                    endpoint: "https://camunda.example/engine-rest",
                    deployUrl: "https://deploy.example/deploy",
                    startInstanceUrl: "https://start.example/{processDefinitionKey}/start",
                    tokenEndpoint: "https://idp.example/token",
                }).knownCredentialDestinations().origins,
            ).toEqual([
                "https://camunda.example",
                "https://deploy.example",
                "https://start.example",
            ]);
        });

        it("adds the token endpoint only for oauth2", () => {
            expect(
                target("dev", {
                    authType: "oauth2",
                    endpoint: "https://zeebe.example",
                    tokenEndpoint: "https://idp.example/token",
                }).knownCredentialDestinations().origins,
            ).toEqual(["https://idp.example", "https://zeebe.example"]);
        });

        it("skips every URL that references the .env, whose value only a request knows", () => {
            expect(
                target("dev", {
                    authType: "oauth2",
                    endpoint: "${env:MIRAGON_URL}",
                    deployUrl: "https://${env:MIRAGON_HOST}/deploy",
                    startInstanceUrl: "https://start.example/${env:MIRAGON_PATH}",
                    tokenEndpoint: "https://idp.example/token",
                }).knownCredentialDestinations().origins,
            ).toEqual(["https://idp.example"]);
        });

        it("skips a host templated with the process definition key and an unparseable URL", () => {
            expect(
                target("dev", {
                    authType: "oauth2",
                    endpoint: "https://camunda.example",
                    startInstanceUrl: "https://{processDefinitionKey}.example/start",
                    tokenEndpoint: "",
                }).knownCredentialDestinations().origins,
            ).toEqual(["https://camunda.example"]);
        });
    });

    describe("assertEnvRefsValid", () => {
        it("passes literals and prefixed refs", () => {
            expect(() =>
                target("dev", {
                    endpoint: "${env:MIRAGON_URL}",
                    tenantId: "acme",
                    deployUrl: "${env:MIRAGON_URL}/deploy",
                }).assertEnvRefsValid(),
            ).not.toThrow();
        });

        it.each<[string, Partial<DeploymentTarget>]>([
            ["endpoint", { endpoint: "${env:GITHUB_TOKEN}" }],
            ["tenantId", { tenantId: "${env:TENANT}" }],
            ["auth.tokenEndpoint", { tokenEndpoint: "${env:MIRAGON_IDP" }],
            ["auth.audience", { audience: "${env:}" }],
            ["endpoints.deploy", { deployUrl: "${env:HOME}/deploy" }],
            ["endpoints.startInstance", { startInstanceUrl: "${env:MIRAGON_}" }],
        ])("names the JSON field %s of a disallowed ref", (field, overrides) => {
            const error = errorFrom(() => target("dev", overrides).assertEnvRefsValid());

            expect(error).toBeInstanceOf(DisallowedEnvReferenceError);
            expect(error).toMatchObject({ field });
        });
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

    it("writes credential env references under auth and round-trips them", () => {
        const targets = [
            target("dev", {
                authType: "basic",
                credentialRefs: CredentialRefs.basic("${env:MIRAGON_USER}", "${env:MIRAGON_PW}"),
            }),
            target("prod", {
                authType: "oauth2",
                tokenEndpoint: "https://login/token",
                audience: "aud",
                credentialRefs: CredentialRefs.oauth2("${env:MIRAGON_CID}", undefined),
            }),
        ];

        const json = JSON.parse(serializeDeploymentTargets(targets));

        expect(json.targets[0].auth).toEqual({
            type: "basic",
            username: "${env:MIRAGON_USER}",
            password: "${env:MIRAGON_PW}",
        });
        expect(json.targets[1].auth).toEqual({
            type: "oauth2",
            tokenEndpoint: "https://login/token",
            audience: "aud",
            clientId: "${env:MIRAGON_CID}",
        });
        expect(parseDeploymentTargetsFile(json)).toEqual(targets);
    });
});

describe("DeploymentTargets", () => {
    it("appends a new target on add", () => {
        const result = new DeploymentTargets([target("dev")]).add(target("prod"));
        expect(result.map((t) => t.name)).toEqual(["dev", "prod"]);
    });

    it("throws on add of a duplicate name", () => {
        expect(() => new DeploymentTargets([target("dev")]).add(target("dev"))).toThrow(
            DuplicateDeploymentTargetError,
        );
    });

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

    it("throws when a rename collides with another target's name", () => {
        expect(() =>
            new DeploymentTargets([target("dev"), target("prod")]).upsert(target("prod"), "dev"),
        ).toThrow(DuplicateDeploymentTargetError);
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
