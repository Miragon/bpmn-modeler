import { describe, expect, it } from "vitest";

import {
    type FilePin,
    isValueSetSource,
    repeatedValueSetFindings,
    type ValueSetOccurrence,
} from "./repeatedValueSets";

const AUTH_HOME: ValueSetOccurrence = {
    path: "a/domain/auth.ts",
    line: 1,
    values: ["none", "basic", "oauth2"],
};
const AUTH_COPY: ValueSetOccurrence = {
    path: "b/service/x.ts",
    line: 3,
    values: ["none", "basic", "oauth2"],
};
const AUTH_REORDERED: ValueSetOccurrence = {
    ...AUTH_COPY,
    values: ["oauth2", "none", "basic"],
};
const TYPE_PIN_REMEDY =
    "pin the copy to the home's type, and derive it from the home only where the order is the same concern";
const AUTH_CHAIN: ValueSetOccurrence = {
    path: "c/adapter/in/check.ts",
    line: 7,
    values: ["none", "basic", "oauth2"],
};
const AUTH_KEY = '["basic","none","oauth2"]';

function findingsOf(occurrences: readonly ValueSetOccurrence[], pins: readonly FilePin[] = []) {
    return repeatedValueSetFindings({ occurrences, pins });
}

describe("the repeated value set findings", () => {
    it("report each occurrence of a set that spans two files, naming the others", () => {
        expect(findingsOf([AUTH_HOME, AUTH_COPY])).toEqual([
            {
                key: `a/domain/auth.ts — ${AUTH_KEY}`,
                path: "a/domain/auth.ts",
                paths: ["a/domain/auth.ts"],
                line: 1,
                message: "`basic` · `none` · `oauth2`, also at `b/service/x.ts:3`",
            },
            {
                key: `b/service/x.ts — ${AUTH_KEY}`,
                path: "b/service/x.ts",
                paths: ["b/service/x.ts"],
                line: 3,
                message: "`basic` · `none` · `oauth2`, also at `a/domain/auth.ts:1`",
            },
        ]);
    });

    it("report a copy in another order as the same set, keyed alike", () => {
        expect(findingsOf([AUTH_HOME, AUTH_REORDERED]).map(({ key }) => key)).toEqual([
            `a/domain/auth.ts — ${AUTH_KEY}`,
            `b/service/x.ts — ${AUTH_KEY}`,
        ]);
    });

    it("name the other occurrences in another order and the type pin as the remedy", () => {
        expect(
            findingsOf([AUTH_HOME, AUTH_REORDERED, AUTH_CHAIN]).map(
                ({ path, line, message }) => `${path}:${line} ${message}`,
            ),
        ).toEqual([
            `a/domain/auth.ts:1 \`basic\` · \`none\` · \`oauth2\`, also at \`b/service/x.ts:3\`, \`c/adapter/in/check.ts:7\`; in another order at \`b/service/x.ts:3\`: ${TYPE_PIN_REMEDY}`,
            `b/service/x.ts:3 \`basic\` · \`none\` · \`oauth2\`, also at \`a/domain/auth.ts:1\`, \`c/adapter/in/check.ts:7\`; in another order at \`a/domain/auth.ts:1\`, \`c/adapter/in/check.ts:7\`: ${TYPE_PIN_REMEDY}`,
            `c/adapter/in/check.ts:7 \`basic\` · \`none\` · \`oauth2\`, also at \`a/domain/auth.ts:1\`, \`b/service/x.ts:3\`; in another order at \`b/service/x.ts:3\`: ${TYPE_PIN_REMEDY}`,
        ]);
    });

    it("compare the order of first appearances, so a repeated value does not reorder a copy", () => {
        const withRepeat: ValueSetOccurrence = {
            ...AUTH_COPY,
            values: ["none", "basic", "none", "oauth2", "basic"],
        };

        expect(findingsOf([AUTH_HOME, withRepeat]).map(({ message }) => message)).toEqual([
            "`basic` · `none` · `oauth2`, also at `b/service/x.ts:3`",
            "`basic` · `none` · `oauth2`, also at `a/domain/auth.ts:1`",
        ]);
    });

    it("join an occurrence of a third file, also a second one in a file already listed", () => {
        const secondInHome: ValueSetOccurrence = { ...AUTH_HOME, line: 9 };

        expect(
            findingsOf([AUTH_HOME, AUTH_COPY, AUTH_CHAIN, secondInHome]).map(
                ({ path, line, message }) => `${path}:${line} ${message}`,
            ),
        ).toEqual([
            "a/domain/auth.ts:1 `basic` · `none` · `oauth2`, also at `a/domain/auth.ts:9`, `b/service/x.ts:3`, `c/adapter/in/check.ts:7`",
            "a/domain/auth.ts:9 `basic` · `none` · `oauth2`, also at `a/domain/auth.ts:1`, `b/service/x.ts:3`, `c/adapter/in/check.ts:7`",
            "b/service/x.ts:3 `basic` · `none` · `oauth2`, also at `a/domain/auth.ts:1`, `a/domain/auth.ts:9`, `c/adapter/in/check.ts:7`",
            "c/adapter/in/check.ts:7 `basic` · `none` · `oauth2`, also at `a/domain/auth.ts:1`, `a/domain/auth.ts:9`, `b/service/x.ts:3`",
        ]);
    });

    it.each<[string, readonly ValueSetOccurrence[]]>([
        [
            "a set of one distinct value",
            [
                { path: "a.ts", line: 1, values: ["none", "none"] },
                { path: "b.ts", line: 1, values: ["none"] },
            ],
        ],
        ["a set in one file only", [AUTH_HOME, { ...AUTH_HOME, line: 4 }]],
        [
            "a set that differs by one value",
            [AUTH_HOME, { ...AUTH_COPY, values: ["none", "basic"] }],
        ],
    ])("report nothing for %s", (_, occurrences) => {
        expect(findingsOf(occurrences)).toEqual([]);
    });

    it("treat a repeated value as the same set", () => {
        const withRepeat: ValueSetOccurrence = {
            ...AUTH_COPY,
            values: ["none", "basic", "oauth2", "none"],
        };

        expect(findingsOf([AUTH_HOME, withRepeat]).map(({ key }) => key)).toEqual([
            `a/domain/auth.ts — ${AUTH_KEY}`,
            `b/service/x.ts — ${AUTH_KEY}`,
        ]);
    });

    it("report nothing for copies pinned to their home, in either direction", () => {
        const pins: FilePin[] = [
            { path: AUTH_COPY.path, pinnedPath: AUTH_HOME.path },
            { path: AUTH_HOME.path, pinnedPath: AUTH_CHAIN.path },
        ];

        expect(findingsOf([AUTH_HOME, AUTH_COPY, AUTH_CHAIN], pins)).toEqual([]);
    });

    it("report every occurrence again when an unpinned copy joins a pinned pair", () => {
        const pins: FilePin[] = [{ path: AUTH_COPY.path, pinnedPath: AUTH_HOME.path }];

        expect(
            findingsOf([AUTH_HOME, AUTH_COPY, AUTH_CHAIN], pins).map(({ path }) => path),
        ).toEqual([AUTH_HOME.path, AUTH_COPY.path, AUTH_CHAIN.path]);
    });

    it("keep a pin from linking files through one that does not hold the set", () => {
        const pins: FilePin[] = [
            { path: AUTH_COPY.path, pinnedPath: "z/elsewhere.ts" },
            { path: "z/elsewhere.ts", pinnedPath: AUTH_HOME.path },
        ];

        expect(findingsOf([AUTH_HOME, AUTH_COPY], pins).map(({ path }) => path)).toEqual([
            AUTH_HOME.path,
            AUTH_COPY.path,
        ]);
    });
});

