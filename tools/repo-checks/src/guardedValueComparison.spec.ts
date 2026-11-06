import { directivesWithoutIssue, readComments } from "@miragon/architecture-testing";
import { ESLint, type Linter } from "eslint";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "../../..");
const RULE = "miragon/no-guarded-value-comparison";
const ENGINE_HOME = join(REPO_ROOT, "libs/modeler-types/src/engine.ts");
const ENGINE = 'import("@miragon/bpmn-modeler-types").Engine';

const VERIFICATION_SERVICE =
    "libs/modeler-core/src/deployment/service/DeploymentVerificationService.ts";
const DEPLOYMENT_PROMPTS = "libs/modeler-core/src/deployment/domain/deploymentPrompts.ts";
const DEPLOYMENT_SERVICE = "libs/modeler-core/src/deployment/service/DeploymentService.ts";
const CAPABILITY_MODULES = "packages/bpmn-modeler/src/capabilityModules.ts";

// The first lint builds the type program of the whole repository.
const FIRST_PROGRAM_BUILD_MS = 60_000;
const LINTED_FILES_SCAN_MS = 60_000;

// On CI typescript-eslint builds each program once from disk, which never sees an appended snippet.
const WATCHED_PROGRAM: Linter.Config = {
    files: ["**/*.ts"],
    languageOptions: { parserOptions: { disallowAutomaticSingleRunInference: true } },
};

function createLinter(...overrides: Linter.Config[]): ESLint {
    return new ESLint({ cwd: REPO_ROOT, overrideConfig: [WATCHED_PROGRAM, ...overrides] });
}

const eslint = createLinter();

/** Appends to the real file, so the shared type program keeps every other file as it is. */
async function lintAppended(
    relativePath: string,
    snippet: string,
    linter: ESLint = eslint,
): Promise<Linter.LintMessage[]> {
    const filePath = join(REPO_ROOT, relativePath);
    const [result] = await linter.lintText(`${readFileSync(filePath, "utf8")}\n${snippet}\n`, {
        filePath,
    });
    return result.messages.filter((message) => message.ruleId === RULE);
}

describe(RULE, { timeout: FIRST_PROGRAM_BUILD_MS }, () => {
    it.each([
        {
            comparison: "an engine read into a local",
            file: VERIFICATION_SERVICE,
            snippet: `declare const guardedTarget: { readonly engine: ${ENGINE} };
const guardedEngine = guardedTarget.engine;
if (guardedEngine !== "c7") { void guardedEngine; }`,
            errors: 1,
        },
        {
            comparison: "an optional engine",
            file: DEPLOYMENT_PROMPTS,
            snippet: `declare const guardedTarget: { readonly engine: ${ENGINE} } | undefined;
if (guardedTarget?.engine !== "c7") { void guardedTarget; }`,
            errors: 1,
        },
        {
            comparison: "an engine in its home",
            file: "libs/modeler-types/src/engine.ts",
            snippet: `declare const guardedTarget: { readonly engine: ${ENGINE} } | undefined;
if (guardedTarget?.engine !== "c7") { void guardedTarget; }`,
            errors: 0,
        },
        {
            comparison: "a reference kind in a core service",
            file: DEPLOYMENT_SERVICE,
            snippet: `declare const guardedReference: { readonly kind: import("@miragon/bpmn-modeler-types").ReferenceKind };
if (guardedReference.kind === "form") { void guardedReference; }`,
            errors: 1,
        },
        {
            comparison: "a reference kind in its home",
            file: "libs/modeler-types/src/referenceKind.ts",
            snippet: `declare const guardedReference: { readonly kind: ReferenceKind };
if (guardedReference.kind === "form") { void guardedReference; }`,
            errors: 0,
        },
        {
            comparison: "an unregistered union",
            file: DEPLOYMENT_SERVICE,
            snippet: `declare const guardedAuth: { readonly type: "none" | "basic" | "oauth2" };
if (guardedAuth.type === "basic") { void guardedAuth; }`,
            errors: 0,
        },
        {
            comparison: "a raw string",
            file: DEPLOYMENT_SERVICE,
            snippet: `declare const guardedRaw: string;
if (guardedRaw === "c7") { void guardedRaw; }`,
            errors: 0,
        },
        {
            comparison: "each case of a switch over an engine",
            file: DEPLOYMENT_SERVICE,
            snippet: `declare const guardedConfig: { readonly engine: ${ENGINE} };
switch (guardedConfig.engine) { case "c7": break; case \`c8\`: break; }`,
            errors: 2,
        },
        {
            comparison: "a literal on the left",
            file: DEPLOYMENT_SERVICE,
            snippet: `declare const guardedEngine: ${ENGINE};
export const guardedIsC8 = "c8" == guardedEngine;`,
            errors: 1,
        },
        {
            comparison: "a type parameter constrained to an engine",
            file: CAPABILITY_MODULES,
            snippet: `export const guardedIsC8 = <E extends ${ENGINE}>(engine: E) => engine === "c8";`,
            errors: 1,
        },
    ])("reports $errors for $comparison", async ({ file, snippet, errors }) => {
        expect(await lintAppended(file, snippet)).toHaveLength(errors);
    });

    it("names the home and the fix", async () => {
        const [message] = await lintAppended(
            DEPLOYMENT_SERVICE,
            `declare const guardedEngine: ${ENGINE};
export const guardedIsC7 = guardedEngine === "c7";`,
        );
        expect(message.message).toContain("libs/modeler-types/src/engine.ts");
        expect(message.message).toContain("Add a capability");
    });

    it.each([
        {
            entry: "a module outside the program",
            guardedType: { name: "Engine", module: join(REPO_ROOT, "libs/missing.ts") },
            error: "is not in the TypeScript program",
        },
        {
            entry: "an export the module lacks",
            guardedType: { name: "Engines", module: ENGINE_HOME },
            error: "exports no Engines",
        },
        {
            entry: "a type that is no union of string literals",
            guardedType: { name: "EngineCapabilities", module: ENGINE_HOME },
            error: "is not a union of string literals",
        },
    ])("rejects a registry entry naming $entry", async ({ guardedType, error }) => {
        const linter = createLinter({
            files: ["**/*.ts"],
            rules: {
                [RULE]: [
                    "error",
                    { guardedTypes: [{ ...guardedType, homes: [], message: "unused" }] },
                ],
            },
        });
        await expect(lintAppended(DEPLOYMENT_SERVICE, "", linter)).rejects.toThrow(error);
    });
});

// Untracked files count too, so a new file fails locally before it is committed.
function lintedTypeScriptFiles(): string[] {
    return execFileSync(
        "git",
        ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "*.ts", "*.tsx"],
        { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    )
        .split("\0")
        .filter((path) => path !== "" && existsSync(join(REPO_ROOT, path)));
}

describe(`${RULE} disable directives`, { timeout: LINTED_FILES_SCAN_MS }, () => {
    it("name the issue that removes them and why", async () => {
        const unexplained: string[] = [];
        for (const path of lintedTypeScriptFiles()) {
            const filePath = join(REPO_ROOT, path);
            if (await eslint.isPathIgnored(filePath)) {
                continue;
            }
            const comments = readComments(path, readFileSync(filePath, "utf8"));
            for (const directive of directivesWithoutIssue(comments, RULE)) {
                unexplained.push(`${path}: ${directive}`);
            }
        }
        expect(unexplained).toEqual([]);
    });
});
