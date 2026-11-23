import * as ts from "typescript";

import { parseSource } from "./parseSource";

export interface AsyncSyntax {
    readonly form: "async" | "await" | "for await";
    readonly line: number;
}

/** Async functions of any shape, `await` and `for await`, read from the syntax tree. */
export function readAsyncSyntax(fileName: string, text: string): AsyncSyntax[] {
    const sourceFile = parseSource(fileName, text);
    const found: AsyncSyntax[] = [];
    const visit = (node: ts.Node): void => {
        const form = asyncFormOf(node);
        if (form !== undefined) {
            const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
            found.push({ form, line: start.line + 1 });
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return found;
}

function asyncFormOf(node: ts.Node): AsyncSyntax["form"] | undefined {
    if (ts.isAwaitExpression(node)) {
        return "await";
    }
    if (ts.isForOfStatement(node) && node.awaitModifier !== undefined) {
        return "for await";
    }
    if (
        ts.isFunctionLike(node) &&
        ts.canHaveModifiers(node) &&
        ts.getModifiers(node)?.some(({ kind }) => kind === ts.SyntaxKind.AsyncKeyword)
    ) {
        return "async";
    }
    return undefined;
}
