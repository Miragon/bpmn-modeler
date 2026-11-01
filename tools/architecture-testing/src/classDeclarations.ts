import * as ts from "typescript";

import { parseSource } from "./parseSource";

export interface ClassDeclaration {
    readonly name: string | undefined;
    readonly implementedInterfaces: readonly string[];
}

export function readClassDeclarations(fileName: string, text: string): ClassDeclaration[] {
    const sourceFile = parseSource(fileName, text);
    const classes: ClassDeclaration[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isClassLike(node)) {
            classes.push({
                name: node.name?.text,
                implementedInterfaces: implementedInterfacesOf(node, sourceFile),
            });
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return classes;
}

function implementedInterfacesOf(
    declaration: ts.ClassLikeDeclaration,
    sourceFile: ts.SourceFile,
): string[] {
    return (declaration.heritageClauses ?? [])
        .filter(({ token }) => token === ts.SyntaxKind.ImplementsKeyword)
        .flatMap(({ types }) => types.map(({ expression }) => expression.getText(sourceFile)));
}
