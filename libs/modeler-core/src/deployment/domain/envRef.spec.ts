import { describe, expect, it, vi } from "vitest";

import {
    DisallowedEnvReferenceError,
    UnresolvedEnvVariableError,
} from "../../shared/domain/errors";
import {
    assertEnvRefsValid,
    containsEnvRef,
    emptyEnvLookup,
    envRefsIn,
    expandCredentialEnvRefs,
    expandEnvRefs,
    expandEnvRefsLeniently,
    expandOptionalEnvRefs,
    isWholeEnvRef,
    NO_ENV_VARIABLES,
    recordingLookup,
    referenceableVariables,
    wholeEnvRefOf,
} from "./envRef";

const lookup = (map: Record<string, string>) => (name: string) => map[name];

function errorFrom(action: () => unknown): unknown {
    try {
        action();
    } catch (error) {
        return error;
    }
    throw new Error("expected the action to throw");
}

const DOT_ENV_PATH = "/ws/project/.env";

const DISALLOWED_REFS = [
    ["a missing closing brace", "${env:MIRAGON_URL"],
    ["invalid characters in the name", "${env:MIRAGON_A-B}"],
    ["an empty name", "${env:}"],
    ["a foreign name", "${env:GITHUB_TOKEN}"],
    ["the bare prefix", "${env:MIRAGON_}"],
    ["a lowercase prefix", "${env:miragon_URL}"],
];

const SECRETS_WITH_DISALLOWED_REFS = [
    ["an unclosed ref", "p${env:hunter2rest"],
    ["a ref name with a space", "${env:hunter 2}"],
    ["a well-formed foreign ref", "p${env:hunter2}rest"],
];

const REFERENCEABLE_NAMES = ["MIRAGON_URL", "MIRAGON_client_2"];

const UNREFERENCEABLE_NAMES = ["MIRAGON_", "GITHUB_TOKEN", "X_MIRAGON_URL", "MIRAGON_A-B"];

describe("referenceable variable names", () => {
    it.each(REFERENCEABLE_NAMES)("resolves %s from the .env and accepts a ref to it", (name) => {
        const resolve = referenceableVariables(new Map([[name, "value"]]), DOT_ENV_PATH);

        expect(resolve(name)).toBe("value");
        expect(expandEnvRefs(`\${env:${name}}`, resolve, "endpoint")).toBe("value");
        expect(() => assertEnvRefsValid(`\${env:${name}}`, "endpoint")).not.toThrow();
    });

    it.each(UNREFERENCEABLE_NAMES)("drops %s from the .env and rejects a ref to it", (name) => {
        const resolve = referenceableVariables(new Map([[name, "value"]]), DOT_ENV_PATH);

        expect(resolve(name)).toBeUndefined();
        expect(() => expandEnvRefs(`\${env:${name}}`, resolve, "endpoint")).toThrow(
            DisallowedEnvReferenceError,
        );
        expect(() => assertEnvRefsValid(`\${env:${name}}`, "endpoint")).toThrow(
            DisallowedEnvReferenceError,
        );
    });
});

