import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { DisallowedEnvReferenceError } from "../../shared/domain/errors";
import { assertEnvRefsValid, isWholeEnvRef } from "./envRef";

const SCHEMA_PATH = resolve(__dirname, "../../../../shared/src/lib/deploymentTargets.schema.json");

const CREDENTIAL_FIELDS = ["auth.username", "auth.password", "auth.clientId", "auth.clientSecret"];

const TEMPLATE_FIELDS = [
    "endpoint",
    "tenantId",
    "auth.tokenEndpoint",
    "auth.audience",
    "endpoints.deploy",
    "endpoints.startInstance",
];

interface PatternedProperty {
    readonly field: string;
    readonly pattern: string;
    readonly patternErrorMessage: unknown;
}

/** Dotted property path below `node`, e.g. `auth.username` from a target entry. */
function patternedProperties(node: unknown, path: readonly string[] = []): PatternedProperty[] {
    if (typeof node !== "object" || node === null) {
        return [];
    }
    const schemaNode = node as Record<string, unknown>;
    const own: PatternedProperty[] =
        typeof schemaNode.pattern === "string"
            ? [
                  {
                      field: path.join("."),
                      pattern: schemaNode.pattern,
                      patternErrorMessage: schemaNode.patternErrorMessage,
                  },
              ]
            : [];
    const nested = Object.entries(schemaNode.properties ?? {}).flatMap(([name, child]) =>
        patternedProperties(child, [...path, name]),
    );
    const items = patternedProperties(schemaNode.items, path);
    return [...own, ...nested, ...items];
}

const schema: unknown = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
const targetProperties = patternedProperties(
    (schema as { properties: { targets: unknown } }).properties.targets,
);

function patternsOf(fields: string[]): string[] {
    const patterns = targetProperties
        .filter((property) => fields.includes(property.field))
        .map((property) => property.pattern);
    return [...new Set(patterns)];
}

describe("deployment targets schema", () => {
    it("constrains exactly the credential and template fields of a target", () => {
        expect(patternedProperties(schema)).toHaveLength(targetProperties.length);
        expect(targetProperties.map((property) => property.field).sort()).toEqual(
            [...CREDENTIAL_FIELDS, ...TEMPLATE_FIELDS].sort(),
        );
    });

    it("gives every pattern in the schema a human-readable error message", () => {
        for (const property of patternedProperties(schema)) {
            expect(property.patternErrorMessage, property.field).toEqual(
                expect.stringMatching(/\S/),
            );
        }
    });

    it("shares one pattern across credential fields and another across template fields", () => {
        const credentialPatterns = patternsOf(CREDENTIAL_FIELDS);
        const templatePatterns = patternsOf(TEMPLATE_FIELDS);

        expect(credentialPatterns).toHaveLength(1);
        expect(templatePatterns).toHaveLength(1);
        expect(credentialPatterns[0]).not.toBe(templatePatterns[0]);
    });

    // Editors validate against the schema while typing, the modeler against the
    // parser on load: a value only one accepts is a false squiggle or a silent pass.
    describe("agrees with the parser", () => {
        const [credentialPattern] = patternsOf(CREDENTIAL_FIELDS);
        const [templatePattern] = patternsOf(TEMPLATE_FIELDS);

        // JSON Schema patterns are ECMA-262 regexes matched per code point.
        const schemaAccepts = (pattern: string, value: string) =>
            new RegExp(pattern, "u").test(value);

        const parserAcceptsTemplate = (value: string): boolean => {
            try {
                assertEnvRefsValid(value, "endpoint");
                return true;
            } catch (error) {
                if (error instanceof DisallowedEnvReferenceError) return false;
                throw error;
            }
        };

        it.each<[string, string, boolean, boolean]>([
            // [description, value, valid as template, valid as credential]
            ["a prefixed ref", "${env:MIRAGON_URL}", true, true],
            ["a prefixed ref with lowercase and digits", "${env:MIRAGON_client_2}", true, true],
            ["a prefixed ref inside a URL", "https://${env:MIRAGON_HOST}/engine-rest", true, false],
            [
                "multiple refs",
                "${env:MIRAGON_SCHEME}://${env:MIRAGON_HOST}:${env:MIRAGON_PORT}",
                true,
                false,
            ],
            ["adjacent refs", "${env:MIRAGON_A}${env:MIRAGON_B}", true, false],
            ["a literal URL", "https://camunda.example/engine-rest", true, false],
            ["an empty string", "", true, false],
            [
                "a processDefinitionKey placeholder",
                "https://gw/{processDefinitionKey}/start",
                true,
                false,
            ],
            ["a lone dollar", "$", true, false],
            ["dollars in a literal", "pa$$word", true, false],
            ["a trailing dollar", "https://host/$", true, false],
            ["a dollar before env without braces", "$env:MIRAGON_X", true, false],
            ["a non-env placeholder", "${notenv:X}", true, false],
            ["an uppercase ENV scheme", "${ENV:MIRAGON_X}", true, false],
            ["a double dollar before a ref", "$${env:MIRAGON_X}", true, false],
            ["a stray closing brace after a ref", "${env:MIRAGON_X}}", true, false],
            ["a foreign ref", "${env:GITHUB_TOKEN}", false, false],
            [
                "a foreign ref next to a valid one",
                "${env:MIRAGON_HOST}/${env:GITHUB_TOKEN}",
                false,
                false,
            ],
            ["a foreign name ending in the prefix", "${env:X_MIRAGON_URL}", false, false],
            ["a missing closing brace", "${env:MIRAGON_URL", false, false],
            [
                "a missing closing brace before a later ref",
                "${env:MIRAGON_A/${env:MIRAGON_B}",
                false,
                false,
            ],
            ["an empty name", "${env:}", false, false],
            ["a bare reference start", "${env:", false, false],
            ["the bare prefix", "${env:MIRAGON_}", false, false],
            ["a lowercase prefix", "${env:miragon_URL}", false, false],
            ["invalid characters in the name", "${env:MIRAGON_A-B}", false, false],
            ["a nested ref", "${env:A${env:MIRAGON_B}", false, false],
            ["whitespace inside the braces", "${env: MIRAGON_X}", false, false],
            ["a whitespace-padded ref", "  ${env:MIRAGON_X}  ", true, false],
            ["a trailing newline", "${env:MIRAGON_X}\n", true, false],
            ["a non-ASCII name", "${env:MIRAGON_PÄSSWORT}", false, false],
            ["a non-ASCII literal", "https://kämmerer.example/${env:MIRAGON_PATH}", true, false],
            ["an astral-plane literal", "🚀${env:MIRAGON_X}", true, false],
            ["a fullwidth dollar", "＄{env:GITHUB_TOKEN}", true, false],
        ])("%s", (_desc, value, validTemplate, validCredential) => {
            expect(schemaAccepts(templatePattern, value)).toBe(validTemplate);
            expect(parserAcceptsTemplate(value)).toBe(validTemplate);
            expect(schemaAccepts(credentialPattern, value)).toBe(validCredential);
            expect(isWholeEnvRef(value)).toBe(validCredential);
        });
    });
});
