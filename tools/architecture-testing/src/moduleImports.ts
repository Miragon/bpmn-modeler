import * as ts from "typescript";

import { parseSource } from "./parseSource";

export interface ModuleImport {
    readonly specifier: string;
    readonly typeOnly: boolean;
}

/**
 * Walks the syntax tree, so comments (JSDoc included) and strings never read
 * as imports. The file name picks the scanner: `.tsx` needs the TSX one.
 */
export function readModuleImports(fileName: string, text: string): ModuleImport[] {
    const imports: ModuleImport[] = [];
    const visit = (node: ts.Node): void => {
        const moduleImport = moduleImportOf(node);
        if (moduleImport !== undefined) {
            imports.push(moduleImport);
        }
        ts.forEachChild(node, visit);
    };
    visit(parseSource(fileName, text));
    return imports;
}

function moduleImportOf(node: ts.Node): ModuleImport | undefined {
    if (ts.isImportDeclaration(node)) {
        return literalImport(node.moduleSpecifier, isTypeOnlyImport(node.importClause));
    }
    if (ts.isExportDeclaration(node)) {
        return literalImport(node.moduleSpecifier, isTypeOnlyExport(node));
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        return literalImport(node.moduleReference.expression, node.isTypeOnly);
    }
    if (ts.isCallExpression(node) && isImportOrRequire(node.expression)) {
        return literalImport(node.arguments[0], false);
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        return literalImport(node.argument.literal, true);
    }
    return undefined;
}

function literalImport(literal: ts.Node | undefined, typeOnly: boolean): ModuleImport | undefined {
    return literal !== undefined && ts.isStringLiteralLike(literal)
        ? { specifier: literal.text, typeOnly }
        : undefined;
}

/** Mirrors TypeScript's elision: only bindings that are all types vanish from the output. */
function isTypeOnlyImport(clause: ts.ImportClause | undefined): boolean {
    if (clause === undefined) {
        return false;
    }
    if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) {
        return true;
    }
    const bindings = clause.namedBindings;
    return (
        clause.name === undefined &&
        bindings !== undefined &&
        ts.isNamedImports(bindings) &&
        bindings.elements.length > 0 &&
        bindings.elements.every((element) => element.isTypeOnly)
    );
}

function isTypeOnlyExport(declaration: ts.ExportDeclaration): boolean {
    if (declaration.isTypeOnly) {
        return true;
    }
    const clause = declaration.exportClause;
    return (
        clause !== undefined &&
        ts.isNamedExports(clause) &&
        clause.elements.length > 0 &&
        clause.elements.every((element) => element.isTypeOnly)
    );
}

function isImportOrRequire(callee: ts.Expression): boolean {
    return (
        callee.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(callee) && callee.text === "require")
    );
}
