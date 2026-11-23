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
 * answers and reasons from. Rolldown keeps a module-level statement that holds
 * an interpolated template literal or a concatenation, since building the
 * string may run code, or a property read or a spread, since it may run a
 * getter, and with it the table and its sample data. A reason libs/shared words is imported,
 * not spelled out again, so the previews cannot drift apart. Found by the
 * shared table type a module declares, so a new preview's table is checked
 * without a list.
 */
const REPO_ROOT = normalize(join(__dirname, "../../.."));
const SHARED_PACKAGE = "@miragon/bpmn-modeler-shared";
const TABLE_TYPE = "PreviewCommandTable";
const SHARED_REASONS_MODULE = "libs/shared/src/lib/previewIgnoreReasons.ts";

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

/**
 * Lines of template literals with a substitution, concatenations, property
 * reads and spreads (a getter may run) that run when the module loads.
 */
function moduleLevelKeptExpressions(fileName: string, text: string): number[] {
    const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
    const lines: number[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isFunctionLike(node) || isInstanceFieldInitializer(node) || isTypeOnly(node)) {
            return;
        }
        if (
            ts.isTemplateExpression(node) ||
            ts.isTaggedTemplateExpression(node) ||
            ts.isPropertyAccessExpression(node) ||
            ts.isElementAccessExpression(node) ||
            ts.isSpreadAssignment(node) ||
            ts.isSpreadElement(node) ||
            isConcatenation(node)
        ) {
            lines.push(lineOf(sourceFile, node));
            return;
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return lines;
}

function isConcatenation(node: ts.Node): boolean {
    return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken;
}

/** The string each exported constant of a module holds. */
function exportedStrings(fileName: string, text: string): string[] {
    const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
    return sourceFile.statements
        .filter(ts.isVariableStatement)
        .filter((statement) =>
            ts.getModifiers(statement)?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword),
        )
        .flatMap(({ declarationList }) => declarationList.declarations)
        .flatMap(({ initializer }) =>
            initializer !== undefined && ts.isStringLiteralLike(initializer)
                ? [initializer.text]
                : [],
        );
}