describe("expandEnvRefs", () => {
    it("returns a value without refs unchanged", () => {
        const value = "https://camunda.example/engine-rest";
        expect(expandEnvRefs(value, lookup({}), "endpoint")).toBe(value);
    });

    it("leaves a dollar sign that does not open an env ref untouched", () => {
        const value = "pa$$word ${notenv:X} $env:MIRAGON_X";
        expect(expandEnvRefs(value, lookup({}), "auth.password")).toBe(value);
    });

    it("expands multiple refs inside one value", () => {
        expect(
            expandEnvRefs(
                "https://camunda.${env:MIRAGON_STAGE}.${env:MIRAGON_REGION}/rest",
                lookup({
                    MIRAGON_STAGE: "prod",
                    MIRAGON_REGION: "eu",
                }),
                "endpoint",
            ),
        ).toBe("https://camunda.prod.eu/rest");
    });

    it("keeps the padding around a ref", () => {
        expect(
            expandEnvRefs(" ${env:MIRAGON_URL} ", lookup({ MIRAGON_URL: "https://c" }), "endpoint"),
        ).toBe(" https://c ");
    });

    it("throws naming the variable and field when a prefixed variable is unset", () => {
        const error = errorFrom(() =>
            expandEnvRefs("${env:MIRAGON_PASSWORD}", lookup({}), "auth.password"),
        );

        expect(error).toBeInstanceOf(UnresolvedEnvVariableError);
        expect(error).toMatchObject({ variable: "MIRAGON_PASSWORD", field: "auth.password" });
    });

    it("names the searched .env in the unset message so the fix is actionable", () => {
        const error = errorFrom(() =>
            expandEnvRefs(
                "${env:MIRAGON_URL}",
                referenceableVariables(new Map(), DOT_ENV_PATH),
                "endpoint",
            ),
        );

        expect(error).toBeInstanceOf(UnresolvedEnvVariableError);
        expect((error as Error).message).toContain(`Define it in ${DOT_ENV_PATH}.`);
    });

    it("explains the workspace-folder requirement when no .env applies", () => {
        const error = errorFrom(() =>
            expandEnvRefs("${env:MIRAGON_URL}", NO_ENV_VARIABLES, "endpoint"),
        );

        expect(error).toBeInstanceOf(UnresolvedEnvVariableError);
        expect((error as Error).message).toContain("inside a workspace folder");
        expect((error as Error).message).not.toContain("Define it in");
    });

    it("rejects a foreign variable as disallowed without ever looking it up", () => {
        const foreignLookup = vi.fn(lookup({ GITHUB_TOKEN: "ghp_secret" }));

        const error = errorFrom(() =>
            expandEnvRefs("${env:GITHUB_TOKEN}", foreignLookup, "auth.password"),
        );

        expect(error).toBeInstanceOf(DisallowedEnvReferenceError);
        expect(error).not.toBeInstanceOf(UnresolvedEnvVariableError);
        expect(error).toMatchObject({ field: "auth.password" });
        expect(foreignLookup).not.toHaveBeenCalled();
    });

    it("rejects a foreign variable next to a valid one", () => {
        const mixedLookup = vi.fn(lookup({ MIRAGON_HOST: "h", GITHUB_TOKEN: "ghp_secret" }));

        expect(() =>
            expandEnvRefs("${env:MIRAGON_HOST}/${env:GITHUB_TOKEN}", mixedLookup, "endpoint"),
        ).toThrow(DisallowedEnvReferenceError);
        expect(mixedLookup).not.toHaveBeenCalledWith("GITHUB_TOKEN");
    });

    it.each(DISALLOWED_REFS)("rejects %s naming only the field", (_desc, reference) => {
        const error = errorFrom(() =>
            expandEnvRefs(`https://${reference}`, lookup({}), "endpoint"),
        );

        expect(error).toBeInstanceOf(DisallowedEnvReferenceError);
        expect(error).toMatchObject({ field: "endpoint" });
        expect((error as Error).message).toContain(
            '"endpoint" contains an invalid environment reference',
        );
        expect((error as Error).message).not.toContain(reference);
    });

    it.each(SECRETS_WITH_DISALLOWED_REFS)(
        "never echoes a password holding %s",
        (_desc, password) => {
            const error = errorFrom(() => expandEnvRefs(password, lookup({}), "auth.password"));

            expect(error).toBeInstanceOf(DisallowedEnvReferenceError);
            expect((error as Error).message).toContain(
                '"auth.password" contains an invalid environment reference',
            );
            expect((error as Error).message).not.toContain("hunter");
        },
    );
});

