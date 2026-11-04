import { describe, expect, it } from "vitest";

import type { SourceFile } from "./sourceTree";
import { findTypeEqualityPins } from "./typeEqualityPins";

const HOME: SourceFile = {
    path: "core/auth.ts",
    text: [
        'export const AUTH_TYPES = ["none", "basic"] as const;',
        "export type AuthType = (typeof AUTH_TYPES)[number];",
        "export const AUTH = { types: AUTH_TYPES };",
    ].join("\n"),
};
const COPY: SourceFile = {
    path: "protocol/messages.ts",
    text: 'export type AuthPayload = "none" | "basic";',
};

function pinsIn(text: string, tree: readonly SourceFile[] = [HOME, COPY]) {
    return findTypeEqualityPins([...tree, { path: "core/auth.spec.ts", text }]);
}

describe("findTypeEqualityPins", () => {
    it.each([
        {
            form: "type arguments",
            source: "expectTypeOf<AuthPayload>().toEqualTypeOf<AuthType>();",
        },
        {
            form: "an indexed typeof of a constant",
            source: "expectTypeOf<AuthPayload>().toEqualTypeOf<(typeof AUTH_TYPES)[number]>();",
        },
        {
            form: "a member of an imported constant",
            source: "expectTypeOf<AuthPayload>().toEqualTypeOf<(typeof AUTH.types)[number]>();",
        },
        {
            form: "value arguments",
            source: "expectTypeOf(payload as AuthPayload).toEqualTypeOf(AUTH_TYPES[0] as AuthType);",
        },
    ])("resolves $form to the declaring files", ({ source }) => {
        const imports = [
            'import type { AuthPayload } from "../protocol/messages";',
            'import { AUTH, AUTH_TYPES, type AuthType } from "./auth";',
            'import { expectTypeOf } from "vitest";',
        ].join("\n");

        expect(pinsIn(`${imports}\n${source}`)).toEqual([
            {
                path: "core/auth.spec.ts",
                line: 4,
                actualFiles: ["protocol/messages.ts"],
                expectedFiles: ["core/auth.ts"],
            },
        ]);
    });

    it("follows renamed and namespace imports, barrels and path aliases", () => {
        const tree: SourceFile[] = [
            HOME,
            COPY,
            { path: "protocol/index.ts", text: 'export * from "./messages";' },
        ];
        const source = [
            'import type * as protocol from "@scope/protocol";',
            'import type { AuthType as Home } from "./auth";',
            "expectTypeOf<protocol.AuthPayload>().toEqualTypeOf<Home>();",
        ].join("\n");

        expect(
            findTypeEqualityPins([...tree, { path: "core/auth.spec.ts", text: source }], {
                aliases: [{ pattern: "@scope/protocol", targets: ["protocol/index.ts"] }],
            }),
        ).toEqual([
            {
                path: "core/auth.spec.ts",
                line: 3,
                actualFiles: ["protocol/messages.ts"],
                expectedFiles: ["core/auth.ts"],
            },
        ]);
    });

    it("resolves a local or unresolved name to no file", () => {
        const source = [
            'import type { Missing } from "./missing";',
            'type Local = "none" | "basic";',
            "expectTypeOf<Local>().toEqualTypeOf<Missing>();",
        ].join("\n");

        expect(pinsIn(source)).toEqual([
            { path: "core/auth.spec.ts", line: 3, actualFiles: [], expectedFiles: [] },
        ]);
    });

    it.each([
        ["a negated assertion", "expectTypeOf<AuthPayload>().not.toEqualTypeOf<AuthType>();"],
        ["another assertion", "expectTypeOf<AuthPayload>().toMatchTypeOf<AuthType>();"],
        ["an assertion without a subject", "expectTypeOf().toEqualTypeOf<AuthType>();"],
        ["a comment", "// expectTypeOf<AuthPayload>().toEqualTypeOf<AuthType>();"],
    ])("reads no pin from %s", (_, source) => {
        expect(pinsIn(source)).toEqual([]);
    });
});
