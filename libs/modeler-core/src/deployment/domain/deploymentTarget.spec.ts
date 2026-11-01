import { Engine } from "@miragon/bpmn-modeler-types";
import { describe, expect, it } from "vitest";

import {
    DeploymentTargetChangedError,
    DisallowedEnvReferenceError,
    InvalidDeploymentConfigError,
    DuplicateDeploymentTargetError,
    InvalidDeploymentTargetError,
    InvalidDeploymentTargetsFileError,
    UnresolvedEnvVariableError,
} from "./errors";

import { CredentialRefs } from "./credentialRefs";
import { AuthConfig, BasicAuth, NoAuth, OAuth2Auth } from "./deployment";
import {
    BasicTargetAuth,
    DeploymentTarget,
    DeploymentTargetFields,
    DeploymentTargets,
    NoTargetAuth,
    OAuth2TargetAuth,
    parseDeploymentTargetsFile,
    serializeDeploymentTargets,
    TargetAuthType,
    TargetChange,
    TargetRequest,
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

/** The positional constructor's arguments after the name. */
interface TargetOverrides {
    readonly engine?: Engine;
    readonly endpoint?: string;
    readonly tenantId?: string;
    readonly authType?: TargetAuthType;
    readonly tokenEndpoint?: string;
    readonly audience?: string;
    readonly deployUrl?: string;
    readonly startInstanceUrl?: string;
    readonly credentialRefs?: CredentialRefs;
}

function target(name: string, overrides: TargetOverrides = {}): DeploymentTarget {
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

        expect(parsed.auth).toEqual(new NoTargetAuth());
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

    it.each<[string, unknown, string]>([
        ["a non-object", 42, "expected a JSON object"],
        ["null", null, "expected a JSON object"],
        ["a missing targets array", { targets: "nope" }, "`targets` must be an array"],
        ["a non-object entry", { targets: [42] }, "targets[0] must be an object"],
        ["a null entry", { targets: [null] }, "targets[0] must be an object"],
        [
            "duplicate names",
            {
                targets: [
                    { name: "dev", engine: "c7", endpoint: "http://h" },
                    { name: " dev ", engine: "c8", endpoint: "http://h2" },
                ],
            },
            'duplicate target name "dev"',
        ],
    ])("rejects %s", (_desc, json, reason) => {
        expect(() => parseDeploymentTargetsFile(json)).toThrow(
            new InvalidDeploymentTargetsFileError(reason),
        );
    });

    it.each<[Record<string, unknown>, string]>([
        [{ name: 42 }, '"name" must be a non-empty string'],
        [{ name: "  " }, '"name" must be a non-empty string'],
        [{ engine: "c9" }, '"engine" must be "c7" or "c8"'],
        [{ engine: 7 }, '"engine" must be "c7" or "c8"'],
        [{ endpoint: undefined }, '"endpoint" must be a non-empty string'],
        [{ endpoint: " " }, '"endpoint" must be a non-empty string'],
        [{ tenantId: 42 }, '"tenantId" must be a string'],
        [{ auth: "basic" }, '"auth" must be an object'],
        [{ auth: null }, '"auth" must be an object'],
        [{ auth: { type: "x" } }, '"auth.type" must be "none", "basic", or "oauth2"'],
        [{ auth: {} }, '"auth.type" must be "none", "basic", or "oauth2"'],
        [{ auth: { type: "oauth2", audience: 42 } }, '"auth.audience" must be a string'],
        [{ endpoints: "x" }, '"endpoints" must be an object'],
        [{ endpoints: null }, '"endpoints" must be an object'],
        [{ endpoints: { deploy: 42 } }, '"endpoints.deploy" must be a string'],
        [{ endpoints: { startInstance: 42 } }, '"endpoints.startInstance" must be a string'],
    ])("names targets[1] in the message for %j", (entry, problem) => {
        expect(parseErrorMessage(entry)).toBe(
            `Invalid deployment targets file: targets[1] ${problem}`,
        );
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

    it.each([
        ["basic", new BasicTargetAuth(CredentialRefs.none())],
        ["none", new NoTargetAuth()],
    ])("drops the token endpoint and audience a %s target's file carries", (type, auth) => {
        const parsed = parseSecondTarget({
            auth: {
                type,
                tokenEndpoint: "https://${env:MIRAGON_IDP}/token",
                audience: "aud",
            },
        });

        expect(parsed.auth).toEqual(auth);
    });

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
        expect(parsed.auth).toMatchObject({
            tokenEndpoint: "https://${env:MIRAGON_IDP}/token",
            audience: "${env:MIRAGON_AUD}",
        });
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
    describe("create", () => {
        const FIELDS: DeploymentTargetFields = {
            name: "dev",
            engine: "c7",
            endpoint: "http://localhost:8080/engine-rest",
            authType: "none",
        };
        const OAUTH2: Partial<DeploymentTargetFields> = {
            authType: "oauth2",
            tokenEndpoint: "https://login/token",
            audience: "aud",
        };

        interface CreateCase {
            readonly behaviour: string;
            readonly fields: Partial<DeploymentTargetFields>;
            readonly created: Partial<Record<keyof DeploymentTarget, unknown>>;
        }

        const createCases: CreateCase[] = [
            {
                behaviour: "trims the name, which identifies the target",
                fields: { name: "  dev  " },
                created: { name: "dev" },
            },
            {
                behaviour: "keeps the endpoint verbatim, since named ledger keys are built from it",
                fields: { endpoint: " http://localhost:8080/engine-rest " },
                created: { endpoint: " http://localhost:8080/engine-rest " },
            },
            {
                behaviour: "keeps the tenant verbatim",
                fields: { tenantId: " acme " },
                created: { tenantId: " acme " },
            },
            {
                behaviour: "defaults a missing tenant to empty",
                fields: {},
                created: { engine: "c7", tenantId: "", auth: new NoTargetAuth() },
            },
            {
                behaviour: "trims the URL overrides",
                fields: {
                    deployUrl: "  https://gw/deploy  ",
                    startInstanceUrl: " https://gw/{processDefinitionKey}/start ",
                },
                created: {
                    deployUrl: "https://gw/deploy",
                    startInstanceUrl: "https://gw/{processDefinitionKey}/start",
                },
            },
            {
                behaviour: "drops blank URL overrides",
                fields: { deployUrl: "   ", startInstanceUrl: "" },
                created: { deployUrl: undefined, startInstanceUrl: undefined },
            },
            {
                behaviour: "keeps the token endpoint, audience and client refs of an OAuth2 target",
                fields: {
                    ...OAUTH2,
                    credentialRefs: CredentialRefs.oauth2(
                        "${env:MIRAGON_CLIENT_ID}",
                        "${env:MIRAGON_CLIENT_SECRET}",
                    ),
                },
                created: {
                    auth: new OAuth2TargetAuth(
                        "https://login/token",
                        "aud",
                        CredentialRefs.oauth2(
                            "${env:MIRAGON_CLIENT_ID}",
                            "${env:MIRAGON_CLIENT_SECRET}",
                        ),
                    ),
                },
            },
            {
                behaviour: "defaults a missing OAuth2 token endpoint and audience to empty",
                fields: { authType: "oauth2" },
                created: { auth: new OAuth2TargetAuth("", "", CredentialRefs.none()) },
            },
            {
                behaviour: "keeps the user refs of a basic target",
                fields: {
                    authType: "basic",
                    credentialRefs: CredentialRefs.basic("${env:MIRAGON_USER}", undefined),
                },
                created: {
                    auth: new BasicTargetAuth(
                        CredentialRefs.basic("${env:MIRAGON_USER}", undefined),
                    ),
                },
            },
            ...(
                [
                    ["basic", new BasicTargetAuth(CredentialRefs.none())],
                    ["none", new NoTargetAuth()],
                ] as const
            ).map(([authType, auth]): CreateCase => ({
                behaviour: `drops the token endpoint and audience of a ${authType} target`,
                fields: { ...OAUTH2, authType },
                created: { auth },
            })),
            {
                behaviour: "drops the refs of another auth type",
                fields: {
                    ...OAUTH2,
                    credentialRefs: CredentialRefs.basic("${env:MIRAGON_USER}", undefined),
                },
                created: { credentialRefs: CredentialRefs.none() },
            },
            {
                behaviour: "drops the client refs of a basic target",
                fields: {
                    authType: "basic",
                    credentialRefs: CredentialRefs.oauth2("${env:MIRAGON_CLIENT_ID}", undefined),
                },
                created: { credentialRefs: CredentialRefs.none() },
            },
            {
                behaviour: "drops every credential ref of a target without auth",
                fields: {
                    credentialRefs: CredentialRefs.basic(
                        "${env:MIRAGON_USER}",
                        "${env:MIRAGON_PW}",
                    ),
                },
                created: { credentialRefs: CredentialRefs.none() },
            },
            {
                behaviour: "ignores an invalid ref in a field its auth type drops",
                fields: {
                    authType: "basic",
                    tokenEndpoint: "https://${env:AWS_REGION}/token",
                    audience: "${env:}",
                },
                created: { auth: new BasicTargetAuth(CredentialRefs.none()) },
            },
            {
                behaviour: "accepts prefixed env references in every template field",
                fields: {
                    endpoint: "${env:MIRAGON_URL}",
                    tenantId: "${env:MIRAGON_TENANT}",
                    authType: "oauth2",
                    tokenEndpoint: "https://${env:MIRAGON_IDP}/token",
                    audience: "${env:MIRAGON_AUD}",
                    deployUrl: "${env:MIRAGON_URL}/deploy",
                    startInstanceUrl: "${env:MIRAGON_URL}/{processDefinitionKey}/start",
                },
                created: {
                    endpoint: "${env:MIRAGON_URL}",
                    tenantId: "${env:MIRAGON_TENANT}",
                    auth: {
                        tokenEndpoint: "https://${env:MIRAGON_IDP}/token",
                        audience: "${env:MIRAGON_AUD}",
                    },
                    deployUrl: "${env:MIRAGON_URL}/deploy",
                    startInstanceUrl: "${env:MIRAGON_URL}/{processDefinitionKey}/start",
                },
            },
        ];

        it.each(createCases)("$behaviour", ({ fields, created }) => {
            expect(DeploymentTarget.create({ ...FIELDS, ...fields })).toMatchObject(created);
        });

        it.each(createCases)(
            "reads back from the file what it writes: $behaviour",
            ({ fields }) => {
                const created = DeploymentTarget.create({ ...FIELDS, ...fields });

                expect(parseDeploymentTargetsFile({ targets: [created.toJson()] })[0]).toEqual(
                    created,
                );
            },
        );

        it.each<[string, Partial<DeploymentTargetFields>, string, string]>([
            ["an empty name", { name: "" }, "name", "must be a non-empty string"],
            ["a blank name", { name: "   " }, "name", "must be a non-empty string"],
            ["a blank endpoint", { endpoint: " " }, "endpoint", "must be a non-empty string"],
            ["an unknown engine", { engine: "c9" }, "engine", 'must be "c7" or "c8"'],
            ["a missing engine", { engine: undefined }, "engine", 'must be "c7" or "c8"'],
            [
                "an unknown auth type",
                { authType: "x" },
                "auth.type",
                'must be "none", "basic", or "oauth2"',
            ],
        ])("rejects %s", (_desc, fields, field, reason) => {
            const error = errorFrom(() => DeploymentTarget.create({ ...FIELDS, ...fields }));

            expect(error).toBeInstanceOf(InvalidDeploymentTargetError);
            expect(error).toMatchObject({ field, message: `"${field}" ${reason}` });
        });

        it.each<[string, Partial<DeploymentTargetFields>]>([
            ["endpoint", { endpoint: "${env:GITHUB_TOKEN}" }],
            ["tenantId", { tenantId: "${env:TENANT}" }],
            ["auth.tokenEndpoint", { ...OAUTH2, tokenEndpoint: "${env:MIRAGON_IDP" }],
            ["auth.audience", { ...OAUTH2, audience: "${env:}" }],
            ["endpoints.deploy", { deployUrl: "${env:HOME}/deploy" }],
            ["endpoints.startInstance", { startInstanceUrl: "${env:MIRAGON_}" }],
        ])("names the JSON field %s of a disallowed ref", (field, fields) => {
            const error = errorFrom(() => DeploymentTarget.create({ ...FIELDS, ...fields }));

            expect(error).toBeInstanceOf(DisallowedEnvReferenceError);
            expect(error).toMatchObject({ field });
        });
    });

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

        it("keeps a username ref without a password, blanking the password", () => {
            expect(
                basicTarget(CredentialRefs.basic("${env:MIRAGON_USER}", undefined)).authWith(
                    undefined,
                ),
            ).toEqual(new BasicAuth("${env:MIRAGON_USER}", ""));
        });

        it("keeps a stored client secret without a client id, blanking the id", () => {
            expect(oauth2Target().authWith({ clientSecret: "stored-secret" })).toEqual(
                new OAuth2Auth("", "stored-secret", "https://login/token", "aud"),
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

    describe("assertAdmits", () => {
        const ENDPOINT = "http://localhost:8080/engine-rest";
        const USERNAME_REF = "${env:MIRAGON_USER}";
        const PASSWORD_REF = "${env:MIRAGON_PW}";
        const CLIENT_ID_REF = "${env:MIRAGON_CLIENT_ID}";
        const CLIENT_SECRET_REF = "${env:MIRAGON_CLIENT_SECRET}";
        const CONNECTION_CHANGED =
            "The deployment target changed. Save or reload the target before continuing.";
        const CREDENTIAL_REFS_CHANGED =
            "Credential environment references differ from the saved target. Save or reload the target before continuing.";

        type RequestKind = TargetRequest["kind"];

        interface RequestFields {
            readonly endpoint?: string;
            readonly engine?: TargetRequest["engine"];
            readonly auth?: AuthConfig;
            readonly tenantId?: string;
            readonly deployUrl?: string;
            readonly startInstanceUrl?: string;
        }

        interface AdmissionCase {
            readonly behaviour: string;
            readonly saved: DeploymentTarget;
            readonly request: TargetRequest;
            readonly refusal?: string;
        }

        function requestOf(kind: RequestKind, fields: RequestFields = {}): TargetRequest {
            const connection = {
                endpoint: fields.endpoint ?? ENDPOINT,
                engine: fields.engine ?? "c7",
                auth: fields.auth ?? new NoAuth(),
            };
            return kind === "deploy"
                ? {
                      kind,
                      ...connection,
                      tenantId: fields.tenantId ?? "",
                      deployUrl: fields.deployUrl,
                  }
                : { kind, ...connection, startInstanceUrl: fields.startInstanceUrl };
        }

        function refusalOf(saved: DeploymentTarget, request: TargetRequest): string | undefined {
            try {
                saved.assertAdmits(request);
            } catch (error) {
                expect(error).toBeInstanceOf(DeploymentTargetChangedError);
                return (error as Error).message;
            }
            return undefined;
        }

        const OAUTH2_TARGET: TargetOverrides = {
            authType: "oauth2",
            tokenEndpoint: "https://idp/token",
            audience: "zeebe-api",
        };
        const basicTarget = (credentialRefs: CredentialRefs) =>
            target("dev", { authType: "basic", credentialRefs });
        const oauth2Target = (credentialRefs = CredentialRefs.none()) =>
            target("dev", { ...OAUTH2_TARGET, credentialRefs });
        const oauth2 = (
            clientId: string,
            clientSecret: string,
            tokenEndpoint = "https://idp/token",
            audience = "zeebe-api",
        ) => new OAuth2Auth(clientId, clientSecret, tokenEndpoint, audience);

        const authVariants = [
            {
                target: target("dev"),
                targetLabel: "a target without auth",
                auth: new NoAuth(),
                authLabel: "no auth",
            },
            {
                target: basicTarget(CredentialRefs.none()),
                targetLabel: "a basic target",
                auth: new BasicAuth("admin", "s3cret"),
                authLabel: "basic auth",
            },
            {
                target: oauth2Target(),
                targetLabel: "an OAuth2 target",
                auth: oauth2("cid", "csecret"),
                authLabel: "OAuth2 auth",
            },
        ];

        const connectionCases = (kind: RequestKind): AdmissionCase[] => [
            {
                behaviour: "admits a request that matches the saved target",
                saved: target("dev"),
                request: requestOf(kind),
            },
            {
                behaviour:
                    "admits formatting whitespace around the endpoint of a hand-edited target",
                saved: target("dev", { endpoint: ` ${ENDPOINT} ` }),
                request: requestOf(kind),
            },
            {
                behaviour: "admits formatting whitespace around the requested endpoint",
                saved: target("dev"),
                request: requestOf(kind, { endpoint: `${ENDPOINT}  ` }),
            },
            {
                behaviour: "refuses a changed endpoint",
                saved: target("dev", { endpoint: "https://different" }),
                request: requestOf(kind),
                refusal: CONNECTION_CHANGED,
            },
            {
                behaviour: "refuses a changed engine",
                saved: target("dev"),
                request: requestOf(kind, { engine: "c8" }),
                refusal: CONNECTION_CHANGED,
            },
            ...authVariants.flatMap((saved) =>
                authVariants
                    .filter((requested) => requested !== saved)
                    .map((requested): AdmissionCase => ({
                        behaviour: `refuses ${requested.authLabel} against ${saved.targetLabel}`,
                        saved: saved.target,
                        request: requestOf(kind, { auth: requested.auth }),
                        refusal: CONNECTION_CHANGED,
                    })),
            ),
            {
                behaviour: "refuses basic auth against an OAuth2 target without token settings",
                saved: target("dev", { authType: "oauth2" }),
                request: requestOf(kind, { auth: new BasicAuth("admin", "s3cret") }),
                refusal: CONNECTION_CHANGED,
            },
            {
                behaviour: "refuses a changed OAuth2 token endpoint",
                saved: oauth2Target(),
                request: requestOf(kind, { auth: oauth2("cid", "csecret", "https://other/token") }),
                refusal: CONNECTION_CHANGED,
            },
            {
                behaviour: "refuses a changed OAuth2 audience",
                saved: oauth2Target(),
                request: requestOf(kind, {
                    auth: oauth2("cid", "csecret", "https://idp/token", "another"),
                }),
                refusal: CONNECTION_CHANGED,
            },
            {
                behaviour:
                    "admits formatting whitespace around the OAuth2 token endpoint and audience",
                saved: target("dev", {
                    ...OAUTH2_TARGET,
                    tokenEndpoint: " https://idp/token",
                    audience: "zeebe-api ",
                }),
                request: requestOf(kind, {
                    auth: oauth2("cid", "csecret", "https://idp/token ", " zeebe-api"),
                }),
            },
        ];

        const credentialRefCases = (kind: RequestKind): AdmissionCase[] => [
            ...(
                [
                    ["a basic username", basicTarget, new BasicAuth(USERNAME_REF, "s3cret")],
                    ["a basic password", basicTarget, new BasicAuth("admin", PASSWORD_REF)],
                    ["an OAuth2 client id", oauth2Target, oauth2(CLIENT_ID_REF, "csecret")],
                    ["an OAuth2 client secret", oauth2Target, oauth2("cid", CLIENT_SECRET_REF)],
                ] as const
            ).map(([field, savedWith, auth]): AdmissionCase => ({
                behaviour: `refuses ${field} typed as a ref the targets file does not store`,
                saved: savedWith(CredentialRefs.none()),
                request: requestOf(kind, { auth }),
                refusal: CREDENTIAL_REFS_CHANGED,
            })),
            {
                behaviour: "admits the stored ref beside any store-backed literal",
                saved: basicTarget(CredentialRefs.basic(undefined, PASSWORD_REF)),
                request: requestOf(kind, { auth: new BasicAuth("ops", PASSWORD_REF) }),
            },
            {
                behaviour: "admits the stored ref padded with whitespace",
                saved: basicTarget(CredentialRefs.basic(undefined, PASSWORD_REF)),
                request: requestOf(kind, { auth: new BasicAuth("admin", `  ${PASSWORD_REF} `) }),
            },
            ...(
                [
                    ["a literal", "s3cret"],
                    ["a different ref", "${env:MIRAGON_OTHER_PW}"],
                    ["an empty value", ""],
                ] as const
            ).map(([replacement, password]): AdmissionCase => ({
                behaviour: `refuses a stored ref the request replaced with ${replacement}`,
                saved: basicTarget(CredentialRefs.basic(undefined, PASSWORD_REF)),
                request: requestOf(kind, { auth: new BasicAuth("admin", password) }),
                refusal: CREDENTIAL_REFS_CHANGED,
            })),
            {
                behaviour: "admits OAuth2 client refs that match the targets file",
                saved: oauth2Target(CredentialRefs.oauth2(CLIENT_ID_REF, CLIENT_SECRET_REF)),
                request: requestOf(kind, { auth: oauth2(CLIENT_ID_REF, CLIENT_SECRET_REF) }),
            },
            {
                behaviour: "refuses an OAuth2 client ref the request replaced with a literal",
                saved: oauth2Target(CredentialRefs.oauth2(CLIENT_ID_REF, CLIENT_SECRET_REF)),
                request: requestOf(kind, { auth: oauth2("cid", CLIENT_SECRET_REF) }),
                refusal: CREDENTIAL_REFS_CHANGED,
            },
            {
                behaviour: "admits literal credentials against a target without refs",
                saved: basicTarget(CredentialRefs.none()),
                request: requestOf(kind, { auth: new BasicAuth("admin", "s3cret") }),
            },
            {
                behaviour: "reports a changed connection before comparing credential refs",
                saved: target("dev", {
                    endpoint: "https://elsewhere/engine-rest",
                    authType: "basic",
                }),
                request: requestOf(kind, { auth: new BasicAuth("admin", PASSWORD_REF) }),
                refusal: CONNECTION_CHANGED,
            },
        ];

        const deployCases: AdmissionCase[] = [
            {
                behaviour: "refuses a changed tenant",
                saved: target("dev"),
                request: requestOf("deploy", { tenantId: "another" }),
                refusal: CONNECTION_CHANGED,
            },
            {
                behaviour: "admits formatting whitespace around the tenant of a hand-edited target",
                saved: target("dev", { tenantId: " " }),
                request: requestOf("deploy"),
            },
            {
                behaviour: "admits formatting whitespace around the requested tenant",
                saved: target("dev", { tenantId: "acme" }),
                request: requestOf("deploy", { tenantId: " acme " }),
            },
            {
                behaviour: "refuses a changed deploy URL",
                saved: target("dev", { deployUrl: "https://gw/deploy" }),
                request: requestOf("deploy", { deployUrl: "https://other/deploy" }),
                refusal: CONNECTION_CHANGED,
            },
            {
                behaviour: "refuses a deploy URL the saved target does not override",
                saved: target("dev"),
                request: requestOf("deploy", { deployUrl: "https://other/deploy" }),
                refusal: CONNECTION_CHANGED,
            },
            {
                behaviour: "refuses a request without the saved deploy URL",
                saved: target("dev", { deployUrl: "https://gw/deploy" }),
                request: requestOf("deploy"),
                refusal: CONNECTION_CHANGED,
            },
            {
                behaviour: "admits formatting whitespace around the deploy URL",
                saved: target("dev", { deployUrl: " https://gw/deploy" }),
                request: requestOf("deploy", { deployUrl: "https://gw/deploy  " }),
            },
            {
                behaviour: "ignores the start-instance URL, which a deploy does not use",
                saved: target("dev", { startInstanceUrl: "https://host/start" }),
                request: requestOf("deploy"),
            },
        ];

        const startInstanceCases: AdmissionCase[] = [
            {
                behaviour: "refuses a changed start-instance URL",
                saved: target("dev", { startInstanceUrl: "https://host/start" }),
                request: requestOf("startInstance", { startInstanceUrl: "https://other/start" }),
                refusal: CONNECTION_CHANGED,
            },
            {
                behaviour: "refuses a start-instance URL the saved target does not override",
                saved: target("dev"),
                request: requestOf("startInstance", { startInstanceUrl: "https://host/start" }),
                refusal: CONNECTION_CHANGED,
            },
            {
                behaviour: "refuses a request without the saved start-instance URL",
                saved: target("dev", { startInstanceUrl: "https://host/start" }),
                request: requestOf("startInstance"),
                refusal: CONNECTION_CHANGED,
            },
            {
                behaviour: "admits formatting whitespace around the start-instance URL",
                saved: target("dev", { startInstanceUrl: "https://host/start " }),
                request: requestOf("startInstance", { startInstanceUrl: " https://host/start" }),
            },
            {
                behaviour: "ignores the tenant and deploy URL, which a start does not use",
                saved: target("dev", { tenantId: "acme", deployUrl: "https://gw/deploy" }),
                request: requestOf("startInstance"),
            },
        ];

        const admissionCases = [
            ...(["deploy", "startInstance"] as const).flatMap((kind) => [
                ...connectionCases(kind),
                ...credentialRefCases(kind),
            ]),
            ...deployCases,
            ...startInstanceCases,
        ].map((admission) => ({ ...admission, kind: admission.request.kind }));

        it.each(admissionCases)("$kind: $behaviour", ({ saved, request, refusal }) => {
            expect(refusalOf(saved, request)).toBe(refusal);
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

        it.each<[string, TargetOverrides]>([
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

        it.each<[string, TargetOverrides]>([
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
                ).toThrow(new InvalidDeploymentConfigError(["endpoint"]));
            },
        );

        it("returns a literal connection unchanged", () => {
            expect(target("dev", { tenantId: "acme" }).expandConnection(lookup({}))).toEqual({
                endpoint: "http://localhost:8080/engine-rest",
                tenantId: "acme",
            });
        });

        it.each<[string, TargetOverrides, string]>([
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

        it.each<[string, TargetOverrides]>([
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

    it("writes the auth type of a target without auth", () => {
        expect(JSON.parse(serializeDeploymentTargets([target("dev")])).targets[0].auth).toEqual({
            type: "none",
        });
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
    describe("the change an edit makes", () => {
        const dev = target("dev", { tenantId: "saved" });
        const editedDev = target("dev", { tenantId: "edited" });
        const prod = target("prod");
        const staging = target("staging");
        const saved = new DeploymentTargets([dev, prod]);

        interface TargetChangeCase {
            readonly behaviour: string;
            readonly edit: () => TargetChange;
            readonly change: {
                readonly kind: TargetChange["kind"];
                readonly before: DeploymentTarget | undefined;
                readonly targets: readonly DeploymentTarget[];
                readonly retiredTarget: DeploymentTarget | undefined;
                readonly retiredSlotName: string | undefined;
                readonly approvalsInheritedFrom: string | undefined;
                readonly newSlotName: string | undefined;
            };
        }

        const created = {
            kind: "created",
            before: undefined,
            targets: [dev, prod, staging],
            retiredTarget: undefined,
            retiredSlotName: undefined,
            approvalsInheritedFrom: undefined,
            newSlotName: "staging",
        } as const;
        const savedOverDev = {
            kind: "saved",
            before: dev,
            targets: [prod, editedDev],
            retiredTarget: undefined,
            retiredSlotName: undefined,
            approvalsInheritedFrom: "dev",
            newSlotName: undefined,
        } as const;
        const renamedFromDev = {
            kind: "renamed",
            before: dev,
            targets: [prod, staging],
            retiredTarget: dev,
            retiredSlotName: "dev",
            approvalsInheritedFrom: "dev",
            newSlotName: "staging",
        } as const;
        const removedDev = {
            kind: "removed",
            before: dev,
            targets: [prod],
            retiredTarget: dev,
            retiredSlotName: "dev",
            approvalsInheritedFrom: undefined,
            newSlotName: undefined,
        } as const;

        it.each<TargetChangeCase>([
            {
                behaviour: "an add creates the target with no approvals to inherit",
                edit: () => saved.add(staging),
                change: created,
            },
            {
                behaviour: "an upsert of a name the file does not hold creates the target",
                edit: () => saved.upsert(staging),
                change: created,
            },
            {
                behaviour: "an upsert of a saved name saves over it and keeps its approvals",
                edit: () => saved.upsert(editedDev),
                change: savedOverDev,
            },
            {
                behaviour: "an upsert under its own padded previous name is no rename",
                edit: () => saved.upsert(editedDev, " dev "),
                change: savedOverDev,
            },
            {
                behaviour:
                    "a rename retires the old target and slot and carries its approvals over",
                edit: () => saved.upsert(staging, "dev"),
                change: renamedFromDev,
            },
            {
                behaviour: "a rename matches the padded previous name",
                edit: () => saved.upsert(staging, "  dev "),
                change: renamedFromDev,
            },
            {
                behaviour:
                    "a rename from a name the file no longer holds still retires that name's slot",
                edit: () => saved.upsert(staging, "gone"),
                change: {
                    kind: "renamed",
                    before: undefined,
                    targets: [dev, prod, staging],
                    retiredTarget: undefined,
                    retiredSlotName: "gone",
                    approvalsInheritedFrom: undefined,
                    newSlotName: "staging",
                },
            },
            {
                behaviour: "a remove retires the target and its slot",
                edit: () => saved.remove("dev"),
                change: removedDev,
            },
            {
                behaviour: "a remove matches the padded name",
                edit: () => saved.remove(" dev "),
                change: removedDev,
            },
            {
                behaviour: "a remove of a name the file no longer holds still retires its slot",
                edit: () => saved.remove("gone"),
                change: {
                    kind: "removed",
                    before: undefined,
                    targets: [dev, prod],
                    retiredTarget: undefined,
                    retiredSlotName: "gone",
                    approvalsInheritedFrom: undefined,
                    newSlotName: undefined,
                },
            },
        ])("$behaviour", ({ edit, change }) => {
            const {
                kind,
                before,
                targets,
                retiredTarget,
                retiredSlotName,
                approvalsInheritedFrom,
                newSlotName,
            } = edit();

            expect({
                kind,
                before,
                targets,
                retiredTarget,
                retiredSlotName,
                approvalsInheritedFrom,
                newSlotName,
            }).toStrictEqual(change);
        });
    });

    it("throws on add of a duplicate name", () => {
        expect(() => new DeploymentTargets([target("dev")]).add(target("dev"))).toThrow(
            DuplicateDeploymentTargetError,
        );
    });

    it("throws when a rename collides with another target's name", () => {
        expect(() =>
            new DeploymentTargets([target("dev"), target("prod")]).upsert(target("prod"), "dev"),
        ).toThrow(DuplicateDeploymentTargetError);
    });

    it("finds by trimmed name", () => {
        const targets = new DeploymentTargets([target("dev")]);
        expect(targets.find("  dev  ")?.name).toBe("dev");
        expect(targets.find("missing")).toBeUndefined();
    });
});