describe("expandCredentialEnvRefs", () => {
    const credentials = lookup({ MIRAGON_PW: "s3cret", MIRAGON_USER: "u" });

    it.each([
        ["an exact", "${env:MIRAGON_PW}"],
        ["a space-padded", " ${env:MIRAGON_PW} "],
        ["a tab- and newline-padded", "\t${env:MIRAGON_PW}\n"],
    ])("expands %s whole ref to the exact value", (_desc, value) => {
        expect(expandCredentialEnvRefs(value, credentials, "auth.password")).toBe("s3cret");
    });

    it("keeps the padding of partial interpolation", () => {
        expect(
            expandCredentialEnvRefs(" user-${env:MIRAGON_USER} ", credentials, "auth.username"),
        ).toBe(" user-u ");
    });

    it("leaves a padded literal untouched", () => {
        expect(expandCredentialEnvRefs("  s3cret  ", credentials, "auth.password")).toBe(
            "  s3cret  ",
        );
    });

    it("rejects a padded foreign ref instead of trimming it into a lookup", () => {
        const foreignLookup = vi.fn(lookup({ GITHUB_TOKEN: "ghp_secret" }));

        expect(() =>
            expandCredentialEnvRefs(" ${env:GITHUB_TOKEN} ", foreignLookup, "auth.password"),
        ).toThrow(DisallowedEnvReferenceError);
        expect(foreignLookup).not.toHaveBeenCalled();
    });

    it("throws naming the variable and field when a padded whole ref is unset", () => {
        const error = errorFrom(() =>
            expandCredentialEnvRefs(" ${env:MIRAGON_MISSING} ", credentials, "auth.password"),
        );

        expect(error).toBeInstanceOf(UnresolvedEnvVariableError);
        expect(error).toMatchObject({ variable: "MIRAGON_MISSING", field: "auth.password" });
    });
});

describe("expandOptionalEnvRefs", () => {
    it("passes undefined through", () => {
        expect(expandOptionalEnvRefs(undefined, lookup({}), "endpoints.deploy")).toBeUndefined();
    });

    it("expands a defined value", () => {
        expect(
            expandOptionalEnvRefs(
                "${env:MIRAGON_URL}/deploy",
                lookup({ MIRAGON_URL: "https://gw" }),
                "endpoints.deploy",
            ),
        ).toBe("https://gw/deploy");
    });
});

describe("expandEnvRefsLeniently", () => {
    it("expands known prefixed refs and keeps unresolved ones verbatim", () => {
        expect(
            expandEnvRefsLeniently("${env:MIRAGON_A}-${env:MIRAGON_B}", lookup({ MIRAGON_A: "a" })),
        ).toBe("a-${env:MIRAGON_B}");
    });

    it("keeps foreign refs verbatim without looking them up", () => {
        const foreignLookup = vi.fn(lookup({ GITHUB_TOKEN: "ghp_secret" }));

        expect(expandEnvRefsLeniently("https://${env:GITHUB_TOKEN}", foreignLookup)).toBe(
            "https://${env:GITHUB_TOKEN}",
        );
        expect(foreignLookup).not.toHaveBeenCalled();
    });

    it.each(DISALLOWED_REFS)("keeps %s verbatim instead of throwing", (_desc, reference) => {
        const value = `https://${reference}`;
        expect(expandEnvRefsLeniently(value, lookup({ MIRAGON_URL: "resolved" }))).toBe(value);
    });
});

describe("containsEnvRef", () => {
    it("is true for well-formed, foreign and malformed refs alike", () => {
        expect(containsEnvRef("${env:MIRAGON_URL}")).toBe(true);
        expect(containsEnvRef("x-${env:GITHUB_TOKEN}")).toBe(true);
        expect(containsEnvRef("${env:")).toBe(true);
    });

    it("is false for literals and undefined", () => {
        expect(containsEnvRef("https://camunda.example")).toBe(false);
        expect(containsEnvRef("${notenv:X}")).toBe(false);
        expect(containsEnvRef(undefined)).toBe(false);
    });
});

describe("envRefsIn", () => {
    it("references env when any of the values contains a ref", () => {
        expect(envRefsIn(undefined, "literal", "${env:MIRAGON_URL}").referencesEnv()).toBe(true);
    });

    it("does not reference env for literals only", () => {
        expect(envRefsIn(undefined, "literal").referencesEnv()).toBe(false);
    });
});

