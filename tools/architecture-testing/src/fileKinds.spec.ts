import { describe, expect, it } from "vitest";

import {
    isBuildConfig,
    isSpecOrSpecData,
    isTestOrDeclarationFile,
    isTypeScriptSource,
    SCRIPT_FILE,
    TYPESCRIPT_FILE,
} from "./fileKinds";

describe("a test or declaration file", () => {
    it.each([
        { path: "libs/core/src/a.spec.ts", testOrDeclaration: true },
        { path: "libs/core/src/a.browser.spec.ts", testOrDeclaration: true },
        { path: "libs/core/src/a.test.tsx", testOrDeclaration: true },
        { path: "libs/core/src/a.spec.mjs", testOrDeclaration: true },
        { path: "libs/core/src/env.d.ts", testOrDeclaration: true },
        { path: "libs/core/src/env.d.mts", testOrDeclaration: true },
        { path: "libs/core/src/__fixtures__/fake.ts", testOrDeclaration: true },
        { path: "libs/core/src/__tests__/a.ts", testOrDeclaration: true },
        { path: "libs/core/src/test/a.ts", testOrDeclaration: true },
        { path: "libs/core/tests/harness.ts", testOrDeclaration: true },
        { path: "libs/core/src/a.ts", testOrDeclaration: false },
        { path: "libs/core/src/testing/a.ts", testOrDeclaration: false },
        { path: "libs/core/src/test.ts", testOrDeclaration: false },
        { path: "libs/core/src/a.spec.data.ts", testOrDeclaration: false },
        { path: "libs/core/src/a.test.helpers.ts", testOrDeclaration: false },
        { path: "libs/core/vitest.config.ts", testOrDeclaration: false },
    ])(
        "reads $path as a test or declaration file: $testOrDeclaration",
        ({ path, testOrDeclaration }) => {
            expect(isTestOrDeclarationFile(path)).toBe(testOrDeclaration);
        },
    );
});

describe("a TypeScript file and a script file", () => {
    it.each([
        { path: "libs/core/src/a.ts", typeScript: true, script: true },
        { path: "libs/core/src/View.tsx", typeScript: true, script: true },
        { path: "libs/core/src/worker.mts", typeScript: true, script: true },
        { path: "libs/core/src/legacy.cts", typeScript: true, script: true },
        { path: "libs/core/src/env.d.ts", typeScript: true, script: true },
        { path: "scripts/build.js", typeScript: false, script: true },
        { path: "libs/core/src/View.jsx", typeScript: false, script: true },
        { path: "scripts/build.mjs", typeScript: false, script: true },
        { path: "eslint.config.cjs", typeScript: false, script: true },
        { path: "libs/core/src/View.mtsx", typeScript: false, script: false },
        { path: "libs/core/src/View.cjsx", typeScript: false, script: false },
        { path: "libs/core/src/schema.json", typeScript: false, script: false },
        { path: "libs/core/src/theme.css", typeScript: false, script: false },
        { path: "src/main/kotlin/Editor.kt", typeScript: false, script: false },
        { path: "libs/core/src/a.ts.snap", typeScript: false, script: false },
    ])(
        "reads $path as TypeScript: $typeScript, as a script: $script",
        ({ path, typeScript, script }) => {
            expect({
                typeScript: TYPESCRIPT_FILE.test(path),
                script: SCRIPT_FILE.test(path),
            }).toEqual({
                typeScript,
                script,
            });
        },
    );
});

describe("a TypeScript source", () => {
    it.each([
        { path: "src/a.ts", source: true },
        { path: "src/View.tsx", source: true },
        { path: "bin/run.mts", source: true },
        { path: "vitest.config.ts", source: true },
        { path: "src/a.spec.ts", source: false },
        { path: "src/env.d.mts", source: false },
        { path: "src/__fixtures__/fake.ts", source: false },
        { path: "test/harness.ts", source: false },
        { path: "src/a.js", source: false },
    ])("reads $path as a TypeScript source: $source", ({ path, source }) => {
        expect(isTypeScriptSource(path)).toBe(source);
    });
});

describe("a spec or a module only specs read", () => {
    it.each([
        { path: "libs/core/src/a.spec.ts", specOrSpecData: true },
        { path: "libs/core/src/a.test.tsx", specOrSpecData: true },
        { path: "libs/core/src/a.spec.data.ts", specOrSpecData: true },
        { path: "libs/core/src/a.test.helpers.mjs", specOrSpecData: true },
        { path: "libs/core/src/messages.spec.cases.json", specOrSpecData: true },
        { path: "libs/core/src/a.ts", specOrSpecData: false },
        { path: "libs/core/src/test.ts", specOrSpecData: false },
        { path: "libs/core/src/latest.ts", specOrSpecData: false },
        { path: "libs/core/src/a.spec/model.ts", specOrSpecData: false },
        { path: "libs/core/src/__fixtures__/fake.ts", specOrSpecData: false },
    ])("reads $path as a spec or spec data: $specOrSpecData", ({ path, specOrSpecData }) => {
        expect(isSpecOrSpecData(path)).toBe(specOrSpecData);
    });
});

describe("a build config", () => {
    it.each([
        { path: "vite.config.ts", buildConfig: true },
        { path: "apps/bpmn-webview/vite.config.mts", buildConfig: true },
        { path: "libs/core/vitest.browser.config.ts", buildConfig: true },
        { path: "libs/modeler-core/stryker.config.mjs", buildConfig: true },
        { path: "apps/vscode-plugin/eslint.config.cjs", buildConfig: true },
        { path: "eslint.config.cjs", buildConfig: true },
        { path: "libs/core/src/theme.config.json", buildConfig: true },
        { path: "libs/core/tsconfig.json", buildConfig: false },
        { path: "libs/core/src/config.ts", buildConfig: false },
        { path: "libs/core/src/editorConfig.ts", buildConfig: false },
        { path: "libs/core/src/app.config", buildConfig: false },
        { path: "libs/core/src/a.config/index.ts", buildConfig: false },
    ])("reads $path as a build config: $buildConfig", ({ path, buildConfig }) => {
        expect(isBuildConfig(path)).toBe(buildConfig);
    });
});