/** Lines of string literals, anywhere in the module, that spell out one of `wordings`. */
function literalsSpelling(fileName: string, text: string, wordings: ReadonlySet<string>): number[] {
    const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
    const lines: number[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isStringLiteralLike(node) && wordings.has(node.text)) {
            lines.push(lineOf(sourceFile, node));
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return lines;
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function isInstanceFieldInitializer(node: ts.Node): boolean {
    return (
        ts.isPropertyDeclaration(node) &&
        !(ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Static)
    );
}

/** An interface's `extends` and a class's `implements` name a type as a property read that never runs. */
function isTypeOnly(node: ts.Node): boolean {
    return (
        ts.isInterfaceDeclaration(node) ||
        (ts.isHeritageClause(node) && node.token === ts.SyntaxKind.ImplementsKeyword)
    );
}

const sources = readRepoSources();
const sourcesByPath = new Map(sources.map((source) => [source.path, source]));
const tables = requireMatches("preview command tables", sources.filter(declaresPreviewTable));
const sharedReasons: ReadonlySet<string> = new Set(
    requireMatches(
        `shared reasons in ${SHARED_REASONS_MODULE}`,
        exportedStrings(
            SHARED_REASONS_MODULE,
            sourcesByPath.get(SHARED_REASONS_MODULE)?.text ?? "",
        ),
    ),
);

describe("moduleLevelKeptExpressions", () => {
    it.each([
        ["a constant", "const REASON = `no ${thing}`;", [1]],
        ["a table row", "const TABLE = {\n  Row: { ignored: `no ${thing}` },\n};", [2]],
        ["a tagged template", "const REASON = tag`no editor`;", [1]],
        ["a static field", "class Sample {\n  static reason = `no ${thing}`;\n}", [2]],
    ])("reports an interpolation in %s", (_, text, lines) => {
        expect(moduleLevelKeptExpressions("sample.ts", text)).toEqual(lines);
    });

    it.each([
        ["a table row", "const TABLE = {\n  Row: { ignored: REASONS.noFile },\n};", [2]],
        ["a row taken from another table", 'const TABLE = {\n  Row: ROWS["Row"],\n};', [2]],
        ["a constant", "const REASON = REASONS.noFile;", [1]],
        ["a class's base", "class Sample extends Base.Shape {}", [1]],
    ])("reports a property read in %s", (_, text, lines) => {
        expect(moduleLevelKeptExpressions("sample.ts", text)).toEqual(lines);
    });

    it.each([
        ["a table row", 'const TABLE = {\n  Row: { ignored: REASON + "; local" },\n};', [2]],
        ["a constant", 'const REASON = SHARED + "; local";', [1]],
    ])("reports a concatenation in %s", (_, text, lines) => {
        expect(moduleLevelKeptExpressions("sample.ts", text)).toEqual(lines);
    });

    it.each([
        ["a table row", "const TABLE = {\n  ...ROWS,\n};", [2]],
        ["an array", "const ROWS = [\n  ...SHARED_ROWS,\n];", [2]],
    ])("reports a spread in %s", (_, text, lines) => {
        expect(moduleLevelKeptExpressions("sample.ts", text)).toEqual(lines);
    });

    it.each([
        ["a plain template", "const REASON = `no editor`;"],
        ["an arrow function", "const row = (type: string) => `${type} ignored`;"],
        ["a function", "function reason(type: string) {\n  return `${type} ignored`;\n}"],
        ["a method", "class Sample {\n  reason(type: string) { return `${type}`; }\n}"],
        ["an instance field", "class Sample {\n  reason = `no ${thing}`;\n}"],
        [
            "a row's handler",
            "const TABLE = {\n  Row: (_, preview) => preview.reply(REASONS.noFile),\n};",
        ],
        [
            "a row's handler that concatenates",
            'const TABLE = {\n  Row: ({ type }) => console.debug(type + " ignored"),\n};',
        ],
        [
            "a row's handler that spreads",
            "const TABLE = {\n  Row: (_, preview) => preview.reply({ ...ANSWER }),\n};",
        ],
        ["a type", "type Reason = typeof REASONS.noFile;\nlet reason: Reasons.NoFile;"],
        ["an interface", "interface Sample extends Base.Shape {}"],
        ["an implemented interface", "class Sample implements Ports.Port {}"],
    ])(
        "ignores an interpolation, a property read, a concatenation or a spread in %s, which runs only when called",
        (_, text) => {
            expect(moduleLevelKeptExpressions("sample.ts", text)).toEqual([]);
        },
    );
});

describe("exportedStrings", () => {
    it("reads the string each exported constant holds", () => {
        const text =
            'export const A = "no file";\nexport const B = `no editor`;\nconst C = "local";';

        expect(exportedStrings("sample.ts", text)).toEqual(["no file", "no editor"]);
    });
});

describe("literalsSpelling", () => {
    const wordings = new Set(["no file"]);

    it.each([
        ["a table row", 'const TABLE = {\n  Row: { ignored: "no file" },\n};', [2]],
        ["a plain template", "const REASON = `no file`;", [1]],
        ["a row's handler", 'const TABLE = {\n  Row: (_, p) => p.reply("no file"),\n};', [2]],
    ])("reports a shared wording spelled out in %s", (_, text, lines) => {
        expect(literalsSpelling("sample.ts", text, wordings)).toEqual(lines);
    });

    it("ignores a wording that only starts with a shared one", () => {
        expect(literalsSpelling("sample.ts", 'const R = "no file; local";', wordings)).toEqual([]);
    });
});

describe("preview command tables", () => {
    it("finds every table by the shared type it declares", () => {
        expect(tables.map(({ path }) => path)).toEqual(
            expect.arrayContaining([
                "apps/add-ons-webview/src/adapter/out/browserPreview/previewCommands.ts",
                "apps/bpmn-webview/src/adapter/out/browserPreview/previewCommands.ts",
                "apps/bpmn-webview/src/templateEditor/adapter/out/browserPreview/previewCommands.ts",
                "apps/deployment-webview/src/adapter/out/browserPreview/previewCommands.ts",
                "apps/dmn-webview/src/adapter/out/browserPreview/diffPanePreviewCommands.ts",
                "apps/dmn-webview/src/adapter/out/browserPreview/previewCommands.ts",
                "apps/form-webview/src/adapter/out/browserPreview/previewCommands.ts",
            ]),
        );
    });

    it.each(tables.map(({ path }) => path))(
        "keeps %s and the modules it imports out of the production bundle",
        (path) => {
            const keptExpressions = modulesReachedFrom(
                sourcesByPath.get(path)!,
                sourcesByPath,
            ).flatMap((module) =>
                moduleLevelKeptExpressions(module.path, module.text).map(
                    (line) => `${module.path}:${line}`,
                ),
            );

            expect(keptExpressions).toEqual([]);
        },
    );

    it.each(tables.map(({ path }) => path))(
        "takes every shared reason in %s and the modules it imports from libs/shared",
        (path) => {
            const copies = modulesReachedFrom(sourcesByPath.get(path)!, sourcesByPath).flatMap(
                (module) =>
                    literalsSpelling(module.path, module.text, sharedReasons).map(
                        (line) => `${module.path}:${line}`,
                    ),
            );

            expect(copies).toEqual([]);
        },
    );
});