describe("isWholeEnvRef", () => {
    it("accepts a value that is exactly one prefixed ref", () => {
        expect(isWholeEnvRef("${env:MIRAGON_TOKEN}")).toBe(true);
    });

    it("rejects surrounding whitespace", () => {
        expect(isWholeEnvRef("  ${env:MIRAGON_TOKEN}  ")).toBe(false);
    });

    it("rejects refs without the prefix or with the bare prefix", () => {
        expect(isWholeEnvRef("${env:TOKEN}")).toBe(false);
        expect(isWholeEnvRef("${env:MIRAGON_}")).toBe(false);
    });

    it("rejects partial interpolation and literals", () => {
        expect(isWholeEnvRef("user-${env:MIRAGON_TOKEN}")).toBe(false);
        expect(isWholeEnvRef("plain-secret")).toBe(false);
        expect(isWholeEnvRef("${env:MIRAGON_A}${env:MIRAGON_B}")).toBe(false);
    });
});

describe("wholeEnvRefOf", () => {
    it("returns the trimmed ref when the input is one prefixed ref", () => {
        expect(wholeEnvRefOf("  ${env:MIRAGON_TOKEN}  ")).toBe("${env:MIRAGON_TOKEN}");
    });

    it("returns undefined for literals, partials, foreign refs and missing input", () => {
        expect(wholeEnvRefOf("secret")).toBeUndefined();
        expect(wholeEnvRefOf("x-${env:MIRAGON_TOKEN}")).toBeUndefined();
        expect(wholeEnvRefOf("${env:GITHUB_TOKEN}")).toBeUndefined();
        expect(wholeEnvRefOf(undefined)).toBeUndefined();
    });
});

describe("referenceableVariables", () => {
    it("resolves prefixed variables and drops every other key", () => {
        const resolve = referenceableVariables(
            new Map([
                ["MIRAGON_URL", "https://camunda.example"],
                ["GITHUB_TOKEN", "ghp_secret"],
                ["MIRAGON_", "bare-prefix"],
            ]),
            DOT_ENV_PATH,
        );

        expect(resolve("MIRAGON_URL")).toBe("https://camunda.example");
        expect(resolve("GITHUB_TOKEN")).toBeUndefined();
        expect(resolve("MIRAGON_")).toBeUndefined();
    });

    it("names the .env it was read from as its source", () => {
        expect(referenceableVariables(new Map(), DOT_ENV_PATH).source).toBe(DOT_ENV_PATH);
    });

    it("keeps a variable set to an empty value distinct from an unset one", () => {
        const resolve = referenceableVariables(new Map([["MIRAGON_TENANT", ""]]), DOT_ENV_PATH);

        expect(resolve("MIRAGON_TENANT")).toBe("");
        expect(expandEnvRefs("${env:MIRAGON_TENANT}", resolve, "tenantId")).toBe("");
    });
});

