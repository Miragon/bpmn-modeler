import { describe, expect, it } from "vitest";

import {
    DisallowedEnvReferenceError,
    InvalidCredentialDestinationError,
    InvalidDeploymentConfigError,
    UnresolvedEnvVariableError,
} from "../../shared/domain/errors";

import { BasicAuth, NoAuth, OAuth2Auth } from "./deployment";
import { referenceableVariables } from "./envRef";
import { StartInstanceConfig } from "./startInstance";

const lookup = (map: Record<string, string>) => (name: string) => map[name];

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

function startConfig(overrides: Partial<StartInstanceConfig> = {}): StartInstanceConfig {
    return new StartInstanceConfig(
        overrides.processDefinitionKey ?? "invoice",
        overrides.endpoint ?? "https://camunda.example/engine-rest",
        overrides.engine ?? "c7",
        overrides.auth ?? new NoAuth(),
        overrides.payload ?? null,
        overrides.startInstanceUrl,
    );
}

describe("StartInstanceConfig", () => {
    describe("referencesEnv", () => {
        it("is false for a fully literal config", () => {
            expect(
                startConfig({
                    auth: new BasicAuth("admin", "secret"),
                    startInstanceUrl: "https://gw/{processDefinitionKey}/start",
                }).referencesEnv(),
            ).toBe(false);
        });

        it.each([
            ["endpoint", startConfig({ endpoint: "${env:MIRAGON_URL}" })],
            ["startInstanceUrl", startConfig({ startInstanceUrl: "${env:MIRAGON_URL}/start" })],
            ["auth", startConfig({ auth: new BasicAuth("admin", "${env:MIRAGON_PW}") })],
        ])("is true when the %s holds a ref", (_field, config) => {
            expect(config.referencesEnv()).toBe(true);
        });

        it("ignores refs in the process definition key and payload", () => {
            expect(
                startConfig({
                    processDefinitionKey: "${env:MIRAGON_KEY}",
                    payload: { note: "${env:MIRAGON_NOTE}" },
                }).referencesEnv(),
            ).toBe(false);
        });
    });

    describe("sensitiveDestinations", () => {
        const basic = new BasicAuth("admin", "secret");

        it("is the endpoint origin, which the conventional route keeps", () => {
            expect(
                startConfig({
                    endpoint: "https://camunda.example:8443/engine-rest",
                    auth: basic,
                }).sensitiveDestinations().origins,
            ).toEqual(["https://camunda.example:8443"]);
        });

        it("prefers the start URL override over the endpoint", () => {
            expect(
                startConfig({
                    auth: basic,
                    startInstanceUrl: "https://gateway.example/{processDefinitionKey}/start",
                }).sensitiveDestinations().origins,
            ).toEqual(["https://gateway.example"]);
        });

        it("expands the process definition key in the override's host first", () => {
            expect(
                startConfig({
                    processDefinitionKey: "Invoice",
                    auth: basic,
                    startInstanceUrl: "https://{processDefinitionKey}.tenant.example/start",
                }).sensitiveDestinations().origins,
            ).toEqual(["https://invoice.tenant.example"]);
        });

        it("throws when the expanded key leaves the override without a valid host", () => {
            const config = startConfig({
                processDefinitionKey: "a/b",
                auth: basic,
                startInstanceUrl: "https://{processDefinitionKey}.tenant.example/start",
            });

            expect(() => config.sensitiveDestinations()).toThrow(InvalidCredentialDestinationError);
        });

        it("adds the token endpoint for oauth2", () => {
            expect(
                startConfig({
                    endpoint: "https://zeebe.example",
                    auth: new OAuth2Auth("cid", "s", "https://idp.example/token", "aud"),
                }).sensitiveDestinations().origins,
            ).toEqual(["https://idp.example", "https://zeebe.example"]);
        });

        it("is empty for a literal config without credentials", () => {
            expect(startConfig().sensitiveDestinations().isEmpty()).toBe(true);
        });

        it.each([
            [
                "a literal config beside a .env with values",
                startConfig(),
                { MIRAGON_HOST: "camunda.example" },
            ],
            [
                "a config whose only ref resolves to an empty value",
                startConfig({ startInstanceUrl: "${env:MIRAGON_START_URL}" }),
                { MIRAGON_START_URL: "" },
            ],
        ])(
            "is empty for %s without credentials, as the request carries no .env value",
            (_case, config, variables) => {
                const expanded = config.expandEnvRefs(envFile(variables));

                expect(expanded.carriesEnvValues()).toBe(false);
                expect(expanded.sensitiveDestinations().isEmpty()).toBe(true);
            },
        );

        it("is the request origin for a config without credentials expanded from .env values", () => {
            const config = startConfig({ endpoint: "https://${env:MIRAGON_HOST}/engine-rest" });

            expect(
                config
                    .expandEnvRefs(envFile({ MIRAGON_HOST: "camunda.example" }))
                    .sensitiveDestinations().origins,
            ).toEqual(["https://camunda.example"]);
        });

        it("is the expanded start URL origin for a config carrying .env values", () => {
            const config = startConfig({
                processDefinitionKey: "Invoice",
                startInstanceUrl:
                    "https://{processDefinitionKey}.tenant.example/start?token=${env:MIRAGON_TOKEN}",
            });

            expect(
                config.expandEnvRefs(envFile({ MIRAGON_TOKEN: "t0ken" })).sensitiveDestinations()
                    .origins,
            ).toEqual(["https://invoice.tenant.example"]);
        });
    });

    describe("redactor", () => {
        it("masks the literal credentials", () => {
            const config = startConfig({ auth: new BasicAuth("admin", "s3cret") });

            expect(config.redactor().redact("admin:s3cret rejected")).toBe("***:*** rejected");
        });

        it("masks the expanded credentials and the .env values the request used, but no other", () => {
            const config = startConfig({
                endpoint: "https://${env:MIRAGON_HOST}/engine-rest",
                auth: new BasicAuth("admin", "${env:MIRAGON_PASSWORD}"),
            });

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

            expect(startConfig().redactor().redact(message)).toBe(message);
        });
    });

    describe("expandEnvRefs", () => {
        it("expands endpoint, auth and startInstanceUrl but not the key or payload", () => {
            const payload = { note: "${env:MIRAGON_NOTE}" };
            const config = startConfig({
                processDefinitionKey: "${env:MIRAGON_KEY}",
                endpoint: "${env:MIRAGON_URL}",
                engine: "c8",
                auth: new BasicAuth("${env:MIRAGON_USER}", "${env:MIRAGON_PASS}"),
                payload,
                startInstanceUrl: "${env:MIRAGON_URL}/{processDefinitionKey}/start",
            });

            const resolved = config.expandEnvRefs(
                lookup({
                    MIRAGON_URL: "https://c.example",
                    MIRAGON_USER: "u",
                    MIRAGON_PASS: "p",
                    MIRAGON_KEY: "resolved-key",
                    MIRAGON_NOTE: "resolved-note",
                }),
            );

            expect(resolved).toEqual(
                new StartInstanceConfig(
                    "${env:MIRAGON_KEY}",
                    "https://c.example",
                    "c8",
                    new BasicAuth("u", "p"),
                    { note: "${env:MIRAGON_NOTE}" },
                    "https://c.example/{processDefinitionKey}/start",
                    expect.any(Array),
                ),
            );
            expect(resolved.payload).toBe(payload);
            expect([...resolved.envValues].sort()).toEqual(["https://c.example", "p", "u"]);
        });

        it("leaves the original config literal", () => {
            const config = startConfig({
                endpoint: "${env:MIRAGON_URL}",
                auth: new BasicAuth("admin", "${env:MIRAGON_PASS}"),
                startInstanceUrl: "${env:MIRAGON_URL}/start",
            });

            config.expandEnvRefs(lookup({ MIRAGON_URL: "https://c.example", MIRAGON_PASS: "p" }));

            expect(config.endpoint).toBe("${env:MIRAGON_URL}");
            expect(config.auth).toEqual(new BasicAuth("admin", "${env:MIRAGON_PASS}"));
            expect(config.startInstanceUrl).toBe("${env:MIRAGON_URL}/start");
        });

        it("keeps an absent startInstanceUrl undefined", () => {
            expect(startConfig().expandEnvRefs(lookup({})).startInstanceUrl).toBeUndefined();
        });

        it.each([
            [
                "endpoints.startInstance",
                startConfig({ startInstanceUrl: "${env:MIRAGON_START_URL}" }),
                "MIRAGON_START_URL",
            ],
            ["endpoint", startConfig({ endpoint: "${env:MIRAGON_URL}" }), "MIRAGON_URL"],
            [
                "auth.password",
                startConfig({ auth: new BasicAuth("admin", "${env:MIRAGON_PW}") }),
                "MIRAGON_PW",
            ],
        ])("names the JSON field %s of an unset variable", (field, config, variable) => {
            const error = errorFrom(() => config.expandEnvRefs(lookup({})));

            expect(error).toBeInstanceOf(UnresolvedEnvVariableError);
            expect(error).toMatchObject({ field, variable });
        });

        it.each([
            ["endpoint", startConfig({ endpoint: "${env:HOME}/engine-rest" })],
            ["endpoints.startInstance", startConfig({ startInstanceUrl: "${env:HOME}/start" })],
        ])("rejects a foreign ref in %s even when the lookup could resolve it", (field, config) => {
            const error = errorFrom(() => config.expandEnvRefs(lookup({ HOME: "/Users/me" })));

            expect(error).toBeInstanceOf(DisallowedEnvReferenceError);
            expect(error).toMatchObject({ field });
        });

        it.each([
            ["empty", ""],
            ["blank", "   "],
        ])(
            "falls back to the convention route when the start URL variable is %s",
            (_desc, value) => {
                const config = startConfig({ startInstanceUrl: "${env:MIRAGON_START_URL}" });

                expect(
                    config.expandEnvRefs(lookup({ MIRAGON_START_URL: value })).startInstanceUrl,
                ).toBeUndefined();
            },
        );

        it("trims the expanded start URL", () => {
            const config = startConfig({ startInstanceUrl: "${env:MIRAGON_START_URL}" });

            expect(
                config.expandEnvRefs(
                    lookup({ MIRAGON_START_URL: "  https://gw/{processDefinitionKey}/start  " }),
                ).startInstanceUrl,
            ).toBe("https://gw/{processDefinitionKey}/start");
        });

        it.each([
            ["empty", ""],
            ["blank", "   "],
        ])("rejects an endpoint whose variable is %s", (_desc, value) => {
            const config = startConfig({ endpoint: "${env:MIRAGON_URL}" });

            expect(() => config.expandEnvRefs(lookup({ MIRAGON_URL: value }))).toThrow(
                new InvalidDeploymentConfigError(["endpoint"]),
            );
        });

        it("expands a padded whole credential ref without the padding", () => {
            const config = startConfig({ auth: new BasicAuth("admin", " ${env:MIRAGON_PW} ") });

            expect(config.expandEnvRefs(lookup({ MIRAGON_PW: "s3cret" })).auth).toEqual(
                new BasicAuth("admin", "s3cret"),
            );
        });
    });
});
