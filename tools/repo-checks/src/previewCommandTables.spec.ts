import {
    readModuleImports,
    readModuleSymbols,
    readSourceTree,
    readWorkspaces,
    requireMatches,
    resolveRelativeImport,
    type SourceFile,
} from "@miragon/architecture-testing";
import { existsSync } from "node:fs";
import { join, normalize } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * A browser preview's command table is module-level, and only the preview
 * host reads it, so the production bundle drops it with every module it takes
 * answers and reasons from. Rollup keeps a module-level statement that holds
 * an interpolated template literal, since building the string may run code,
 * and with it the table and its sample data. Found by the shared table type
 * a module declares, so a new preview's table is checked without a list.
 */
const REPO_ROOT = normalize(join(__dirname, "../../.."));
const SHARED_PACKAGE = "@miragon/bpmn-modeler-shared";
const TABLE_TYPE = "PreviewCommandTable";

function readRepoSources(): SourceFile[] {
    return readWorkspaces(REPO_ROOT).flatMap(({ dir }) => {
        const sourceRoot = join(REPO_ROOT, dir, "src");
        return existsSync(sourceRoot)
            ? readSourceTree(sourceRoot).map(({ path, text }) => ({
                  path: `${dir}/src/${path}`,
                  text,
              }))
            : [];
    });
}

function declaresPreviewTable({ path, text }: SourceFile): boolean {
    return readModuleSymbols(path, text).imports.some(
        ({ specifier, names }) => specifier === SHARED_PACKAGE && names?.includes(TABLE_TYPE),
    );
}

/** The table's module and every module it imports a value from, inside its workspace. */
function modulesReachedFrom(table: SourceFile, sourcesByPath: ReadonlyMap<string, SourceFile>) {
    const known = new Set(sourcesByPath.keys());
    const reached = new Map<string, SourceFile>();
    const pending = [table];
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
        if (reached.has(next.path)) {
            continue;
        }
        reached.set(next.path, next);
        for (const { specifier, typeOnly } of readModuleImports(next.path, next.text)) {
            const resolved = typeOnly
                ? undefined
                : resolveRelativeImport(next.path, specifier, known);
            const imported = resolved === undefined ? undefined : sourcesByPath.get(resolved);
            if (imported !== undefined) {
                pending.push(imported);
            }
        }
    }
    return [...reached.values()];
}

/** Lines of template literals with a substitution that run when the module loads. */
function moduleLevelInterpolations(fileName: string, text: string): number[] {
    const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
    const lines: number[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isFunctionLike(node) || isInstanceFieldInitializer(node)) {
            return;
        }
        if (ts.isTemplateExpression(node) || ts.isTaggedTemplateExpression(node)) {
            lines.push(
                sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
            );
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return lines;
}

function isInstanceFieldInitializer(node: ts.Node): boolean {
    return (
        ts.isPropertyDeclaration(node) &&
        !(ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Static)
    );
}

const sources = readRepoSources();
const sourcesByPath = new Map(sources.map((source) => [source.path, source]));
const tables = requireMatches("preview command tables", sources.filter(declaresPreviewTable));

describe("moduleLevelInterpolations", () => {
    it.each([
        ["a constant", "const REASON = `no ${thing}`;", [1]],
        ["a table row", "const TABLE = {\n  Row: { ignored: `no ${thing}` },\n};", [2]],
        ["a tagged template", "const REASON = tag`no editor`;", [1]],
        ["a static field", "class Sample {\n  static reason = `no ${thing}`;\n}", [2]],
    ])("reports an interpolation in %s", (_, text, lines) => {
        expect(moduleLevelInterpolations("sample.ts", text)).toEqual(lines);
    });

    it.each([
        ["a plain template", "const REASON = `no editor`;"],
        ["an arrow function", "const row = (type: string) => `${type} ignored`;"],
        ["a function", "function reason(type: string) {\n  return `${type} ignored`;\n}"],
        ["a method", "class Sample {\n  reason(type: string) { return `${type}`; }\n}"],
        ["an instance field", "class Sample {\n  reason = `no ${thing}`;\n}"],
    ])("ignores an interpolation in %s, which runs only when called", (_, text) => {
        expect(moduleLevelInterpolations("sample.ts", text)).toEqual([]);
    });
});

describe("preview command tables", () => {
    it("finds every table by the shared type it declares", () => {
        expect(tables.map(({ path }) => path)).toEqual(
            expect.arrayContaining([
                "apps/add-ons-webview/src/adapter/out/browserPreview/previewCommands.ts",
                "apps/bpmn-webview/src/adapter/out/browserPreview/previewCommands.ts",
                "apps/deployment-webview/src/adapter/out/browserPreview/previewCommands.ts",
            ]),
        );
    });

    it.each(tables.map(({ path }) => path))(
        "keeps %s and the modules it imports out of the production bundle",
        (path) => {
            const interpolations = modulesReachedFrom(
                sourcesByPath.get(path)!,
                sourcesByPath,
            ).flatMap((module) =>
                moduleLevelInterpolations(module.path, module.text).map(
                    (line) => `${module.path}:${line}`,
                ),
            );

            expect(interpolations).toEqual([]);
        },
    );
});
