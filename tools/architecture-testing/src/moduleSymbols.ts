import * as ts from "typescript";

import { parseSource } from "./parseSource";

export interface SymbolImport {
    readonly specifier: string;
    /** Unset for a namespace import, a dynamic import or a require: it reaches every export. */
    readonly names?: readonly string[];
}

export interface ReExport {
    readonly exported: string;
    readonly specifier: string;
    /** Unset for a namespace re-export: it reaches every export of the module. */
    readonly imported?: string;
}

export interface ModuleSymbols {
    readonly imports: readonly SymbolImport[];
    readonly declaredExports: readonly string[];
    readonly reExports: readonly ReExport[];
    readonly starReExports: readonly string[];
    /** No statement other than imports and re-exports: the file is a barrel. */
    readonly declaresNothing: boolean;
}

interface ImportedBinding {
    readonly specifier: string;
    readonly imported?: string;
}

export function readModuleSymbols(fileName: string, text: string): ModuleSymbols {
    const sourceFile = parseSource(fileName, text);
    const bindings = importedBindings(sourceFile);
    const declaredExports: string[] = [];
    const reExports: ReExport[] = [];
    const starReExports: string[] = [];
    let declaresNothing = true;

    for (const statement of sourceFile.statements) {
        if (ts.isExportDeclaration(statement)) {
            const exported = exportsOf(statement, bindings);
            declaredExports.push(...exported.declared);
            reExports.push(...exported.reExports);
            starReExports.push(...exported.stars);
            declaresNothing &&= exported.declared.length === 0;
        } else if (ts.isExportAssignment(statement)) {
            const binding = importedIdentifier(statement.expression, bindings);
            if (binding === undefined) {
                declaredExports.push("default");
                declaresNothing = false;
            } else {
                reExports.push({ exported: "default", ...binding });
            }
        } else if (!isImport(statement) && !ts.isEmptyStatement(statement)) {
            declaredExports.push(...exportedDeclarationNames(statement));
            declaresNothing = false;
        }
    }
    return {
        imports: readImports(sourceFile),
        declaredExports,
        reExports,
        starReExports,
        declaresNothing,
    };
}

function isImport(statement: ts.Statement): boolean {
    return (
        ts.isImportDeclaration(statement) ||
        (ts.isImportEqualsDeclaration(statement) &&
            ts.isExternalModuleReference(statement.moduleReference))
    );
}

function importedBindings(sourceFile: ts.SourceFile): Map<string, ImportedBinding> {
    const bindings = new Map<string, ImportedBinding>();
    for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
            continue;
        }
        const specifier = statement.moduleSpecifier.text;
        const clause = statement.importClause;
        if (clause?.name !== undefined) {
            bindings.set(clause.name.text, { specifier, imported: "default" });
        }
        const namedBindings = clause?.namedBindings;
        if (namedBindings !== undefined && ts.isNamespaceImport(namedBindings)) {
            bindings.set(namedBindings.name.text, { specifier });
        } else if (namedBindings !== undefined) {
            for (const element of namedBindings.elements) {
                bindings.set(element.name.text, {
                    specifier,
                    imported: (element.propertyName ?? element.name).text,
                });
            }
        }
    }
    return bindings;
}

function importedIdentifier(
    expression: ts.Expression,
    bindings: ReadonlyMap<string, ImportedBinding>,
): ImportedBinding | undefined {
    return ts.isIdentifier(expression) ? bindings.get(expression.text) : undefined;
}

function exportsOf(
    declaration: ts.ExportDeclaration,
    bindings: ReadonlyMap<string, ImportedBinding>,
): { declared: string[]; reExports: ReExport[]; stars: string[] } {
    // The grammar allows only a string literal after `from`, and requires one for `export *`.
    const specifier = (declaration.moduleSpecifier as ts.StringLiteral | undefined)?.text;
    const clause = declaration.exportClause;
    if (clause === undefined) {
        return { declared: [], reExports: [], stars: [specifier as string] };
    }
    if (ts.isNamespaceExport(clause)) {
        return {
            declared: [],
            reExports: [{ exported: clause.name.text, specifier: specifier as string }],
            stars: [],
        };
    }
    const declared: string[] = [];
    const reExports: ReExport[] = [];
    for (const element of clause.elements) {
        const exported = element.name.text;
        const local = (element.propertyName ?? element.name).text;
        const binding =
            specifier === undefined ? bindings.get(local) : { specifier, imported: local };
        if (binding === undefined) {
            declared.push(exported);
        } else {
            reExports.push({ exported, ...binding });
        }
    }
    return { declared, reExports, stars: [] };
}

function exportedDeclarationNames(statement: ts.Statement): string[] {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    if (!modifiers?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword)) {
        return [];
    }
    if (modifiers.some(({ kind }) => kind === ts.SyntaxKind.DefaultKeyword)) {
        return ["default"];
    }
    if (ts.isVariableStatement(statement)) {
        return statement.declarationList.declarations.flatMap(({ name }) => bindingNames(name));
    }
    const { name } = statement as ts.DeclarationStatement;
    return name !== undefined && ts.isIdentifier(name) ? [name.text] : [];
}

function bindingNames(name: ts.BindingName): string[] {
    if (ts.isIdentifier(name)) {
        return [name.text];
    }
    return name.elements.flatMap((element) =>
        ts.isOmittedExpression(element) ? [] : bindingNames(element.name),
    );
}

function readImports(sourceFile: ts.SourceFile): SymbolImport[] {
    const imports: SymbolImport[] = [];
    const visit = (node: ts.Node): void => {
        const symbolImport = symbolImportOf(node);
        if (symbolImport !== undefined) {
            imports.push(symbolImport);
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return imports;
}

function symbolImportOf(node: ts.Node): SymbolImport | undefined {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const names = importedNames(node.importClause);
        const specifier = node.moduleSpecifier.text;
        return names === undefined ? { specifier } : { specifier, names };
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        return wholeModule(node.moduleReference.expression);
    }
    if (ts.isCallExpression(node) && isImportOrRequire(node.expression)) {
        return wholeModule(node.arguments[0]);
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        return wholeModule(node.argument.literal);
    }
    return undefined;
}

function importedNames(clause: ts.ImportClause | undefined): string[] | undefined {
    if (clause === undefined) {
        return [];
    }
    const names = clause.name === undefined ? [] : ["default"];
    const bindings = clause.namedBindings;
    if (bindings === undefined) {
        return names;
    }
    if (ts.isNamespaceImport(bindings)) {
        return undefined;
    }
    return [
        ...names,
        ...bindings.elements.map((element) => (element.propertyName ?? element.name).text),
    ];
}

function wholeModule(literal: ts.Node | undefined): SymbolImport | undefined {
    return literal !== undefined && ts.isStringLiteralLike(literal)
        ? { specifier: literal.text }
        : undefined;
}

function isImportOrRequire(callee: ts.Expression): boolean {
    return (
        callee.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(callee) && callee.text === "require")
    );
}
