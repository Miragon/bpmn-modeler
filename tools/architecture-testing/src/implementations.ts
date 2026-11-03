import * as ts from "typescript";

import { compareText } from "./compareText";
import { DeclarationFinder } from "./declarationGraph";
import { type ImportedBinding, importedBindings } from "./moduleSymbols";
import { parseSource } from "./parseSource";
import type { PathAlias } from "./pathAliases";
import type { SourceFile } from "./sourceTree";

export interface ClassImplementation {
    readonly path: string;
    readonly line: number;
    /** Unset for an anonymous class expression. */
    readonly className?: string;
    /** The files that declare its implemented interfaces; a global or unresolved one adds none. */
    readonly interfaceFiles: readonly string[];
}

export interface ImplementationOptions {
    readonly aliases?: readonly PathAlias[];
}

/** Syntax only, so a checkout without `node_modules` reads the same as the working tree. */
export function findImplementations(
    tree: readonly SourceFile[],
    { aliases = [] }: ImplementationOptions = {},
): ClassImplementation[] {
    const declarations = DeclarationFinder.of(tree, { aliases });
    return tree.flatMap(({ path, text }) => {
        const sourceFile = parseSource(path, text);
        const resolver = new InterfaceResolver(path, sourceFile, declarations);
        return implementingClasses(sourceFile).map((declaration) => {
            const interfaceFiles = [
                ...new Set(implementedExpressions(declaration).flatMap(resolver.declaringFiles)),
            ].sort(compareText);
            const line =
                sourceFile.getLineAndCharacterOfPosition(declaration.getStart(sourceFile)).line + 1;
            return declaration.name === undefined
                ? { path, line, interfaceFiles }
                : { path, line, className: declaration.name.text, interfaceFiles };
        });
    });
}

class InterfaceResolver {
    private readonly bindings: ReadonlyMap<string, ImportedBinding>;
    private readonly localNames: ReadonlySet<string>;

    constructor(
        private readonly path: string,
        sourceFile: ts.SourceFile,
        private readonly declarations: DeclarationFinder,
    ) {
        this.bindings = importedBindings(sourceFile);
        this.localNames = new Set(sourceFile.statements.flatMap(declaredTypeName));
    }

    readonly declaringFiles = (expression: ts.Expression): string[] => {
        if (ts.isIdentifier(expression)) {
            return this.identifierFiles(expression.text);
        }
        if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
            const binding = this.bindings.get(expression.expression.text);
            return binding === undefined || binding.imported !== undefined
                ? []
                : this.declarations.declaringFiles(
                      this.path,
                      binding.specifier,
                      expression.name.text,
                  );
        }
        return [];
    };

    private identifierFiles(name: string): string[] {
        const binding = this.bindings.get(name);
        if (binding === undefined) {
            return this.localNames.has(name) ? [this.path] : [];
        }
        return binding.imported === undefined
            ? []
            : this.declarations.declaringFiles(this.path, binding.specifier, binding.imported);
    }
}

function implementingClasses(sourceFile: ts.SourceFile): ts.ClassLikeDeclaration[] {
    const classes: ts.ClassLikeDeclaration[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isClassLike(node) && implementedExpressions(node).length > 0) {
            classes.push(node);
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return classes;
}

function implementedExpressions(declaration: ts.ClassLikeDeclaration): ts.Expression[] {
    return (declaration.heritageClauses ?? [])
        .filter(({ token }) => token === ts.SyntaxKind.ImplementsKeyword)
        .flatMap(({ types }) => types.map(({ expression }) => expression));
}

function declaredTypeName(statement: ts.Statement): string[] {
    return (ts.isInterfaceDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement)) &&
        statement.name !== undefined
        ? [statement.name.text]
        : [];
}
