import * as ts from "typescript";

import { isTypeOnlyExport } from "./moduleImports";
import { parseSource } from "./parseSource";

export interface RuntimeDeclaration {
    /** The keyword or construct, such as `const`, `class` or `export default`. */
    readonly form: string;
    readonly name: string;
    readonly line: number;
}

type RuntimeForm = Omit<RuntimeDeclaration, "line">;

const DECLARATION_FORMS: ReadonlyMap<ts.SyntaxKind, string> = new Map([
    [ts.SyntaxKind.FunctionDeclaration, "function"],
    [ts.SyntaxKind.ClassDeclaration, "class"],
    [ts.SyntaxKind.EnumDeclaration, "enum"],
    [ts.SyntaxKind.ModuleDeclaration, "namespace"],
    [ts.SyntaxKind.ImportEqualsDeclaration, "import ="],
]);

/**
 * The top-level statements that are not types: an allowlist of `import … from`
 * with an import clause, interfaces, type aliases and type-only exports. Syntax
 * only, so a re-export of an interface must say `export type` to pass.
 */
export function readRuntimeDeclarations(fileName: string, text: string): RuntimeDeclaration[] {
    const sourceFile = parseSource(fileName, text);
    return sourceFile.statements.flatMap((statement) => {
        const runtimeForm = runtimeFormOf(statement, sourceFile);
        if (runtimeForm === undefined) {
            return [];
        }
        const start = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile));
        return [{ ...runtimeForm, line: start.line + 1 }];
    });
}

function runtimeFormOf(
    statement: ts.Statement,
    sourceFile: ts.SourceFile,
): RuntimeForm | undefined {
    if (ts.isImportDeclaration(statement)) {
        return statement.importClause === undefined
            ? { form: "side-effect import", name: specifierOf(statement.moduleSpecifier) }
            : undefined;
    }
    if (ts.isExportDeclaration(statement)) {
        return valueExportOf(statement);
    }
    if (ts.isExportAssignment(statement)) {
        return { form: statement.isExportEquals ? "export =" : "export default", name: "default" };
    }
    if (isDefaultExport(statement)) {
        return { form: "export default", name: declaredName(statement) ?? "default" };
    }
    if (
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEmptyStatement(statement)
    ) {
        return undefined;
    }
    if (ts.isVariableStatement(statement)) {
        return variableFormOf(statement.declarationList, sourceFile);
    }
    return {
        form: DECLARATION_FORMS.get(statement.kind) ?? "statement",
        name: declaredName(statement) ?? firstLineOf(statement.getText(sourceFile)),
    };
}

function valueExportOf(statement: ts.ExportDeclaration): RuntimeForm | undefined {
    if (isTypeOnlyExport(statement)) {
        return undefined;
    }
    const clause = statement.exportClause;
    if (clause === undefined || ts.isNamespaceExport(clause)) {
        return { form: "export *", name: specifierOf(statement.moduleSpecifier) };
    }
    if (clause.elements.length === 0) {
        return statement.moduleSpecifier === undefined
            ? undefined
            : { form: "side-effect export", name: specifierOf(statement.moduleSpecifier) };
    }
    const valueNames = clause.elements
        .filter((element) => !element.isTypeOnly)
        .map((element) => element.name.text);
    return { form: "value export", name: valueNames.join(", ") };
}

// The keyword is read from the source: `await using` is two tokens.
function variableFormOf(list: ts.VariableDeclarationList, sourceFile: ts.SourceFile): RuntimeForm {
    const [first] = list.declarations;
    return {
        form: sourceFile.text.slice(list.getStart(sourceFile), first.getStart(sourceFile)).trim(),
        name: list.declarations.map(({ name }) => name.getText(sourceFile)).join(", "),
    };
}

function isDefaultExport(statement: ts.Statement): boolean {
    return (
        ts.canHaveModifiers(statement) &&
        (ts.getModifiers(statement) ?? []).some(
            (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
        )
    );
}

function declaredName(statement: ts.Statement): string | undefined {
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
        return statement.name?.text;
    }
    if (
        ts.isInterfaceDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isModuleDeclaration(statement) ||
        ts.isImportEqualsDeclaration(statement)
    ) {
        return statement.name.text;
    }
    return undefined;
}

function firstLineOf(text: string): string {
    return text.split("\n", 1)[0];
}

function specifierOf(specifier: ts.Expression | undefined): string {
    return specifier !== undefined && ts.isStringLiteral(specifier) ? specifier.text : "";
}
