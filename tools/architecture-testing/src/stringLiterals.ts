import * as ts from "typescript";

import { parseSource } from "./parseSource";

export function readStringLiterals(fileName: string, text: string): string[] {
    const literals: string[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
            literals.push(node.text);
        }
        ts.forEachChild(node, visit);
    };
    visit(parseSource(fileName, text));
    return literals;
}