describe("a value set source", () => {
    it.each([
        "a/domain/auth.ts",
        "a/ui/View.tsx",
        "a/tools/build.mjs",
        "a/tools/build.cjs",
        "a/src/main.js",
        "a/src/App.jsx",
        "a/src/module.mts",
        "a/src/module.cts",
        "a/src/testing/inMemoryStore.ts",
        "a/src/contest/rules.ts",
        "a/src/latest.ts",
    ])("is the script file %s", (path) => {
        expect(isValueSetSource(path)).toBe(true);
    });

    it.each([
        "a/domain/auth.spec.ts",
        "a/ui/View.test.tsx",
        "a/tools/build.spec.mjs",
        "a/types/bpmn-moddle.d.ts",
        "a/types/module.d.mts",
        "a/src/__fixtures__/vscodeWindowFake.ts",
        "__fixtures__/harness.mjs",
        "apps/x/test/e2e/editorPage.ts",
        "apps/x/tests/helpers.mjs",
        "a/src/__tests__/render.tsx",
        "test/setup.js",
        "a/vite.config.ts",
        "a/eslint.config.mjs",
        "a/package.json",
        "a/src/theme.css",
        "a/src/Store.kt",
    ])("is not %s", (path) => {
        expect(isValueSetSource(path)).toBe(false);
    });
});