describe("recordingLookup", () => {
    const dotEnv = () =>
        referenceableVariables(
            new Map([
                ["MIRAGON_URL", "https://camunda.example"],
                ["MIRAGON_PASSWORD", "s3cret"],
                ["MIRAGON_EMPTY", ""],
                ["MIRAGON_BLANK", "  "],
            ]),
            DOT_ENV_PATH,
        );

    it("hands out the wrapped lookup's values unchanged", () => {
        const recording = recordingLookup(dotEnv());

        expect(recording("MIRAGON_URL")).toBe("https://camunda.example");
        expect(recording("MIRAGON_BLANK")).toBe("  ");
        expect(recording("MIRAGON_MISSING")).toBeUndefined();
    });

    it("records only the values it handed out, not the rest of the .env", () => {
        const recording = recordingLookup(dotEnv());

        expect(expandEnvRefs("${env:MIRAGON_URL}/engine-rest", recording, "endpoint")).toBe(
            "https://camunda.example/engine-rest",
        );

        expect([...recording.resolved]).toEqual(["https://camunda.example"]);
    });

    it("records a value once however often it is handed out", () => {
        const recording = recordingLookup(dotEnv());

        recording("MIRAGON_PASSWORD");
        recording("MIRAGON_PASSWORD");

        expect([...recording.resolved]).toEqual(["s3cret"]);
    });

    it("records no empty or whitespace-only value", () => {
        const recording = recordingLookup(dotEnv());

        recording("MIRAGON_EMPTY");
        recording("MIRAGON_BLANK");

        expect(recording.resolved.size).toBe(0);
    });

    it("records nothing for an unresolved name and still names the searched .env", () => {
        const recording = recordingLookup(dotEnv());

        const error = errorFrom(() =>
            expandEnvRefs("${env:MIRAGON_MISSING}", recording, "endpoint"),
        );

        expect(error).toBeInstanceOf(UnresolvedEnvVariableError);
        expect((error as Error).message).toContain(`Define it in ${DOT_ENV_PATH}.`);
        expect(recording.resolved.size).toBe(0);
    });

    it("forwards the wrapped lookup's source, or none", () => {
        expect(recordingLookup(dotEnv()).source).toBe(DOT_ENV_PATH);
        expect(recordingLookup(NO_ENV_VARIABLES).source).toBeUndefined();
    });

    it("keeps a separate record per wrapper over the same lookup", () => {
        const lookupOfFile = dotEnv();
        const first = recordingLookup(lookupOfFile);
        const second = recordingLookup(lookupOfFile);

        first("MIRAGON_URL");
        second("MIRAGON_PASSWORD");

        expect([...first.resolved]).toEqual(["https://camunda.example"]);
        expect([...second.resolved]).toEqual(["s3cret"]);
    });
});

describe("emptyEnvLookup", () => {
    it("resolves nothing but still names the .env that was searched", () => {
        const resolve = emptyEnvLookup(DOT_ENV_PATH);

        expect(resolve("MIRAGON_URL")).toBeUndefined();
        expect(resolve.source).toBe(DOT_ENV_PATH);
        expect(() => expandEnvRefs("${env:MIRAGON_URL}", resolve, "endpoint")).toThrow(
            `Define it in ${DOT_ENV_PATH}.`,
        );
    });
});

describe("NO_ENV_VARIABLES", () => {
    it("resolves nothing and has no source", () => {
        expect(NO_ENV_VARIABLES("MIRAGON_URL")).toBeUndefined();
        expect(NO_ENV_VARIABLES.source).toBeUndefined();
    });
});

describe("assertEnvRefsValid", () => {
    it("passes undefined, literals and valid prefixed refs", () => {
        expect(() => assertEnvRefsValid(undefined, "endpoint")).not.toThrow();
        expect(() => assertEnvRefsValid("https://camunda.example", "endpoint")).not.toThrow();
        expect(() =>
            assertEnvRefsValid("https://${env:MIRAGON_HOST}/${env:MIRAGON_PATH}", "endpoint"),
        ).not.toThrow();
    });

    it.each(DISALLOWED_REFS)("rejects %s naming only the field", (_desc, reference) => {
        const error = errorFrom(() => assertEnvRefsValid(`https://${reference}`, "tenantId"));

        expect(error).toBeInstanceOf(DisallowedEnvReferenceError);
        expect(error).toMatchObject({ field: "tenantId" });
        expect((error as Error).message).toContain(
            '"tenantId" contains an invalid environment reference',
        );
        expect((error as Error).message).not.toContain(reference);
    });

    it.each(SECRETS_WITH_DISALLOWED_REFS)(
        "never echoes a password holding %s",
        (_desc, password) => {
            const error = errorFrom(() => assertEnvRefsValid(password, "auth.password"));

            expect(error).toBeInstanceOf(DisallowedEnvReferenceError);
            expect((error as Error).message).toContain(
                '"auth.password" contains an invalid environment reference',
            );
            expect((error as Error).message).not.toContain("hunter");
        },
    );
});
